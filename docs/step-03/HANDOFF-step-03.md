# HANDOFF · 第三步 attempt-01：登录、订单与库存

日期：2026-10-18。工程：`E:\ai_agent_learning\java_python`。

本轮代码与真实验收已完成，台账完成事务及其状态以 `python -m learning.ledger status --lessons` 为准。前两步已完成并冻结，没有 reopen；本次用户授权继续 step-03，并取消及删除活动 mind-map。

## 恢复入口

阅读 README、AGENTS、docs/DEVELOPMENT-CONTEXT.md、本文件，再执行：

```powershell
& 'C:\Program Files\Python312\python.exe' -m learning.ledger status --lessons
```

不要重复 init/reopen。最新讲解是 [CODE-GUIDE](CODE-GUIDE.md)。旧 step-02 attempt-07 完整基线位于 docs/history/step-02/attempt-07，旧地图仅保留历史冻结记录；后续不用地图。

## 运行与接口

首次或源码改动后执行 `scripts/Build-Lab.ps1`，再执行 `scripts/Run-Lab.ps1`；Java 构建前停止本工程旧 Java 进程。演示 alice/bob 的随机密码只在私有 `state/demo-users.json`，不得复制到文档或日志。

- 页面：`http://127.0.0.1:15173/`
- 商品：GET `/api/v1/products`、GET `/api/v1/products/{id}`
- 会话：GET `/api/v1/auth/session`、POST `/api/v1/auth/login`、POST `/api/v1/auth/logout`
- 本人订单：GET/POST `/api/v1/orders`、GET `/api/v1/orders/{id}`
- 模拟支付：POST `/api/v1/orders/{id}/pay`

所有 POST 带 X-CSRF-Token；JSON 错误固定安全中文兜底，UI 按 code 三语翻译。金额仍 CNY 字符串，无真实支付。身份从 HttpSession 获取，客户端不能指定其他 userId。

## 数据与范围变化

新增 002-orders.sql 的 lab_user/commerce_order，订单金额快照、用户/幂等键唯一约束、状态/金额/数量约束。受限 writer 独立配置于私有 state/mysql-writer.json，reader 不提升权限。初始化增量可重跑，不重置种子库存或演示密码。

活动地图及工具共13文件已移除；原100文件冻结、35条历史artifact改址、172条历史哈希核对通过，13个未开始主阶段取消地图必需产物。证据 evidence/step-03-scope-change.json；冻结 learning_run 课程不改写。

## 本轮验证

以下均为 step-03 attempt-01 的实际执行结果，历史成绩不替代本轮验证。

| 检查 | 实际结果 | 证据 |
|---|---|---|
| Maven clean verify | 19 单元 + 31 真实 HTTP/MySQL 集成 = 50 项通过，0失败/跳过 | evidence/step-03-backend-maven.txt |
| 防超卖 | 专用库存10，20次并发各买1：10次200、10次409，10单、库存0 | OrdersApiIT；同上 |
| 幂等与事务 | 20次同键仅1单、扣减1次；改载荷409；缺货回滚；在成功UPDATE后用测试专属MyBatis插件抛错，订单/库存一起回滚；重复支付保持PAID | OrdersApiIT；同上 |
| 身份与权限 | 匿名401、跨用户详情/支付403、CSRF缺失/错误403；会话登录轮换；请求身份快照交错验证 | OrdersApiIT、SessionAccessTest；同上 |
| 前端测试 | 69项通过（含原45及新增24），覆盖契约、CSRF、保留幂等键、三语即时错误、未知继承键、身份迟到响应 | evidence/step-03-web-tests.txt |
| 前端构建 | vue-tsc + Vite通过 | evidence/step-03-web-build.txt |
| 台账测试 | 临时数据库12项通过，无真实进度重置 | evidence/step-03-ledger-tests.txt |
| 真实浏览器 | 登录→下单→模拟支付→刷新→退出→切Bob通过；服务器真实提交后注入网络失败，同键重试返回同一订单；三语错误切换无额外请求、390px三语不溢出、0页面JS错误 | evidence/step-03-browser.json、step-03-desktop.png、step-03-mobile-*.png |
| 浏览器数据库对账 | 仅1笔数量2、单价12.50、总额25.00的PAID订单；专用库存5→3、version0→1；验收后删除专用商品/订单，种子库存仍10/25/0 | evidence/step-03-browser-fixture.json |
| 初始化幂等 | 再执行初始化，库存/订单/用户哈希/权限与本机凭据字节均不变；reader权限不变、writer无DELETE/DDL | evidence/step-03-initialization.json |
| 文档与冻结历史 | 活动文档链接核对，历史172条artifact、76份attempt07源码、100份归档文件哈希通过；源码manifest与完整文本快照最终登记 | evidence/step-03-artifact-verification.json、step-03-source-manifest.json、step-03-source-snapshot.json |

PowerShell 脚本语法解析通过；OpenAPI 使用项目现有 SnakeYAML 解析通过，8个paths，订单9字段。没有新增运行依赖。没有在当前本机长服务仍运行时重新执行完整 Build-Lab 脚本；其Java/初始化/前端各组成检查已分别实际执行，脚本也通过语法检查。应用由现有 Run-Api.ps1/Run-Web.ps1 启动至默认端口。

真实失败与修正记录保留：

- 首轮 Maven 的测试把订单9字段误写为10，业务与并发检查已通过；修正断言后最终50项通过。见 evidence/step-03-backend-maven-initial-failed.txt。
- 浏览器首次访问时旧启动器已连带停止Vite，出现连接拒绝；启动Run-Web后恢复，见 evidence/step-03-browser-initial-not-ready.json。
- 浏览器丢响应实验首次在route处理前移除拦截，导致Playwright“Route is already handled”；修正为一次性route，专用fixture重置后最终通过。见 evidence/step-03-browser-route-initial-failed.json。它是验收脚本问题，不是应用重复下单。
- 初始化幂等检查的最初只读探测假设了reader账号名，查询失败且未执行初始化；改按真实配置的CURRENT_USER核对权限，最终通过，记录于step-03-initialization.json。

审查修正了两个代码边界：未知apiCode命中对象继承键时的渲染异常（Object.hasOwn），以及同session另一标签切换账号时旧请求误用新用户身份（不可变身份/CSRF快照和请求身份绑定）。新增测试已纳入上述最终成绩。

## 交付与台账

本轮 source-manifest 和 source-snapshot 包含业务源码、脚本、测试、当前教学和约定，不包含私密state、缓存、依赖、历史或构建结果；Markdown/JSON全文及SHA-256随artifact入库。必需检查 transaction_concurrency、authorization、artifacts_verified，必需产物 handoff/code-guide；当前附加验证与所有产物由complete事务校验，导出ROADMAP后重新打开SQLite核对。

## 下一步与边界

本轮只完成 step-03。step-04 Redis 等待用户安排，具体切入点是商品列表/详情缓存、过期与库存写入后的失效，以及缓存与真实库存不同步的失败实验；不能让缓存成为扣库存权威。先按新阶段要求冻结当前产物，再start step-04，不reopen step-03。

当前没有订单到期取消/库存释放、消息发送、真实支付/退款、分布式会话、Docker 或生产部署验证。应用重启后需重新登录。待确认的下单幂等键只保存在当前页面内存，刷新/关闭页面后需先查本人订单再决定是否重新下单；未实现跨刷新意图恢复。不把预留目录当实现。work/mysql-data是真实数据，不能清空。演示账号随机密码仍在私有state/demo-users.json；截图仅展示验收fixture，fixture已清理。
