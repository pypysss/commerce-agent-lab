# Commerce Agent Lab 项目操作约定

本项目用于循序学习 Java、Vue、Python Flask、RAG 与 Agent 工程。保留中文教学，结合可运行代码、底层原理、失败实验和实际证据推进。以下约定延续用户已确认的范围，不新增人工审批或额外门禁。

## 新对话先恢复上下文

1. 阅读根目录 `README.md`。
2. 阅读 `docs/DEVELOPMENT-CONTEXT.md`，恢复当前决策和验证边界。
3. 阅读最新 `docs/step-03/HANDOFF-step-03.md`；若该文件属于旧 attempt，以 SQLite 中当前阶段最新登记的 HANDOFF 路径为准。
4. 在项目根执行 `python -m learning.ledger status --lessons`，核对当前阶段、attempt 和状态，再开始修改。当前 CLI 没有 `show` 子命令；不要编造 `show step-02`。

本机 Python 可用路径为 `C:\Program Files\Python312\python.exe`，PATH 不可用时显式调用它。台账位置为 `state/learning.sqlite3`。SQLite 状态与当前 attempt 是进度权威；目录存在、磁盘上旧 HANDOFF 或历史测试通过均不等于本次完成。

## 本轮已确认的产品与技术决策

- 当前按用户“继续向下开发”进入 step-03 订单与库存。保留商品查询及界面 `zh-CN`、`en`、`ja`；默认中文，显式语言选择通过 localStorage 记忆。存储值无效或读取失败时默认中文；写入失败也不能阻止当前页面切换语言。
- 翻译界面文字、交互状态与错误提示；商品名称、描述等业务字段保持 MySQL 原文。价格仍为 CNY，不换汇；API 精确十进制字符串不改成浮点数做金额计算。
- 使用本地类型化词典和 Vue 原生能力，不新增 i18n 依赖。所有展示语言统一由前端管理；后端商品既有 4 类及身份/订单新增 7 类自定义错误返回稳定 code、HTTP 状态和固定安全中文兜底 message，不做语言协商。api.ts 不导入 useI18n，也不显式设置 Accept-Language；浏览器可能自行发送其原生语言头，后端自定义错误不依此改变。UI 按 code/apiCode 翻译，已显示错误切语言立即重译，不直接显示服务端 message。商品内容、日志、未纳入处理器的框架错误不扩大范围。
- 继承已有 Controller → Service 接口/实现 → Mapper 接口 → XML → MySQL 分层、Lombok/Validation、取消与请求序号保护、键盘和 ARIA 语义。
- 本轮完成 step-03 登录与本人订单、条件扣库存、事务及幂等下单、模拟支付；不自动开始 step-04 Redis 或后续消息/RAG/Agent。
- 用户已明确取消 mind-map，并要求删除原有 mind-map。活动地图、生成/检查脚本与入口已移除；冻结历史保留。以后不生成地图及其 JSON 数据，不把它们列为完成条件；验收/源码 JSON 继续交付。新约定和台账调整见 `evidence/step-03-scope-change.json`，不通过 init 改写冻结课程。

## 实现与交接纪律

- 用最小可运行增量教学；核心代码、调用链和原理以实际源码为准。已有讲解入口见上下文文档，不复制长对话充当技术文档。
- 修改已完成阶段前，先按源码 manifest 和已登记产物归档源码、文档及证据，更新 SQLite 历史产物路径并验证哈希，再用现有 `reopen` 命令开启新 attempt。不要覆盖已冻结的历史文件。
- 每步更新详细代码讲解、HANDOFF、验收证据和源码 manifest/完整文本快照；Markdown/JSON 正文、文件索引及 SHA-256 要登记到 SQLite。当前 attempt 的真实检查通过、全部登记产物哈希一致后，才用 `complete` 在同一事务收尾。
- 进入新阶段前冻结此前已完成阶段的共享源码及产物、更新历史路径并核对哈希；不因进入新阶段而 reopen 旧阶段。返工已完成阶段才 reopen，正在进行的阶段继续当前 attempt。
- 不借重跑 `init` 覆盖已冻结课程；新增学习约定和范围变更通过本轮上下文/HANDOFF 等产物明确登记。旧 attempt 的证据不能代替当前验证。
- `ROADMAP.md` 从台账导出。新对话先读取现有记录，避免为同一需求重复 reopen、虚增 attempt 或重做已完成工作。
- 修改 Markdown 时，同时核对实际源码、CLI 参数、文件路径和证据所属 attempt；明确区分当前实现、历史实测与未来计划。历史证据优先引用冻结目录。文档示例使用项目真实入口，不能把历史通过数改写成当前重跑结果。attempt-07 的审查与修正见 docs/step-02/DOCUMENTATION-AUDIT.md。

## 下一位 agent 怎样新增后端报错

1. 先恢复当前 attempt；修改已完成阶段前先按 manifest/登记产物归档、核对哈希、更新历史路径，再 reopen。不要重复开启已在进行的 attempt。
2. 为具体自定义异常确定稳定 code、正确 HTTP 状态和安全固定中文兜底 message；在 GlobalExceptionHandler 的具体处理方法中调用现有 error(status, code, message)。不要直接返回 exception.getMessage()、SQL 或凭据，不为翻译添加捕获所有 Exception 的处理器。
3. 在 web/src/messages.ts 的中文、英文、日文词典中补对应界面词条，并在所属界面的 errorText 登记映射：商品错误在 App.vue，身份/订单错误在 OrderPanel.vue。未知 code 继续显示当前语言的通用 HTTP 提示；普通对象映射须 Object.hasOwn 防止继承键命中。接口 message 仅保留为错误数据，不直接显示到页面。
4. 保存结构化错误对象，由 computed/t 按当前 locale 生成文案；切语言不重发请求。api.ts 不依赖界面语言，不恢复显式 Accept-Language、LocaleConfig、messages*.properties、MessageSource 或自定义 Content-Language/Vary；attempt-05 的这些文件只属于已冻结历史。
5. 测试本地网络/超时/坏 JSON/坏结构、已知与未知 apiCode、已有错误三语即时切换；对后端用缺失/各种 Accept-Language 确认 status/code/message 恒定且不泄露 SQL/凭据，成功商品数据保持不变。不要把浏览器自带的语言头误记为业务代码主动设置。
6. 更新当前阶段代码讲解、HANDOFF、源码 manifest/完整文本快照及本轮真实证据，按台账完成事务收尾并导出 ROADMAP。只推进用户安排的阶段，不再生成地图。

## 本机数据、工具与验证边界

- `work/mysql-data` 是真实业务数据库数据，不能按构建缓存清空。`work` 目录同时含工具、依赖缓存与数据，清理时必须识别用途。
- `state/mysql-connection.json` 含本机密码；不要将密码、token 或完整环境变量转储写入文档、SQLite、日志、截图或提交记录。
- 本机连接配置由 `state/runtime.json` 和项目启动脚本提供；不要把机器路径或密码硬编码到业务源码，不为本任务随意修改系统 PATH/注册数据库服务。
- `.vscode/settings.json` 已排除 `work`、`docs/history` 等目录的 Java 导入/文件监听，避免历史 Maven 工程重复导入。保留这些排除配置。
- VS Code Java 1.57/Lombok 编辑器误报时，回退 1.56 只是已有排查建议；未由我们安装、验证，不得记录为已修复。
- Navicat Premium Lite 18.0.3 安装在 `E:\Tools\Navicat Premium Lite 18`；reader 账号 CLI 查询已测。此前 GUI 自动化因检测到物理 Esc 停止，用户后来是否手动连接成功未确认，不得写成 GUI 已验证。
- 区分实际执行、仅保存配置、历史结果、未验证与未来计划。Docker、生产部署、Python/RAG/Agent 等后续功能不因预留目录而算已实现。
