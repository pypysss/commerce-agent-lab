# 第二步后端代码详解：MVC 分层与 MyBatis XML 商品查询

> 历史说明（2026-10-18）：本文描述 `step-02 attempt-07` 的冻结状态，正文中的“当前/本轮”均指该次尝试。工程已继续 `step-03`，当前恢复请读 [step-03 HANDOFF](../step-03/HANDOFF-step-03.md) 并查询 SQLite。完整历史资料和证据见 [冻结目录](../history/step-02/attempt-07/)。当前不再维护 mindmap。


本课场景是“浏览上架商品、查看详情和库存”。后端按 MVC 分包，SQL 位于 resources 下的 XML，沿用 Lombok、Jakarta Validation 和数据库故障分类。前端统一管理展示语言的实现始于 attempt-06；本轮 step-02 attempt-07 只审校文档，业务代码未改。后端只返回现有 4 个稳定自定义错误码、HTTP 状态和固定安全中文兜底 message，不再承担业务语言协商。成功商品数据、schema、种子和 CNY 金额不变；日志及框架错误不扩大范围。前六轮均已归档，Java 38 项属于 attempt-06 历史结果，以下片段以当前源码为准；当前验收及完成状态以 SQLite/HANDOFF 为准。

## 1．先看业务输入与输出

```http
GET http://127.0.0.1:18080/api/v1/products?page=1&size=2
GET http://127.0.0.1:18080/api/v1/products/3
```

种子数据未修改时，列表 page=1、size=2 返回 2 项，total=3。每项结构如下：

```json
{"id":1,"sku":"COURSE-001","name":"Java 并发学习手册","description":"从线程安全到线程池，用可运行示例理解 JUC。","price":"129.90","availableStock":10}
```

商品 3 可浏览、库存为 0；商品不存在或未上架时返回 404：

```json
{"code":"PRODUCT_NOT_FOUND","message":"商品不存在或未上架"}
```

page=0、size=101、非整数 ID、非正 ID 返回 400。超过末页返回 200 和空 items，total 仍保留。数据库连接或资源暂不可用返回 503/DATABASE_UNAVAILABLE；错误 SQL、其他数据库操作内部异常返回 500/INTERNAL_ERROR。金额继续以字符串输出。

上面的自定义错误示例在不同 Accept-Language 下都返回同样的安全中文 message；无自定义 Content-Language/Vary: Accept-Language。页面按 code 统一翻译，商品字段不变。具体分工与新增错误流程见 [错误码与前端统一翻译](ERROR-CODE-I18N-GUIDE.md)。

机器可读契约在 `services/commerce/openapi.yaml`。当前 ID 是 JSON 数字；未来可能超过 JavaScript 安全整数范围时，应先统一字符串契约。

## 2．目录为什么这样拆

下面的树从 `services/commerce` 开始：

```text
src/main/
├─ java/lab/commerce/
│  ├─ CommerceApplication.java
│  ├─ controller/ProductController.java
│  ├─ service/ProductService.java
│  ├─ service/impl/ProductServiceImpl.java
│  ├─ mapper/ProductMapper.java
│  ├─ entity/Product.java
│  ├─ dto/ProductStockRow.java
│  ├─ vo/ProductView.java
│  ├─ vo/ProductPage.java
│  └─ exception/
│     ├─ ProductNotFoundException.java
│     └─ GlobalExceptionHandler.java
└─ resources/
   ├─ application.yml
   └─ mapper/ProductMapper.xml
```

| 位置 | 职责 | 不应承担的工作 |
|---|---|---|
| controller | URL、HTTP 参数与响应 | 不拼 SQL、不处理 JDBC |
| service | 声明业务操作 | 不放数据库表结构 |
| service/impl | 参数规则、事务、业务编排 | 不直接解析 HTTP |
| mapper | 声明数据访问方法 | 不放 HTTP 状态 |
| resources/mapper | SQL、参数与结果映射 | 不判断用户登录状态 |
| entity | 对应持久化商品结构 | 不直接充当所有 API 响应 |
| dto | 承接跨表查询结果 | 不假装是一张数据库表 |
| vo | 定义前端可见的响应结构 | 不暴露数据库全部字段 |
| exception | 业务异常与 HTTP 异常转换 | 不在响应中泄露驱动错误 |

这是按 MVC 思路组织的分层后端。前端由 Vue 渲染，所以没有服务端 HTML 模板目录；vo 是 JSON 返回模型。没有为了目录对称新增空的库存 Controller、通用 BaseMapper 或 BaseService。

## 3．一次请求的完整调用链

```text
Vue fetch
  → Vite /api 开发代理
  → Tomcat → DispatcherServlet → HandlerMapping
  → 参数转换与 Jakarta Validation（失败先返回 400）
  → ProductController.list(page,size)
  → ProductService 接口所注入的 Spring 事务代理
  → ProductServiceImpl.list(page,size)
  → ProductMapper 动态代理
  → namespace + 方法名定位 XML 中的 MappedStatement
  → SqlSessionTemplate → Executor → JDBC PreparedStatement
  → Hikari 连接池 → MySQL product LEFT JOIN inventory
  → ResultSet → ProductStockRow（内含 Product）
  → ProductView / ProductPage → JSON → Vue 响应式更新
```

接口与实现分离后，Controller 仍调用本进程对象；不是多一次网络请求。接口定义契约，实现类负责执行，事务与 Mapper 代理也在本进程工作。

## 4．Spring 怎样找到接口的实现

启动入口仍为：

```java
@SpringBootApplication
public class CommerceApplication {
    public static void main(String[] args) {
        SpringApplication.run(CommerceApplication.class, args);
    }
}
```

组件扫描从 lab.commerce 向下查找。@RestController 注册 Controller，@Service 注册实现类，@RestControllerAdvice 注册全局异常处理器。接口没有 @Service，不会因为名字叫 Service 就自动产生业务实现。

```java
public interface ProductService {
    ProductPage list(int page, int size);
    ProductView detail(long id);
}
```

实现类实现该接口，并通过构造器接收 Mapper。Controller 依赖接口，实际源码使用 Lombok：

```java
@RestController
@RequestMapping("/api/v1/products")
@RequiredArgsConstructor
public class ProductController {
    private final ProductService service;
    // 路由方法见下一节。
}
```

`@RequiredArgsConstructor`在编译时为未初始化的 final 字段生成必要参数构造器；这里生成的效果相当于 `public ProductController(ProductService service) { this.service = service; }`。ProductServiceImpl 同样用它接收 final ProductMapper。Spring 运行时看到的是已编译的构造器，按类型找到唯一实现 Bean，再将其代理注入。单个构造器不需要额外写 @Autowired。将来增加第二个实现时才需要 @Qualifier 等选择，否则可能出现 NoUniqueBeanDefinitionException；当前无需增加限定符。

Lombok 不是运行时替你反射调用 setter 或创建业务对象：它通过编译期 annotation processor 补充构造器和方法。pom.xml 使用 Boot BOM 管理的 Lombok 1.18.46，scope 为 provided；maven-compiler-plugin 显式声明 annotationProcessorPaths，Boot 打包时排除 Lombok 运行依赖。IDE 也需要正确识别 Lombok 并启用 annotation processing；IDE 红线与 Maven 编译结果应分别检查，不能为了消除编辑器红线重复手写同签名方法。

默认 Bean 通常是 singleton，多个请求并发访问一个实例。请求参数应放局部变量，不保存为“当前页”“当前用户”字段。

## 5．Controller：把 HTTP 交给业务服务

```java
@RestController
@RequestMapping("/api/v1/products")
@RequiredArgsConstructor
public class ProductController {
    private final ProductService service;

    @GetMapping
    public ProductPage list(@RequestParam(defaultValue = "1") @Min(1) @Max(100_000) int page,
                            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return service.list(page, size);
    }

    @GetMapping("/{id}")
    public ProductView detail(@PathVariable @Positive long id) {
        return service.detail(id);
    }
}
```

Tomcat 解析 HTTP，DispatcherServlet 按路由找到处理器，参数解析器将 query 字符串转为 int。page=abc 会因类型转换失败，在进入 Service 前返回 400。

`@Min/@Max/@Positive`来自 `jakarta.validation.constraints`，由 starter-validation 提供运行时校验能力；Boot BOM 当前管理 Hibernate Validator 9.1.3.Final。Spring MVC 的内建方法参数校验在调用 Controller 方法前执行：page=0、size=101、id=0 等抛出 HandlerMethodValidationException，由统一处理器转换成 400/INVALID_ARGUMENT。因此这些非法 HTTP 请求不会先进入 Service 事务、不会为了验证参数借数据库连接。

Controller 没有加类级 `@Validated`，这是有意使用 Spring MVC 内建方法校验；不要再叠加 AOP 方法校验后假设异常类型和调用顺序仍完全相同。这里是后端运行时验证，和前端 TypeScript 在运行前检查类型属于不同边界。

@RestController 让返回对象通过 JSON 消息转换器进入响应体。Boot 4 使用的 Jackson 包与 Boot 3 常见示例不同，本项目测试采用 tools.jackson.*，不要混用旧依赖。

## 6．Service 实现：分页、事务、存在性判断

核心业务保持一致：

```java
@Transactional(readOnly = true)
public ProductPage list(int page, int size) {
    if (page < 1 || page > 100_000 || size < 1 || size > 100) {
        throw new IllegalArgumentException("page 必须在 1..100000，size 必须在 1..100");
    }
    int offset = (page - 1) * size;
    long total = mapper.countActive();
    var items = mapper.findPage(size, offset).stream().map(ProductView::from).toList();
    return new ProductPage(items, page, size, total);
}
```

page 从 1 开始，OFFSET 从 0 开始；page=2、size=20 对应 offset=20。限制范围使最大 offset=9,999,900，避免 int 溢出和一次无限读取。

@Transactional 放在实现类公共方法上。Controller 经 Spring Bean 代理调用，代理进入事务再调用方法体；直接 new ProductServiceImpl(fakeMapper) 的单测没有事务代理，只证明业务计算。

本课 MySQL 默认 REPEATABLE READ 下，同一事务的 count 与列表一致性读看到同一快照。以后改成 READ COMMITTED 就不能继续承诺两条 SELECT 使用同一快照。

readOnly=true 不能替代权限；数据库账号只有 SELECT 权限才真正限制写入。HTTP 参数现在先经 Controller 的 Jakarta Validation，非法值不进入事务。Service 中仍保留范围判断，防止将来由定时任务、其他 Java 组件直接传入非法参数；但内部调用若经过事务代理，事务仍先于 Service 方法体，这层防御不能代替入口校验。直接 new 实现类的单测只证明不会调用 Mapper，不代表它运行过 Spring 事务。

详情逻辑先校验 ID，再查 Mapper；查不到返回 null，Service 抛 ProductNotFoundException，全局异常处理器返回 404。

## 7．Entity、DTO、VO 为什么不同

### Entity：商品表的持久化形状

entity/Product.java 是 JavaBean，实际源码如下：

```java
@Getter
@Setter
@NoArgsConstructor
public class Product {
    private long id;
    private String sku;
    private String name;
    private String description;
    private BigDecimal price;
    private String status;
}
```

`@Getter/@Setter`为字段生成访问方法，`@NoArgsConstructor`显式生成无参构造。MyBatis 仍然实例化普通 JavaBean 并写入属性；编译后的 getPrice()/setPrice(...) 等方法真实存在，XML 无需改成 Lombok 专用语法。这里 entity 是持久化层命名，不是 JPA，没有 @Entity。

### DTO：这一次跨表查询的形状

```java
@Getter
@Setter
@NoArgsConstructor
public class ProductStockRow {
    private long productId;
    private Product product;
    private int availableStock;
}
```

库存来自 inventory，不是 product 字段；所以用 DTO 内嵌 Product 并携带库存。productId 是联查结果行标识，供嵌套结果映射区分不同商品；不额外暴露给前端。

DTO 在这里用于数据访问与业务服务之间传输结果，不代表它必须是 HTTP 请求体。

没有统一改成 `@Data`：它还会生成 equals/hashCode/toString 等当前不需要的方法，可能把关联对象纳入比较或日志。本项目只引入消除现有样板代码所需的 Lombok 注解；VO 已使用 Java record，继续保留 record，不增加无实际需求的工具库或对象复制框架。

### VO：接口对外承诺的形状

实际转换代码：

```java
public record ProductView(long id, String sku, String name, String description,
                          String price, int availableStock) {
    public static ProductView from(ProductStockRow row) {
        var product = row.getProduct();
        return new ProductView(product.getId(), product.getSku(), product.getName(), product.getDescription(),
                product.getPrice().toPlainString(), row.getAvailableStock());
    }
}
```

ProductPage 包装 items/page/size/total。数据库 status 用于筛选，不直接暴露给页面；内部包名改变也不改变 JSON。

以后商品表增加成本价，不会因直接返回 Entity 而自动暴露。这里只为表结构、联查结果、外部响应三种实际差异建对象，不机械复制每一层的相同字段。

## 8．Mapper 接口与 XML 怎样绑定

接口只保留声明与参数名：

```java
@Mapper
public interface ProductMapper {
    List<ProductStockRow> findPage(@Param("limit") int limit, @Param("offset") int offset);
    ProductStockRow findById(@Param("id") long id);
    long countActive();
}
```

XML namespace 必须等于接口全名，select id 必须等于方法名：

```xml
<mapper namespace="lab.commerce.mapper.ProductMapper">
    <!-- findPage、findById、countActive 对应同名 Java 方法。 -->
</mapper>
```

完整语句标识为 lab.commerce.mapper.ProductMapper.findPage。MapperProxy 根据方法查找 MappedStatement；SqlSessionTemplate 协调 Spring 事务管理的 SqlSession，再由 Executor、StatementHandler、ParameterHandler 执行 JDBC。

application.yml 明确加载 XML：

```yaml
mybatis:
  mapper-locations: classpath*:mapper/**/*.xml
  configuration:
    default-statement-timeout: 3
```

源码 resources/mapper/ProductMapper.xml 构建后成为 classpath 的 mapper/ProductMapper.xml；Boot JAR 中通常为 BOOT-INF/classes/mapper/ProductMapper.xml。它不依赖启动终端的当前目录。XML 启动时解析，正常查询不逐次从磁盘重读 XML。

## 9．XML：显式结果映射、片段与自定义联查

### 商品映射与嵌套 association

实际 ProductEntityMap 对商品表逐列映射：

```xml
<resultMap id="ProductEntityMap" type="lab.commerce.entity.Product" autoMapping="false">
    <id property="id" column="id"/>
    <result property="sku" column="sku"/>
    <result property="name" column="name"/>
    <result property="description" column="description"/>
    <result property="price" column="price" javaType="java.math.BigDecimal" jdbcType="DECIMAL"/>
    <result property="status" column="status"/>
</resultMap>

<resultMap id="ProductStockRowMap" type="lab.commerce.dto.ProductStockRow" autoMapping="false">
    <id property="productId" column="product_id"/>
    <result property="availableStock" column="available_stock"/>
    <association property="product" resultMap="ProductEntityMap" columnPrefix="product_"/>
</resultMap>
```

ProductColumns 将 p.id、p.name 等分别命名为 product_id、product_name。association 的 columnPrefix="product_" 给 ProductEntityMap 的列名添加前缀；因此内层 column="id" 实际读取 product_id，避免联表同名列混淆。

MyBatis 创建 JavaBean 并写属性。column 是结果列名，property 是 Java 属性；比如 available_stock 进入 setAvailableStock(...)。autoMapping=false 明确禁止未声明列自动进入对象。

顶层 `<id property="productId" ...>` 为每个联查行建立商品身份。嵌套结果处理会使用行标识合并结果；不能只靠库存数判断不同商品，否则两个商品库存相同可能被合并。这里的 productId 对映射有意义，不是新的 API 字段。

association 表示同一行结果中的内嵌对象；没有 select 属性，不会给每个商品额外执行一次查询，不产生这种形式的 N+1。

### SQL 片段：自定义 SQL 的统一入口

```xml
<sql id="ProductColumns">
    p.id AS product_id,
    p.sku AS product_sku,
    p.name AS product_name,
    p.description AS product_description,
    p.price AS product_price,
    p.status AS product_status
</sql>
<sql id="ActiveProductCondition">
    p.status = 'ACTIVE'
</sql>
<sql id="ActiveProductWithInventory">
    FROM product p
    LEFT JOIN inventory i ON i.product_id = p.id
    WHERE <include refid="ActiveProductCondition"/>
</sql>
```

字段、上架条件和 JOIN 分别命名。列表、详情复用字段与 JOIN；count 复用上架条件，减少修改一处却遗漏另一处的风险。

实际列表查询：

```xml
<select id="findPage" resultMap="ProductStockRowMap">
    SELECT <include refid="ProductColumns"/>,
           COALESCE(i.available_stock, 0) AS available_stock
    <include refid="ActiveProductWithInventory"/>
    ORDER BY p.id
    LIMIT #{limit} OFFSET #{offset}
</select>
```

LEFT JOIN 保留没有库存行的商品，COALESCE 将 NULL 变为 0。inventory.product_id 是主键，保证每商品最多一行库存，否则列表可能重复而 count 不重复。这是已经实现的自定义商品库存联查，不是单表 CRUD 生成器。

详情复用上述片段后增加 AND p.id = #{id}。count 查询单独统计 product 的 ACTIVE 记录，不需要读取所有商品再在 Java 里统计。

### 参数占位符与 SQL 注入

#{limit} 变为 JDBC 问号占位符，由 ParameterHandler 按类型绑定。${...} 是文本替换，不能原样接受用户输入作为条件或排序列。排序列不能用问号当作 SQL 标识符绑定，未来开放排序时需要允许值映射到固定列名。

JDBC PreparedStatement 不代表必然使用 MySQL 服务端预处理；驱动也可在客户端安全处理。当前连接未强制 useServerPrepStmts=true。

### 动态 SQL 扩展示例：未实现

后续真有搜索需求时，可新增查询参数对象并使用：

```xml
<!-- 教学示例：当前 ProductMapper.xml 没有 keyword 搜索能力。 -->
<where>
    p.status = 'ACTIVE'
    <if test="keyword != null and keyword != ''">
        AND p.name LIKE CONCAT('%', #{keyword}, '%')
    </if>
</where>
```

where 按需生成 WHERE 并处理开头多余的 AND/OR；if 的 test 在构建 SQL 时判断。完成搜索还要改 Controller、Service、Mapper 参数，并保证 count 与列表条件一致、明确 LIKE 通配符语义、验证索引。不能仅写一段 XML 就声称已经实现搜索。

## 10．金额、编码、连接池与网络

金额链路是 DECIMAL(12,2) → BigDecimal → toPlainString() → JSON 字符串 → Vue 展示。DECIMAL 最多 10 位整数、2 位小数；不能中途转 double 再转回。toPlainString 保留 129.90 这类小数表示并避免指数形式。

数据库使用 utf8mb4，初始化客户端与 JDBC 也应正确设置编码；HTTP 编码不能修复已写错的数据。

Hikari 每进程最多 5 条连接，借连接等待上限 2 秒。close 通常是归还池，物理连接可复用。10 个副本可能使用 50 条连接，要先计算总预算。借连接等待、TCP 建连超时、socket 读取超时、SQL 超时是不同计时器，不能据一个 2000ms 配置保证整个 HTTP 请求 2 秒内完成。

本机默认 Java 连接 127.0.0.1:13306 原生 MySQL。实际连接由 state/runtime.json 的 mysql_port、state/mysql-connection.json 的数据库名和账号，经过 Use-LabEnvironment.ps1 的 Set-LabDatabaseEnvironment 组成 COMMERCE_DB_URL/USER/PASSWORD，再供 application.yml 读取。修改端口后要重新启动相关进程，已有进程不会自动重读 PowerShell 环境。以后放进容器，localhost 指容器本身，要换服务 DNS 和容器端口。本轮 Docker 引擎未验证就绪，没有容器联调结论。

## 11．异常响应怎样保持稳定

exception/GlobalExceptionHandler.java 使用 `@Slf4j` 生成日志字段；attempt-06 已移除 MessageSource 依赖及该类不再需要的 `@RequiredArgsConstructor`。它处理既有自定义错误的 400、404、500、503；不声明处理所有框架错误。参数类型转换失败与 HandlerMethodValidationException 都返回 400/INVALID_ARGUMENT。数据库错误仍按资源故障与内部操作错误分类：

```java
@ExceptionHandler({DataAccessResourceFailureException.class,
        TransientDataAccessResourceException.class, CannotCreateTransactionException.class})
ResponseEntity<ApiError> databaseUnavailable(RuntimeException exception) {
    logDatabaseFailure(exception, true);
    return error(HttpStatus.SERVICE_UNAVAILABLE, "DATABASE_UNAVAILABLE", "数据服务暂不可用，请稍后重试");
}

@ExceptionHandler(DataAccessException.class)
ResponseEntity<ApiError> databaseOperationFailed(DataAccessException exception) {
    logDatabaseFailure(exception, false);
    return error(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务内部错误，请稍后联系维护人员");
}

private ResponseEntity<ApiError> error(HttpStatus status, String code, String message) {
    return ResponseEntity.status(status).body(new ApiError(code, message));
}
```

Spring 根据实际异常类型选择更具体的处理方法。连接失败、瞬时资源不可用、事务无法创建保持 503；BadSqlGrammarException 等其他 DataAccessException 进入通用数据库处理分支返回 500。错误 SQL 通常需要修改代码，不能靠用户反复刷新修复。此处没有新增捕获所有 Exception 的兜底处理器。

具体 handler 给出固定安全中文文案，不读取 Locale 或原始 exception.getMessage()。现有 4 个 code、状态和 message 不随 Accept-Language 改变；前端 App.vue 按 code/apiCode 选三语词条，由 computed 随当前语言重新计算。后端没有自定义语言资源或语言响应头，日志仍保留受控诊断 metadata。

日志辅助方法只取异常类型、最深根因类型，以及根因为 SQLException 时的 SQLState/vendorCode；资源失败记 WARN，内部操作错误记 ERROR。实际输出结构是：

```text
Database failure: type=BadSqlGrammarException, rootCause=SQLException, sqlState=42000, vendorCode=1064
```

上面是测试夹具的预期诊断格式，不代表线上发生了该错误。代码不记录原异常 message、完整堆栈、SQL、JDBC URL 或凭据，避免驱动错误里的秘密进入日志；浏览器只收到 code/message。生产仍需请求 ID、受控日志访问和数据库监控辅助定位，metadata 不能代替完整可观测性。

## 12．正常运行与失败实验

```powershell
Set-Location E:\ai_agent_learning\java_python
.\scripts\Build-Lab.ps1
.\scripts\Run-Lab.ps1
```

Build-Lab 执行 `mvn -Pmysql-it clean verify`，清掉旧包路径/旧 XML 编译产物后，运行单元测试与真实 MySQL 集成测试，再执行 npm ci、npm test 和 Vue 类型检查/构建。不要在服务运行期间覆盖其 JAR；修改代码后先停止自有启动窗口、构建，再启动。分开执行 Maven 前需使用项目脚本加载工具链和连接环境，不要把真实密码写入命令或文档。

Run-Lab 先认证项目 MySQL，再等待商品 HTTP API 和包含 Vue 入口的 HTML 就绪后打印访问地址；仅端口有人监听不能证明是本项目服务。它复用已存在服务时，也会检查实际响应；退出时仅停止本次启动器拥有的进程。

attempt-03 曾执行 26 项 Java 测试及真实停库恢复，其证据已移入 docs/history/step-02/attempt-03。attempt-06 验证了 Service/异常安全、不同 Accept-Language 下自定义 status/code/message 恒定、真实 MySQL/API、JAR 不含已删除的语言类和资源，以及前端请求与界面语言解耦、错误即时翻译；Java 38 项及对应接口、浏览器结果见 docs/history/step-02/attempt-06。上述均为历史，不当作本轮重新执行；本轮只审校文档，当前检查范围和真实结果见 HANDOFF/evidence。未重跑的停库恢复不因此标为本轮通过。

可以直接观察：

```powershell
Invoke-WebRequest 'http://127.0.0.1:18080/api/v1/products?page=0' -SkipHttpErrorCheck
Invoke-WebRequest 'http://127.0.0.1:18080/api/v1/products/abc' -SkipHttpErrorCheck
Invoke-WebRequest 'http://127.0.0.1:18080/api/v1/products?page=100000&size=100'
```

前两项预期 400，最后预期 200 空数组。记录状态、code、items、total。

下面是隔离副本中的教学实验建议，尚不能视作本轮逐一实际执行：

| 人为改动 | 预期现象 | 定位入口 |
|---|---|---|
| namespace 改为旧包名 | 方法找不到语句或接口绑定错误 | namespace 与接口全名 |
| findById 的 id 改名 | 调用详情出现 Invalid bound statement | 方法名与 select id |
| XML 资源未打包/未加载 | 查询无法绑定 | mapper-locations、JAR 内资源 |
| SQL 的 < 原样写入 XML | XML 解析失败 | 使用 &lt; 或局部 CDATA |
| alias 与 resultMap 不一致 | 字段为空或映射异常 | column、columnPrefix、Java 属性 |

不要在当前数据库数据目录做破坏实验。if/where 等动态标签不能整体放进 CDATA 后仍期待 MyBatis 识别为动态标签。

## 13．生产风险与升级入口

| 问题 | 当前行为 | 后续入口 |
|---|---|---|
| 字段增加 | 显式列与 resultMap | 迁移、映射、API 分别评审 |
| XML 漏打包 | 标准 resources | 检查 JAR 并运行最终产物 |
| 一对多联查 | 当前库存一对一 | 分页主表、去重与 collection 映射 |
| N+1 | 当前单条 JOIN，无嵌套 select | 增加关联时观察 SQL 次数 |
| 深分页、count 成本 | 小规模 OFFSET | 执行计划与延迟指导游标方案 |
| SQL 注入 | #{...} 绑定值 | 排序字段白名单 |
| 库存过时 | 只读展示 | 下单事务与条件扣减 |
| 连接池耗尽 | 每副本上限 5 条 | 总预算、等待与慢 SQL 指标 |
| 改 XML 后页面仍旧 | 运行旧 JAR | 重新构建并重启，核对版本 |
| Lombok 方法 IDE 报红 | 编译期生成构造器/setter | 检查注解处理与 IDE 支持，再核对 Maven 编译 |
| 非法参数依赖数据库才报错 | Controller 先约束校验 | 新增入口时同步定义校验，保留 Service 防御 |
| SQL 错误被当作临时故障 | 资源故障503，其他数据库内部错误500 | 根据受控日志metadata定位并修复 |
| TLS、账号、权限 | 本地回环与 SELECT 账号 | Secret、TLS、鉴权与资源权限 |

XML 改善 SQL 组织与审阅便利性，性能取决于查询、索引、数据量和执行计划。订单、鉴权、缓存、Flask、RAG/OCR 和 Agent 都尚未实现。

## 14．小练习

1. 从 Controller 的 ProductService 字段追到 ProductServiceImpl，解释谁创建实现对象、事务代理何时生效。
2. 找到 ProductEntityMap 的每个 column 与 setter，画出 ResultSet → DTO 内嵌 Product 的过程。
3. 两个商品库存同为 10 时，解释顶层 productId 的 id 映射为什么仍能区分商品。
4. 找到列表与详情复用的 SQL 片段；设计 keyword 搜索改动清单，保证 count 条件一致，暂不实现。
5. 检查最终 JAR 中的 mapper XML，解释源码目录、classpath 路径与 JAR 路径。
6. 对照 Product 的 Lombok 源码与编译后的 class，解释 setter 为何真实存在、为什么无需运行时 Lombok 包。
7. 请求 page=0，沿着 MVC 参数校验到 400 响应追踪；再解释为什么 Service 中仍保留范围判断。

## 官方延伸阅读与来源

业务源码由本项目编写。框架机制参见官方资料，本轮运行结论以本地 evidence 为准。

- [MyBatis XML：参数、SQL 片段与结果映射](https://mybatis.org/mybatis-3/sqlmap-xml.html)
- [MyBatis 动态 SQL](https://mybatis.org/mybatis-3/dynamic-sql.html)
- [MyBatis Spring Boot Starter 配置](https://mybatis.org/spring-boot-starter/mybatis-spring-boot-autoconfigure/)
- [Spring 构造器依赖注入](https://docs.spring.io/spring-framework/reference/core/beans/dependencies/factory-collaborators.html)
- [Spring 声明式事务](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative.html)
- [Spring MVC 参数校验](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-validation.html)
- [Lombok 构造器注解](https://projectlombok.org/features/constructor)
- [Lombok Getter/Setter](https://projectlombok.org/features/GetterSetter)
- [Lombok Maven 配置](https://projectlombok.org/setup/maven)
