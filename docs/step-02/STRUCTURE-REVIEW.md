# 第二步结构检查与优化说明

> 历史说明（2026-10-18）：本文描述 `step-02 attempt-07` 的冻结状态，正文中的“当前/本轮”均指该次尝试。工程已继续 `step-03`，当前恢复请读 [step-03 HANDOFF](../step-03/HANDOFF-step-03.md) 并查询 SQLite。完整历史资料和证据见 [冻结目录](../history/step-02/attempt-07/)。当前不再维护 mindmap。


工程：`E:\ai_agent_learning\java_python`，当前为 step-02 attempt-07，只审校文档，业务代码未改。本文主体保留 attempt-03 结构优化的依据；attempt-04 增加三语界面，attempt-05 曾加入后端语言协商，前端统一管理展示语言的实现始于 attempt-06。Java 38 项属于 attempt-06 历史结果，详见 [界面多语言](I18N-CODE-GUIDE.md) 与 [错误码与前端翻译](ERROR-CODE-I18N-GUIDE.md)。当前验收以 [HANDOFF](HANDOFF-step-02.md) 与 SQLite 对应 attempt 的证据为准。

## 1．业务场景与目录边界

当前目标仍是“用 Vue 查询真实 MySQL 商品”。前端、Java、Python 学习工具和基础设施放在一个工程内，便于沿请求链学习、统一验收和交接。没有为了未来 Agent 预先拆出多个独立仓库或引入分布式框架。

```text
java_python/
├─ web/                  Vue + TypeScript，当前商品页面
├─ services/
│  ├─ commerce/          Java MVC + MyBatis XML 业务服务
│  └─ agent/             智能服务预留，尚未实现
├─ infra/                SQL 和本项目 Maven 配置
├─ learning/             SQLite 学习台账程序和课程
├─ scripts/              构建、启动、生成视图及验证
├─ docs/                 讲解、HANDOFF；历史图已冻结
│  └─ history/           每次验收的源码/产物快照
├─ evidence/             当前验收证据
├─ state/                本机凭据、日志、学习数据库
└─ work/                 工具链、依赖缓存和真实 MySQL 数据
```

目录划分沿用用户已经确认的教学工程，不迁移可正常工作的业务源码。特别注意 work/mysql-data 保存真实数据库，不能整体当缓存清空。

## 2．前端：把错误关在 API 边界

App.vue 负责状态和视图，api.ts 负责请求与数据可信边界，style.css 负责展示。当前一页业务不需要额外拆出通用请求框架、状态管理库和多个抽象层。

getJson 发现两个具体边界后做了修正：

| 原边界 | 当前处理 | 作用 |
|---|---|---|
| fetch 完成后，正文读取仍可能失败 | fetch/response.text 放在同一 try | 正文超时与连接失败能够分类 |
| response.json 的 catch 转成 null | JSON.parse 独立 catch | 区分坏 JSON、HTTP 错误与读取失败 |
| body as T 不检查字段 | validate + 类型谓词 | 错误结构在写入 ref 前被拒绝 |
| 泛化库可能掩盖实际请求流程 | 使用原生 fetch，无新依赖 | 能直接学习 Promise、AbortSignal 和运行时检查 |

逐段代码、输出和实验见 [getJson 专课](GETJSON-CODE-GUIDE.md)。页面的 AbortController 与请求序号仍保留：前者停止旧请求等待，后者阻止过期结果覆盖当前选择，两者解决的问题不同。

## 3．Java：保持 MVC/XML，减少机械代码

```text
controller → service 接口 → service/impl
                                ↓
mapper 接口 → resources/mapper XML → MySQL
                                ↓
entity / dto → vo → JSON
```

Entity 只对应商品表，DTO 承接商品与库存联查，VO 定义 HTTP 响应。XML 保持 namespace、resultMap、association、SQL 片段和参数绑定，便于后续自定义查询。

### Lombok 用在什么位置

| 注解 | 使用位置 | 编译后实际生成什么 |
|---|---|---|
| @Getter / @Setter | entity.Product、dto.ProductStockRow | JavaBean getter/setter，MyBatis 映射仍可调用 |
| @NoArgsConstructor | 同上 | 无参构造器，便于结果对象创建 |
| @RequiredArgsConstructor | Controller、ServiceImpl | final 字段的构造器，Spring 继续使用构造器注入 |
| @Slf4j | 统一异常处理 | org.slf4j.Logger 日志字段 |

Lombok 是编译期注解处理器，生成的成员进入 class 文件，不是运行时通过反射临时添加。pom 使用 provided 依赖、显式 annotationProcessorPaths，并从成品 JAR 排除 Lombok。版本由现有 Spring Boot parent/BOM 的 lombok.version 管理，当前解析为 1.18.46，不为追新单独覆盖。attempt-03 当时只增加 Lombok 和 spring-boot-starter-validation 两项直接依赖，没有改变 MyBatis XML 数据访问方式。

attempt-03 当时的 JAR 检查验证了生成访问方法和构造器存在、XML 字节与该轮源码一致、无旧包残留、Lombok 不在运行 JAR；Validation 运行库正常打包。冻结证据为 docs/history/step-02/attempt-03/evidence/step-02-optimization-jar.json，不作为本轮重新执行的结果。

这里选择具体注解而不直接给所有类加 @Data：当前只需要构造器和访问方法，不需要顺手改变实体 equals/hashCode/toString 的行为。VO 继续采用已有 record，不再叠加同一组功能。

### Validation 用在什么边界

Controller 的 page 使用 @Min(1)/@Max(100_000)，size 使用 @Min(1)/@Max(100)，id 使用 @Positive。spring-boot-starter-validation 提供实际校验实现，HTTP 参数进入业务前拒绝非法范围，统一返回 400/INVALID_ARGUMENT。

这里使用 Spring MVC 自带的方法参数校验，不在 Controller 类上额外加 @Validated。Service 的边界检查保留，防止未来由非 HTTP 调用入口绕过规则。两处检查分别保护 HTTP 边界和业务入口，不把 Bean Validation 当作数据库约束或权限控制。

## 4．异常：区分可恢复资源故障和服务端错误

数据库连接/事务创建等资源故障继续返回 503/DATABASE_UNAVAILABLE；错误 SQL、映射等 DataAccessException 返回 500/INTERNAL_ERROR。二者不能都解释为“数据库暂时不可用”，否则会引导用户反复重试无法恢复的代码错误。

异常处理记录异常类型、根因类型、SQLState 和数据库错误码等元数据，不记录可能包含 SQL/JDBC URL/凭据的完整 message 或堆栈。前端只收到公开的 code/message，不知道内部 SQL。

这改善了当前排错信号，不代表已经完成生产日志平台、链路追踪和告警体系。

## 5．构建、启动与产物门禁

attempt-03 当时修正了三个此前容易失真的点，以下设计仍保留：

1. Build-Lab 从 clean verify 开始，避免 Java 包名/注解变化后 target 残留旧类继续进入 JAR；前端 npm test 也进入同一构建入口。
2. Use-LabEnvironment 的 Set-LabDatabaseEnvironment 统一读取数据库配置，供 Build/RunApi/RunLab 使用。Web 端口和 API 代理目标从 runtime.json 导出，RunWeb 和 Vite 不再重复 CLI 端口；RunLab 负责进程管理，通过 Start-MySQL 检查账号认证，再调用 wait_for_services.py 检查 HTTP readiness 后公布入口。
3. learning.ledger.complete 除检查必需产物是否登记，还验证当前 attempt 每种附加产物最终登记记录的存在和哈希。删除或篡改附加文档会拒绝完成，失败事务回滚；新增聚焦测试覆盖这两种情形。

端口监听只能证明某个进程接收连接；数据库账号认证、实际 HTTP 内容和构建结果分别提供更贴近任务的证据。各项实际执行结果以 HANDOFF 为准，不能只凭脚本中存在检查逻辑就宣称运行通过。

wait_for_services.py 使用 Python 标准库 urllib，不增加第三方依赖。它轮询商品 API 与页面，检查商品响应为对象且 items 是数组、page 为 1，页面含 Vue 挂载入口；两者满足后返回 0，超过等待窗口返回 1，使 PowerShell 抛出启动失败。它只检查服务入口，不执行浏览器 JavaScript，也不替代真实页面验收和完整 API 契约测试。

attempt-03 当时的配置解析验证了默认 Web 端口 15173/API 18080，以及临时环境覆盖 Web 17173/API 19080；preview 的代理也随之继承。脚本检查验证了数据库端口覆盖及账号来源一致，没有修改本机 runtime 配置。当时真实 Run-Lab 启动该轮 JAR，API/HTML 就绪返回 0；把 HTML 地址当作 API 时返回 1。冻结证据分别在 docs/history/step-02/attempt-03/evidence 下的 step-02-configuration.json、step-02-environment-checks.json、step-02-launcher.json；本轮未据此宣称重跑。

## 6．正常结果与失败实验

正常结果保持：真实商品列表、详情、字符串金额、零库存、空页，以及分页和不存在商品的明确响应。

失败实验分别验证自己的边界：

- 前端错误响应、坏 JSON、字段错误和取消/超时，使用请求层测试与浏览器故障注入。
- Java 参数校验、异常分类、XML 映射，使用单元和真实 MySQL 集成测试。
- 台账中的附加产物删除或篡改，应阻止完成，并且事务不留下半登记状态。
- 启动脚本需要真实 HTTP readiness，而不是只看 Start-Process 或 TCP 端口。

这些实验的通过数量、证据文件以及未验证项目统一记录在 HANDOFF，不在多份文档中手工复制不同的统计。

## 7．生产问题与保留边界

当前保持单个 Java 业务服务和单个 Vue 页面。订单、消息、缓存、Spring Cloud、Flask/RAG/OCR/Agent、Docker/K8s 与 CI/CD 按课程递进，当时尚未接入的模块在已冻结思维视图标为未实现；当前不再维护图。

Lombok 不验证业务，XML 不自动解决 N+1 或慢 SQL，前端校验不替代服务端权限与数据约束。当前仍是本机学习环境，未完成生产 TLS、认证、高可用、备份恢复演练或云部署。

## 8．小练习

1. 找到 Product 的 setter：为什么源码没写，MyBatis 仍能调用？在 IDE 反编译或 javap 中验证。
2. 解释 Controller 的 @Min 和 Service 的手工边界检查分别保护什么入口。
3. 对比 503 和 500 日志，哪些信息便于排错，哪些信息不应给浏览器？
4. 在隔离副本中修改一个已登记的附加 Markdown 文件，再尝试完成步骤，解释为什么哈希门禁应该拒绝。
5. 说明为什么“网页端口有监听”不能证明 API 或数据库已经就绪。

## attempt-03 至 06 历史实测与 attempt-07 文档审校

attempt-03 的 Java 26 项、请求层 Node 32 项、台账 12 项全部通过，合计 70 项；真实停库时非法 page/id 返回 400，正常查询返回 503，恢复后 200。当时交互图有 63 个独立节点。以上是已归档的历史成绩，本轮不冒充重新执行。

attempt-04 新增本地类型化词典和共享语言状态，不新增依赖；其 43 项前端测试、类型检查/构建、真实 API/MySQL 和中英日桌面/手机结果属于历史。该轮源码/登记产物与证据已归档至 attempt-04，93 个文件及 32 条历史 artifact 路径已核对。

attempt-05 曾使用 Spring 原生 MessageSource/AcceptHeaderLocaleResolver，历史 Java 49 项、前端 45 项及两次测试夹具失败均冻结在 attempt-05，不属于当前成绩。attempt-06 按用户决定移除 LocaleConfig/测试、三份 messages 资源、spring.messages 配置、handler 的 Locale/MessageSource/自定义语言头，以及 api.ts 对 useI18n/显式 Accept-Language 的依赖。后端保留稳定 code/status/固定安全中文 message，前端沿用词典和结构化错误即时翻译；当时没有新增依赖或改动商品/数据库。attempt-06 的 Java 38 项和前端 45 项属于历史；本轮 attempt-07 只核对文档与现有实现，业务代码未改。根 AGENTS 的新增报错流程保持后端契约 + 前端三语词条/映射；该次检查、完整源码快照、历史思维视图和完成事务见冻结 HANDOFF/证据及 SQLite；当前不再生成思维视图。

业务库名固定 commerce，变更连接文件中的数据库名不会自动迁移或初始化新库。
