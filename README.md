# Commerce Agent Lab · 订单库存与智能售后学习工程

当前工作目录：`E:\ai_agent_learning\java_python`。当前开发 step-03 attempt-01：登录、本人订单、事务扣库存、幂等下单与模拟支付。前两步已完成；第二步 attempt-07 已冻结。展示语言继续由前端管理。实际完成状态和本轮证据以 SQLite 台账及最新 HANDOFF 为准。

## 新对话从这里恢复

先读 [项目操作约定](AGENTS.md)、[开发上下文](docs/DEVELOPMENT-CONTEXT.md) 和 [最新 HANDOFF](docs/step-03/HANDOFF-step-03.md)，再执行 `python -m learning.ledger status --lessons`。SQLite 当前 attempt 是进度权威，不要每换一次聊天就重新初始化、reopen 或重做已完成步骤。本轮源码完整快照、文件哈希、代码讲解和验收证据随产物登记入库。

用户已取消 mind-map。旧活动地图与生成/检查脚本已删除，后续交付以代码详解和 HANDOFF 为学习入口；历史冻结记录保留用于核对台账。

页面右上角可切换 **中文 / English / 日本語**，默认中文，选择保存在当前站点的 localStorage。页面文字、加载/空/错误提示、ARIA 标签与浏览器标题一起切换；商品名称和描述保留数据库原文，金额仍为人民币 CNY，不做换汇。学习实现见 [多语言代码讲解](docs/step-02/I18N-CODE-GUIDE.md)。

所有展示语言由前端词典统一管理。Java 对既有 PRODUCT_NOT_FOUND、INVALID_ARGUMENT、DATABASE_UNAVAILABLE、INTERNAL_ERROR 返回固定安全中文 message，供直接 API 调用者兜底；页面根据 code 翻译并支持已显示错误立即切换。请求层不再依赖语言状态或显式设置 Accept-Language；浏览器原生语言头不影响这些自定义错误。原理与下一位 agent 的新增报错流程见 [错误码与前端统一翻译](docs/step-02/ERROR-CODE-I18N-GUIDE.md)。

本次子 Agent 审查的范围、发现和修正见 [文档与项目一致性审查](docs/step-02/DOCUMENTATION-AUDIT.md)。当前实现、历史成绩和后续计划分别标注，避免新对话按过时说明恢复功能。

## 立即运行

在项目根目录的PowerShell执行，并保持窗口打开：

```powershell
.\scripts\Run-Lab.ps1
```

页面：**http://127.0.0.1:15173/**；API：`http://127.0.0.1:18080/api/v1/products`。
修改代码后先停止自有启动窗口，再执行 `.\scripts\Build-Lab.ps1`，完成后重新启动。构建脚本依次执行数据库初始化、Maven `clean verify`（含真实 MySQL 集成测试）、npm ci、npm test、Vue 类型检查与构建。clean 用于避免重构后旧 class/XML 留在最终产物。
也可分别用`Start-MySQL.ps1 -Foreground`、`Run-Api.ps1`、`Run-Web.ps1`在三个终端启动。

第三步首次使用先运行构建脚本，增量创建订单/用户表和受限应用账号；初始化不会重置已有商品库存。演示用户 `alice`、`bob` 的随机登录密码仅保存在本机 [state/demo-users.json](state/demo-users.json)，请在本地查看，不复制到日志或提交中。页面下方登录，选商品详情与数量后创建订单，再执行模拟支付。订单接口为 `/api/v1/orders`，只返回当前会话用户的最近100单；所有写请求验证 CSRF。详细机制见 [第三步代码讲解](docs/step-03/CODE-GUIDE.md)。

Run-Lab 会认证项目 MySQL，并等待商品 API 和 Vue HTML 实际可读后输出访问入口；退出时只停止它自己创建的进程。上面的地址是默认配置，变更端口后以启动脚本打印的地址为准。

单独检查前端请求逻辑和类型：

```powershell
npm --prefix web test
npm --prefix web run build
```

测试使用 Node 自带 test runner，包含请求层和多语言状态/词典测试，不额外安装测试框架；build 先由 vue-tsc 做类型检查，再由 Vite 构建。

## 本机配置从哪里生效

`state/runtime.json` 保存工具路径和 mysql/api/web 端口，`state/mysql-connection.json` 保存原 reader/初始化管理员配置；第三步应用账号位于 `state/mysql-writer.json`。这些密码配置不应提交或分享，state 已整体忽略。

`Use-LabEnvironment.ps1`读取 runtime 配置，只为当前 PowerShell 和子进程导出环境；`Set-LabDatabaseEnvironment`在数据库就绪后从 writer 配置导出 COMMERCE_DB_URL、COMMERCE_DB_USER、COMMERCE_DB_PASSWORD。Run-Api、Run-Lab、Build-Lab 使用同一套应用连接来源，application.yml 读取这些变量。真实集成测试额外使用独立 fixture 管理连接，测试结束即清除其环境变量；应用连接仍受限。

Vue 通过 Vite 读取 COMMERCE_WEB_PORT 和 COMMERCE_API_TARGET，分别决定开发端口和 `/api`代理目标。变量由项目脚本从 runtime 配置导出；直接运行 `npm run dev`时使用15173/18080默认值，若修改了runtime端口，应先加载 Use-LabEnvironment 或使用 Run-Web。Vite的服务端变量未使用 VITE_ 前缀，不会作为客户端公开配置自动注入页面。已有进程不会自动重读本机 JSON，改配置后需重启。

## 后端目录：按 MVC 职责阅读

```text
services/
├─ commerce/                         Java 商品业务服务
│  ├─ src/main/java/lab/commerce/
│  │  ├─ CommerceApplication.java     Spring Boot 入口
│  │  ├─ controller/                 HTTP 路由与参数
│  │  ├─ service/                    业务接口
│  │  │  └─ impl/                    业务实现与事务
│  │  ├─ mapper/                     MyBatis 接口与 @Param
│  │  ├─ entity/                     商品表 JavaBean
│  │  ├─ dto/                        商品库存联查结果
│  │  ├─ vo/                         API 返回模型
│  │  └─ exception/                  业务异常与全局处理
│  ├─ src/main/resources/
│  │  ├─ application.yml             XML 路径、数据源、连接池
│  │  └─ mapper/ProductMapper.xml    SQL、resultMap、association
│  ├─ src/test/                      单元与真实 MySQL 集成测试
│  ├─ openapi.yaml                   API 契约
│  └─ pom.xml                        依赖与构建
└─ agent/                            Python Flask/RAG/Agent 后续入口，未实现
```

当前调用链：Controller → ProductService 接口 → ProductServiceImpl → Mapper 接口 → XML → MySQL。
Product 对应商品表；ProductStockRow 承接联查；ProductView/ProductPage 控制对外 JSON。Entity/DTO 用 Lombok @Getter/@Setter/@NoArgsConstructor，Controller/ServiceImpl 用 @RequiredArgsConstructor；这是编译期生成普通方法，VO 保留 Java record。Lombok 使用 provided、显式 annotation processor，并从 Boot 运行 JAR 排除，不新增通用工具库。

Controller 用 Jakarta Validation 的 @Min/@Max/@Positive，在进入 Service 事务前返回非法HTTP参数的400；Service 仍保留内部调用防御。数据库资源不可用返回503，错误SQL等内部数据库异常返回500；该异常处理器的响应和诊断日志不输出SQL/连接凭据。
SQL 入口是 [ProductMapper.xml](services/commerce/src/main/resources/mapper/ProductMapper.xml)，已有自定义 LEFT JOIN；后续动态 SQL 可在此扩展。
详解见 [第二步后端讲解](docs/step-02/BACKEND-CODE-GUIDE.md)。原注解版在 attempt-01，MVC/XML 在 attempt-02，请求层与 Java 便捷依赖优化在 attempt-03，三语界面在 attempt-04，曾有的后端语言协商在 attempt-05；源码与产物均已冻结到 docs/history/step-02，不恢复旧语言约定。

## 建议阅读顺序

1. [课程当前进度](ROADMAP.md)
2. [第三步：登录、订单与库存讲解](docs/step-03/CODE-GUIDE.md) / [HANDOFF](docs/step-03/HANDOFF-step-03.md)
3. [第一步：环境与SQLite讲解](docs/step-01/CODE-GUIDE.md) / [第二步：Java与Vue详细讲解](docs/step-02/CODE-GUIDE.md)
4. [本次实际遇到的坑](docs/step-02/OBSERVED-PITFALLS.md) / [迁移记录](docs/MIGRATION.md)

学习文档直接在编辑器打开，开发服务器提供业务页面。

面向 Java 开发者的渐进项目：Vue 3 → Spring Boot / MyBatis / MySQL → Redis →
RocketMQ / Kafka → PostgreSQL 报表 → Spring Cloud → Python Flask → RAG / OCR → Agent。

每一步交付：可运行增量、详细代码讲解、失败实验、HANDOFF。
完整课程与进度保存在 `state/learning.sqlite3`，文档正文也会入库。
当前状态以台账和 `ROADMAP.md` 为准，不以预留目录判断功能完成。

## 学习入口

- `learning/plan.md`：完整项目计划。
- `learning/curriculum.json`：阶段及小课的机器可读定义。
- `docs/step-01/`：环境、SQLite 台账、第一步交接。
- `docs/step-02/`：商品查询链路与第二步交接。
- `docs/step-03/`：登录、本人订单、库存事务与模拟支付。

本机端口计划：MySQL `127.0.0.1:13306`，Java `127.0.0.1:18080`，Vue `127.0.0.1:15173`。
工具链使用本项目的配置和工作目录，不修改系统 PATH，不注册数据库服务。

## 当前边界

业务只使用示例数据。支付为模拟支付，不调用真实支付渠道。Python 模型、复杂文档解析和消息系统按课程后续实现；
不会把模拟结果、预留目录或仅保存的配置记成已经验证的功能。

本课业务库名固定为 `commerce`。修改连接配置中的数据库名不会自动迁移或初始化新库，需同步调整有序 SQL 迁移。
