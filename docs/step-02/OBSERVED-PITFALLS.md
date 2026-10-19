# 实际问题：请求边界与 MVC/XML 排错入口

> 历史说明（2026-10-18）：本文描述 `step-02 attempt-07` 的冻结状态，正文中的“当前/本轮”均指该次尝试。工程已继续 `step-03`，当前恢复请读 [step-03 HANDOFF](../step-03/HANDOFF-step-03.md) 并查询 SQLite。完整历史资料和证据见 [冻结目录](../history/step-02/attempt-07/)。当前不再维护 mindmap。


本文区分当前设计边界、已发生问题和教学排查项。前端统一展示语言的实现始于 attempt-06；本轮 step-02 attempt-07 只审校文档，业务代码未改。下文请求层、MVC/XML 和启动问题分别标明其历史 attempt，Java 38 项等旧证据不冒充当前重跑，当前验收见 HANDOFF/evidence。

## 0．attempt-03 请求层问题：响应体失败与类型断言

阅读旧 getJson 发现：try/catch 只包住 fetch，后面的 response.json().catch(() => null) 会将读取阶段的超时、取消、连接中断与坏 JSON 混为 null；return body as T 则不检查成功 JSON 的结构。这些是从旧源码确认的边界，不宣称已经发生过生产事故。

当前 fetch 与 response.text 放在同一 try 中，主动取消保留原异常，10 秒超时通过 timeoutSignal.aborted 分类。JSON.parse 独立处理：非 2xx 坏 JSON 保留 HTTP 状态；2xx 坏 JSON 报解析问题，合法 JSON 的错误结构报契约问题。isProduct/isProductPage 通过后才返回数据。

特别区分：JSON.parse 只解析语法，类型谓词中的 JavaScript 才在运行时检查字段；TypeScript interface 不会自动生成检查。空数组是合法空状态，price 必须保持字符串，safe integer 防止接受不可靠的大整数。

普通契约与错误分支使用请求替身，头部/正文阶段取消和超时使用本机临时 HTTP 服务器及真实 fetch；超时仍断言配置为 10 秒，测试等待缩短为 150 毫秒。它们不冒充真实 Java/MySQL 验收。逐段源码、输出与练习见 [getJson 专课](GETJSON-CODE-GUIDE.md)。当前价格正则沿用 OpenAPI，不限制小数位上限；response.text 没有实现响应体体积限制。

## 1．attempt-02 映射设计：嵌套结果需要行身份

商品表映射到 entity.Product，联查映射到 dto.ProductStockRow。有嵌套 association 时，MyBatis 根据映射生成行标识，用于关联和合并结果。当前明确配置：

```xml
<id property="productId" column="product_id"/>
<result property="availableStock" column="available_stock"/>
<association property="product" resultMap="ProductEntityMap" columnPrefix="product_"/>
```

不能只凭库存数识别商品。不同商品库存同为 10 时必须保留两项；productId 是内部映射字段，对外 VO 契约不变。内层 ProductEntityMap 的 id/name 等列通过 product_ 前缀读取 product_id/product_name。

attempt-02 的真实 MySQL 集成新增 XML 来源、association 和同库存不折叠检查，原始结果在 docs/history/step-02/attempt-02/evidence/step-02-mvc-maven.txt。不把该防护设计描述为已发生过的生产丢数据。

## 2．XML 常见排错顺序（教学排查项）

| 现象 | 优先核对 |
|---|---|
| Invalid bound statement | namespace=接口全名，id=方法名，资源是否加载 |
| IDE 能找到 XML，JAR 找不到 | resources、mapper-locations、JAR 内 BOOT-INF/classes/mapper |
| 中文或金额异常 | 数据库/初始化/JDBC 编码、DECIMAL→BigDecimal→字符串 |
| 内嵌商品为空或列串值 | resultMap、association、columnPrefix 与 alias |
| 不同商品被合并 | 顶层与内层 id 映射、JOIN 基数 |
| XML 解析失败 | <、& 转义、闭合标签、CDATA 范围、日志行号 |
| 修改 XML 无效 | 是否重新构建、重启了正确端口上的 JAR |
| 筛选后 total 与列表不符 | count 与列表是否复用条件 |

这些是恢复入口，未逐项破坏配置运行。#{...} 绑定值，${...} 直接拼文本；XML 不会自动让任意文本拼接安全。动态 if/where 搜索尚未实现，只作为讲解示例。

## 3．历史实际问题：Windows 动态 Agent 具名管道

attempt-01 首次服务单测中 Mockito inline mock maker 动态加载 Byte Buddy Agent。Surefire dumpstream 记录：`[error][attach] could not open (5) pipe ... to send result of operation load`。这是当时沙箱限制的证据，不代表业务错误或所有 Windows 都无法用 Mockito。

配置 mock-maker-proxy 的尝试仍进入 inline 加载，未记成功。最终单测使用普通 Java FakeMapper 返回预设值、记录参数并保留断言；attempt-02 沿用并迁至 ServiceImpl 测试包。

Spring 集成测试默认监听器也可能初始化 Mockito；本项目没有 mock bean，因此只保留所需依赖注入与上下文清理监听器。真实 Spring、HTTP、XML Mapper、JDBC、MySQL 仍由 mysql-it 验证，没有用 FakeMapper 代替真实集成链路。

普通接口实现返回预设结果，MyBatis 代理根据 XML 执行 SQL，目的与行为不同。接口分离后，Controller 依赖业务接口，普通单测直接构造业务实现。

## 4．历史实际问题：Maven 仓库切换

依赖 POM 可能声明额外仓库。infra/maven-settings.xml 将本工程发布依赖统一到 Maven Central。仓库 ID 变化会重新核实缓存来源，首次额外日志和耗时属于缓存核实，后续复用本地缓存。没有改变全局 Maven 配置。

## 5．历史实际问题：后台进程生命周期

短自动化命令创建的子进程可能被宿主回收。Start-Process 成功不证明持续可访问，需要实际连接/HTTP 验证。Run-Lab.ps1 持续运行，管理自己创建的 MySQL/Java/Vite，退出时清理这些进程。

## 6．历史实际问题：工作目录与旧编译产物

相对产物路径和哈希迁移后仍有效；工具链、MySQL 数据路径和缓存配置需更新。迁移前确认 MySQL 退出，禁止移动正在写的数据目录。

改包名后 target/classes 可能残留旧类；attempt-02 使用 clean verify，并检查最终 JAR 包含新 MVC 类、不包含旧 api/product 类。历史源码归档不进入运行 classpath。

## 7．attempt-03 历史实际问题：启动脚本编辑中的文件访问异常

attempt-03 编辑 Run-Lab.ps1 时，读取曾返回 AccessDenied，随后文件暂时不存在。原因尚未证实，不能据此推断为杀毒软件删除或某个安全设置引起，也没有修改安全设置作为修复。

Run-Lab.ps1 在 attempt-03 已恢复可读取并通过语法检查。PowerShell 保留进程管理，HTTP 就绪等待独立放在 scripts/wait_for_services.py，用 Python 标准库 urllib 检查商品响应和 HTML 入口。attempt-03 当时进一步实际验证了启动该轮 JAR、正确入口返回 0、HTML 冒充 API 返回 1，且启动源码持续存在，冻结证据见 docs/history/step-02/attempt-03/evidence/step-02-launcher.json；这是历史验证，不作为本轮重新执行的结果。

## 8．attempt-06：Network 的中文 message 与界面翻译是两层

用户认为后端管理语言过于繁琐，已明确由前端统一管理展示。后端保留稳定 code、HTTP 状态和固定安全中文 message；页面按 code/apiCode 翻译。旧的 LocaleConfig、三份消息资源、MessageSource 依赖及显式语言头均已移除。当前具体源码及下位 agent 接入流程见 [错误码与前端统一翻译](ERROR-CODE-I18N-GUIDE.md)。

| 容易混淆的点 | 当前处理与定位 |
|---|---|
| 页面是日语，Network 的自定义错误 message 仍中文 | 这是当前约定；检查页面是否按 apiCode 映射三语词条，不要恢复后端翻译 |
| Network 仍有 Accept-Language | 浏览器可能按自身偏好自动发送；api.ts 不显式设置，也不读取 useI18n，后端自定义错误不依此变化 |
| 保存了翻译字符串，换语言后旧错误不变 | 保存结构化错误对象，以 computed/errorText/t 在展示时翻译 |
| 后端增加 code，页面却只显示通用提示 | 同步 messages.ts 的三语键及 App.vue 的 apiCode 分支；未知码兜底必须保留 |
| 想直接显示服务端 message 省事 | 会破坏即时切换和安全边界；UI 继续展示本地词条，后端也保留安全固定文案 |
| 商品名没有随语言切换 | 商品原文是已确认范围；不是词典缺失，也不改种子或金额 |
| Java 改动只等待 Vite 热更新 | 重新构建并重启 Java；前端热更新不能替换运行中的 JAR |
| 任意路由 404 没有自定义 code | 本课只处理已有具体异常；前端通用 HTTP 提示覆盖，无须新增所有 Exception 捕获 |

attempt-06 的实际测试、失败与未执行项目以 docs/history/step-02/attempt-06 中的 HANDOFF/evidence 为准；本轮文档检查以当前 HANDOFF/evidence 为准，教学预期不能记作实际事故。

attempt-06 首次浏览器检查真实失败：测试误以为Playwright改URL后的路由拦截请求，其allHeaders必然与普通请求一样报告原生Accept-Language。实际元数据在该场景可缺失此头，修正测试区分普通请求与拦截请求，应用代码没有因此改动。初次失败保留于 docs/history/step-02/attempt-06/evidence/step-02-frontend-only-browser-initial-failed.json；该轮最终浏览器重跑通过。fetch初始化参数只有Accept由单元测试直接检查，不能将拦截元数据当成浏览器线上实际发包的完整证明。

## 9．attempt-05 已冻结历史：两次测试夹具失败

attempt-05 曾实现后端报错语言协商。第一次 Maven 失败来自 MockHttpServletRequest.setPreferredLocales 自动添加语言头，未真正构造“无头”场景；第二次来自语言地区标签 fr-fr 与 fr-FR 的大小写硬比较。两次仅调整测试夹具，历史最终 Java 49 项和前端 45 项通过。

这些日志、代码和记录保留在 docs/history/step-02/attempt-05，不能当成当前重跑，也不能据旧讲解恢复已被用户撤销的语言职责。移除功能后仍保存历史，便于复盘选择与验证过程。
