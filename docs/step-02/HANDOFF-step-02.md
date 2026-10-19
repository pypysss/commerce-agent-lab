# HANDOFF · 第二步 attempt-07：文档与项目一致性审校

> 历史说明（2026-10-18）：本文描述 `step-02 attempt-07` 的冻结状态，正文中的“当前/本轮”均指该次尝试。工程已继续 `step-03`，当前恢复请读 [step-03 HANDOFF](../step-03/HANDOFF-step-03.md) 并查询 SQLite。完整历史资料和证据见 [冻结目录](../history/step-02/attempt-07/)。当前不再维护 mindmap。


日期：2026-10-18。工程：`E:\ai_agent_learning\java_python`。

本轮按用户要求启动子 Agent，将活动 Markdown 与实际项目逐项对照，只校正文档、历史时态和示例入口；Java、Vue、SQL、台账实现与启动脚本均未修改。业务实现沿用 attempt-06：展示语言统一由前端词典维护，商品保留原文；后端四类自定义错误保持稳定 code/HTTP 状态和固定安全中文 message，前端按 apiCode 翻译并即时切换。没有业务 LocaleConfig、后端译文资源或语言响应头；api.ts 不依赖语言状态。当前完成状态以 SQLite 当前 attempt 和证据为准。

## 新对话先恢复

1. 阅读 README、AGENTS.md、docs/DEVELOPMENT-CONTEXT.md 和本 HANDOFF。
2. 在工程根执行下列只读命令；不要每换聊天就 init/reopen：

```powershell
& 'C:\Program Files\Python312\python.exe' -m learning.ledger status --lessons
```

3. CLI 有 init/status/start/reopen/check/artifact/complete/export-roadmap，没有 show/archive。
4. 修改前已冻结 attempt-06 的 75 个源码文件与登记产物、证据共 89 个文件至 docs/history/step-02/attempt-06；28 条历史 artifact 路径更新且原哈希保留，全部 143 条产物哈希核对后才开启 attempt-07。校正第一步台账指南前，另保留其原始正文到 docs/history/step-01/attempt-01 并只更新原 artifact 路径，不改历史正文/哈希或第一步完成状态。
5. 历史范围：本次 attempt-07 当时仅收尾 step-02。用户现已安排继续 step-03，当前工作按页首的新 HANDOFF 恢复；Flask/RAG/Agent 等后续阶段仍按课程推进。

## 沿用的业务实现与本轮文档修正

业务代码沿用06，下表相关删除和改动在06已完成。本轮修正 I18N/BACKEND 指南中的旧后端翻译说明、STRUCTURE/PITFALLS 的03历史时态、第一步台账指南中的示例路径/附加产物检查及10项历史与12项当前测试的区别；统一根入口与当前修订，新增 DOCUMENTATION-AUDIT.md。原始历史始终保留。

| 文件/变化 | 作用 |
|---|---|
| services/commerce/src/main/java/lab/commerce/exception/GlobalExceptionHandler.java | 具体 handler 返回原状态、稳定 code、固定安全中文 message；去掉 MessageSource/Locale/注入构造器与自定义语言头 |
| 删除业务 config/LocaleConfig.java 及对应测试 | 自定义错误不再按请求语言协商 |
| 删除 resources/messages.properties、messages_en.properties、messages_ja.properties | 取消后端三语词条维护，旧版本保留于历史05 |
| services/commerce/src/main/resources/application.yml | 去掉 spring.messages 配置，数据源/MyBatis/连接池不变 |
| services/commerce/openapi.yaml | 自定义错误契约改为固定安全 message；语言不影响 code/status/message |
| web/src/api.ts | fetch 仅显式设置 Accept: application/json，不再依赖界面 locale；保留结构化错误、超时/取消/校验 |
| web/src/App.vue、messages.ts、i18n.ts | 沿用当前语言词典和 code/apiCode 映射；错误对象 + computed 即时重译 |
| Java/前端测试 | 后端自定义错误的语言头不变性、请求参数无语言依赖、取消/安全边界 |
| scripts/verify-error-i18n.cjs | 真实 Java/代理错误固定 message 与 UI 三语展示验证；保留脚本名作为现有验证入口 |
| docs/step-02/ERROR-CODE-I18N-GUIDE.md | 新的核心代码逐段讲解、底层原理、实验、生产边界和新增报错流程 |
| AGENTS.md / docs/DEVELOPMENT-CONTEXT.md | 更新产品决定与下一位 agent 的操作规范，不恢复历史05方案 |

没有新增依赖、表、商品翻译字段或数据库写操作；取消和请求序号保护、金额精度、MVC/XML 分层与 ARIA 语义保留。

```text
具体异常 → handler → HTTP status + 固定 code + 安全中文 message
  → getJson → ApiError(code=HTTP, apiCode=后端code, status, message)
  → Vue 保存错误对象 → computed/errorText → t(本地词条) → 当前语言展示
```

后端 message 是直接 API 调用者的安全兜底，页面不直接展示它。浏览器可能自动发送原生 Accept-Language；这不代表 api.ts 仍显式发送界面语言，后端自定义错误不依该头变化。

## 启动命令、接口和访问入口

```powershell
.\scripts\Run-Lab.ps1
```

Java 修改后先停止自有 Java 启动窗口，构建再重启，不在运行时覆盖 JAR：

```powershell
.\scripts\Build-Lab.ps1
& 'E:\nodeJs\npm.cmd' --prefix web test
& 'E:\nodeJs\npm.cmd' --prefix web run build
```

- 页面：http://127.0.0.1:15173/
- 列表：http://127.0.0.1:18080/api/v1/products?page=1&size=20
- 详情：http://127.0.0.1:18080/api/v1/products/1
- 不存在详情：http://127.0.0.1:18080/api/v1/products/999999999
- MySQL：127.0.0.1:13306 / commerce；凭据仅使用本机配置。
- 详细讲解：docs/step-02/ERROR-CODE-I18N-GUIDE.md；界面基础见 I18N-CODE-GUIDE.md。

观察后端返回：

```powershell
curl.exe -i -H "Accept-Language: en" "http://127.0.0.1:18080/api/v1/products/999999999"
curl.exe -i -H "Accept-Language: ja" "http://127.0.0.1:18080/api/v1/products/999999999"
```

预期都是 404/PRODUCT_NOT_FOUND/商品不存在或未上架。界面切英文或日文后，可见提示由词典决定；切换本身不重发商品请求。终端乱码先检查原始 UTF-8 字节，区分终端编码与服务器数据问题。

浏览器检查入口：

```powershell
$env:PLAYWRIGHT_MODULE = 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
& 'E:\nodeJs\node.exe' scripts/verify-error-i18n.cjs
```

## 已验证、失败与未验证

下面区分07当前重跑与06历史结果；最终完成状态以 SQLite 为准，不把历史成绩当本轮执行。

| 检查 | 当前结果 | 证据 |
|---|---|---|
| 文档子 Agent 审查/复核 | 核对当前源码、路径、CLI、证据归属与活动 Markdown，修正发现的方案冲突及历史时态；链接和源文件哈希核对见报告 | docs/step-02/DOCUMENTATION-AUDIT.md、evidence/step-02-documentation-audit.json |
| 台账测试 | 当前12项全部通过，测试使用临时数据库，不操作真实学习进度 | evidence/step-02-doc-audit-ledger-tests.txt |
| 前端测试 | 当前45项通过，0失败/跳过：API34 + i18n11 | evidence/step-02-doc-audit-web-tests.txt |
| 类型检查/构建 | 当前 vue-tsc 与 Vite build 通过 | evidence/step-02-doc-audit-build.txt |
| Java/真实 MySQL 集成 | attempt-06 历史 clean verify 38项通过（18单元+20真实集成）；本轮Java未变，未重跑该套件 | docs/history/step-02/attempt-06/evidence/step-02-frontend-only-maven.txt |
| 真实 API 与数据库 | 当前11种语言头×3条自定义400/404，共33项固定中文通过；reader实查商品/库存各3条，价格129.90；无写入 | evidence/step-02-doc-audit-api.json |
| 运行 JAR | 当前核对不含旧LocaleConfig/三份messages，资源字节匹配源码；JAR由06 clean构建，本轮未重建 | 同上 |
| 历史首次浏览器检查 | attempt-06 曾因拦截请求原生头元数据的过严断言失败；原记录保留，本轮不伪装成新失败或重写 | docs/history/step-02/attempt-06/evidence/step-02-frontend-only-browser-initial-failed.json |
| 浏览器最终重跑 | 21 次真实 Java 请求通过；6项已有400/404错误即时切换/重试，三语商品原文与390px手机检查通过，0页面JS错误；另1项明确注入的未知中文服务端message在三语UI使用本地通用提示，不直接展示原文 | evidence/step-02-error-i18n-browser.json |
| 历史思维视图 | attempt-07 当时73个独立节点；展开、搜索、源码预览、缩放通过，0页面JS错误；活动图已删除 | [冻结检查证据](../history/step-02/attempt-07/evidence/step-02-map-browser.json) |
| 源码/历史/文档/台账 | 源码完整文本、文件哈希、历史及敏感信息检查见验收报告；登记与完成在同一 SQLite 事务，提交后重新打开核验 | evidence/step-02-source-manifest.json、step-02-source-snapshot.json、step-02-acceptance.json |
| 实际停库恢复 | attempt-03 历史曾实测；当前没有据此宣称已重跑 | docs/history/step-02/attempt-03 |
| Navicat GUI / VSCode 扩展回退 | 未验证 | 见下方工具边界 |
| Docker、生产、模型/Agent集成 | 未验证/后续未实现 | 不以本机查询替代 |

attempt-06 的首次浏览器失败及修正原因仍保留在台账。503/500 的固定安全文案及脱敏属于06单元测试模拟覆盖；本轮没有重跑Java或停库，当前真实HTTP/浏览器错误范围是自定义400/404。初审疑似历史证据断链经核对不成立，旧文件仍存在，实际修正的是所属修订及时态。

正常请求的浏览器原生语言头保持稳定；通过Playwright改URL制造真实400的请求，拦截元数据不一定报告同样的原生头。业务fetch初始化参数没有显式语言头由单元测试直接检查，不能用拦截元数据缺失作唯一证明。未知code演示明确使用测试注入，不记成真实Java生产响应。

## 数据库变化、落库与恢复

- MySQL schema、种子、商品/库存、账号权限不变；CNY 精确十进制字符串不变，无译文表。
- SQLite 继续保存冻结计划和历史；当前07实际验证进入 acceptance_check，历史Java成绩保持06归属。
- attempt-07 当时更新 HANDOFF、中文讲解、上下文、根 AGENTS、思维图/验收 JSON，并登记正文、路径与 SHA-256；当前不再生成思维图。
- evidence/step-02-source-manifest.json 保存当前源码/文档清单及哈希，step-02-source-snapshot.json 保存同一清单的完整文本，JSON 正文入库。
- 不把凭据、私密 state、环境转储、work/mysql-data、依赖/工具缓存写进快照、文档或 SQLite。
- 检查必需检查、全部产物哈希、可打开及源码对应关系后，complete 在同一事务登记最终产物并完成阶段/子课，再导出 ROADMAP、重新打开台账核对。
- 当前尝试已 IN_PROGRESS 时继续本轮，不重复 reopen；已完成后需修改则先归档/哈希/更新历史路径，再 reopen。

## 下一位 agent 怎样新增报错

1. 恢复 README/AGENTS/上下文/当前 HANDOFF/SQLite，按当前 attempt 工作，不把历史05语言协商当成现行方案。
2. 后端确定稳定 code、正确 HTTP 状态及固定安全中文兜底 message，在具体异常 handler 调用 error(status, code, message)。不直接返回 exception.getMessage()，不引入捕获所有 Exception 的处理器。
3. 前端 messages.ts 三份词典补同一消息键，在 App.vue errorText 的 HTTP/apiCode 分支映射；未知 code 继续使用本地通用 HTTP 提示，不直接显示服务端 message。
4. 保存结构化错误对象，用 computed/t 支持已有错误即时切换；不为换语言重发查询，不在 api.ts 导入 useI18n 或设置 Accept-Language，不恢复后端 LocaleConfig/messages/MessageSource/语言响应头。
5. 验证已知/未知错误码、本地网络/超时/坏JSON/坏结构、已有错误三语切换和无额外请求；对后端验证语言头不影响status/code/message且无SQL/凭据泄露；成功商品和精确金额不变。请求替身不能冒充真实MySQL/HTTP。
6. 更新当前阶段指南、HANDOFF、源码manifest/完整快照和真实证据，事务 complete/导出ROADMAP。进入 step-03 后不再生成离线图/JSON；保留失败记录和冻结历史。

## 已知问题与恢复方法

- Navicat Premium Lite18.0.3 位于 E:\Tools\Navicat Premium Lite 18，reader CLI曾测。GUI自动化因检测到物理Esc停止，后续手动连接结果未确认，不能标GUI通过。
- 保留 .vscode/settings.json 对work/docs/history等排除。Java1.57/Lombok回退1.56只是建议，未替用户安装验证；工程保持Java21。
- work/mysql-data 是真实数据，不按缓存清空；state/mysql-connection.json 的凭据只留本机。
- 修改Java重新构建/重启，修改前端可由Vite热更新；只切界面语言无需重建数据库。
- 不直接显示服务端message不代表后端可返回秘密；直接API调用者仍能读取它，安全固定文案和日志metadata边界保留。
- 尚无商品译文、币种换算、跨标签页语言同步、全框架错误统一或生产部署结论。
- 取消浏览器请求不保证服务端SQL停止；原取消与请求序号保护保留。

## 下一步目标和具体切入点

先按 ERROR-CODE-I18N-GUIDE 沿 GlobalExceptionHandler → api.ts → App.vue errorText/computed → messages.ts/i18n.ts 学习；观察后端响应固定而已有页面错误仍可即时三语切换。不要恢复旧后端语言资源。

历史注记：attempt-07 交接时 step-03 尚待安排，因此当时只收尾 step-02。用户现已安排继续开发；step-03 的范围、真实进度与恢复入口见 [新 HANDOFF](../step-03/HANDOFF-step-03.md)，不以本文的旧计划代替当前验收。
