# 文档与项目一致性审查 · attempt-07

> 历史说明（2026-10-18）：本文描述 `step-02 attempt-07` 的冻结状态，正文中的“当前/本轮”均指该次尝试。工程已继续 `step-03`，当前恢复请读 [step-03 HANDOFF](../step-03/HANDOFF-step-03.md) 并查询 SQLite。完整历史资料和证据见 [冻结目录](../history/step-02/attempt-07/)。当前不再维护 mindmap。


日期：2026-10-18。工程：`E:\ai_agent_learning\java_python`。

用户要求启动子 Agent，对照项目检查当前 Markdown。子 Agent 先只读审查，协调者归档 attempt-06 后修正文档，再交回只读复核。本次 Java、Vue、SQL、台账实现与启动脚本没有改变；地图生成器只补充审查入口。展示语言仍统一由前端管理。

## 审查范围与事实依据

活动 Markdown 包括根入口、docs 下非 history 的教材与交接、learning/plan.md 和 services/agent/README.md。覆盖目录结构、源码片段、HTTP 错误契约、语言职责、金额与 SQL、配置/CLI/启动命令、文件链接、真实验收记录和后续功能边界。

冻结的 history、第一步当时的成绩和计划中的未来功能按其原时间与范围判断，不要求把历史改成当前实现。根目录仍保留的一些旧 evidence 确实存在；初审疑似断链经核对不成立，实际需要修正的是证据所属 attempt 和段内时态。

## 发现与修正

| 发现 | 修正 |
|---|---|
| I18N-CODE-GUIDE 仍称本轮补后端 message 翻译 | 明确由前端按 code 翻译，后端固定安全中文 |
| BACKEND-CODE-GUIDE 仍要求验收请求语言协商/JAR 语言资源 | 改为各种语言头下错误响应恒定，JAR 不含删除的类/资源，前端与请求语言解耦 |
| STRUCTURE-REVIEW、OBSERVED-PITFALLS 用“本轮”介绍 attempt-03 的依赖/JAR/启动检查 | 标注 attempt-03 历史，引用冻结目录中的证据；06 的浏览器失败也引用其冻结记录 |
| 第一步台账指南的示例地图路径和 ROADMAP 输出与当时入口不同 | attempt-07 当时校正地图路径与根 ROADMAP.md，说明已完成阶段无需重复 complete；地图现已冻结并取消活动入口 |
| 第一阶段的 10 项测试与当前 12 项源码容易混淆，产物检查说明不完整 | 保留历史 10 项结果；写明当前测试入口和 12 项，以及附加产物的最新哈希也需验证 |
| 当前修订与历史实现容易混淆 | 根入口、上下文和教材区分：实现沿用06，07仅文档审校；Java38为06历史，不伪装成本轮重跑 |

第一步原始台账指南在校正前保存到 `docs/history/step-01/attempt-01/docs/step-01/LEDGER-CODE-GUIDE.md`，原 artifact 仅更新路径，正文及哈希保持原样。第一步阶段仍完成，不重做或重置业务进度。

## 当前实现的统一说法

后端已有四个自定义错误保持稳定 HTTP 状态、code 与固定安全中文 message。前端 api.ts 不依赖 useI18n，也不显式设置 Accept-Language；App.vue 保存结构化错误，用 errorText → t → computed 选择当前语言文案。未知 code 使用本地通用提示，页面不直接展示服务端 message。商品原文、CNY 精度、只读账号、取消与请求序号保护保持不变。

后端 LocaleConfig、三份 messages 资源和 MessageSource 属于已冻结的 attempt-05，不应因旧教程被重新加入。Python Flask、RAG/OCR、Agent、订单与消息等仍按课程后续推进，没有因预留目录而算实现。

## 当前检查与历史成绩

本轮直接核对活动 Markdown 链接、修正句与当前源码、归档文件哈希，并检查业务源文件相对 attempt-06 未变。复跑前端测试/类型检查/构建、台账测试、真实 API/SELECT-only MySQL 查询、浏览器错误翻译及交互地图；计数与结果以最新 HANDOFF 和 `evidence/step-02-documentation-audit.json`、本轮证据为准。

Java 38 项（18 单元 + 20 真实 MySQL 集成）是 attempt-06 实际通过记录，本轮没有重新编译 Java 或重跑该套件，也未执行真实停库、Docker、生产或外部模型集成。第一步当时的 10 项测试、06 浏览器初次失败等历史记录不改写、不删除。

源码清单、完整文本快照、本文、讲解、思维视图、HANDOFF 与验收证据进入 SQLite 当前 attempt；完成前检查产物哈希，使用同一事务登记并完成阶段，提交后重新打开数据库核验。

## 下一位 Agent 的文档维护规则

1. 先读 README、AGENTS、开发上下文、最新 HANDOFF，查询 SQLite 当前 attempt。
2. 说明当前实现时对照真实文件；引用历史测试时写清 attempt，并优先链接冻结证据。
3. 修改教材示例时使用真实 CLI、文件路径和源码方法名；注明示意代码与可直接执行命令的区别。
4. 不把历史 Java/浏览器成绩记作本次重跑，不把未来计划记作已实现。
5. 已完成阶段改动先归档和核对哈希；更新当前阶段讲解、HANDOFF、源码快照与本次实际证据后落库。step-03 起用户已取消地图产物。
