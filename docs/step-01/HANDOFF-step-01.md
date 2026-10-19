# HANDOFF · 第一步：工程底座与学习台账

> 历史说明（2026-10-18）：本文描述 `step-01 attempt-01` 的冻结状态，正文中的“当前/本轮”均指该次尝试。工程已继续 `step-03`，当前恢复请读 [step-03 HANDOFF](../step-03/HANDOFF-step-03.md) 并查询 SQLite。完整历史资料和证据见 [冻结目录](../history/step-01/attempt-01/)。当前不再维护 mindmap。


日期：2026-10-18。本交接记录第一步范围，后续步骤的实现不会回填为本步成果。

## 已完成

- 15阶段、36小课、完整计划及技术选择已准备入SQLite台账。
- 四表台账、CLI、attempt隔离、前置阶段门禁、完成事务和文件哈希校验已实现。
- 项目本地JDK21/Maven3.9和原生MySQL8.4可实际执行；Python3.12/Node24已确认。
- 工程目录建立，Java/Web/Flask业务尚待下一步及后续课程实现。
- 当时本步代码详解与独立交互思维视图随台账完成事务登记；旧图现已冻结，活动入口已删除。

## 入口与对应代码

- `learning/ledger.py`：初始化、状态、检查、产物、完成、恢复与导出。
- `learning/test_ledger.py`：10项状态/回滚/持久化/产物门禁验证。
- `learning/plan.md`、`learning/curriculum.json`：批准计划与课程定义。
- `scripts/Use-LabEnvironment.ps1`、`scripts/Start-MySQL.ps1`：当前进程环境与原生数据库。
- `docs/step-01/CODE-GUIDE.md`：详细讲解入口。

## 启动与验证

```powershell
. .\scripts\Use-LabEnvironment.ps1
& .\scripts\Start-MySQL.ps1
python -m learning.ledger status --lessons
python -m unittest learning.test_ledger -v
```

本步验收证据：`evidence/step-01-ledger-tests.txt`、`evidence/environment.json`、[历史地图检查](../history/step-01/attempt-01/evidence/step-01-map-browser.json)。
完成状态只以SQLite当前attempt检查及产物门禁提交后的结果为准。

## 已知问题与未验证

- Docker引擎不可连接、WSL查询拒绝；本轮使用已验证的原生MySQL，不声称容器验证通过。
- Cloud、Kafka、RocketMQ、Redis、PG、Mongo、Flask、RAG、OCR及真实模型均未实现/未验证。
- 未运行真实支付或调用付费模型。
- 文件和SQLite没有共同事务：文件生成后数据库完成事务失败，可以核对文件后重试；不能先改COMPLETED再补产物。

## 数据与恢复

`state/learning.sqlite3`是进度权威；Markdown/JSON正文存artifact，HTML以路径和SHA256登记。
SQLite库需与对应源码和产物一起备份；不要复制正在写入的数据库文件作为可靠备份。
`init`不会重置已有进度；需要重做用`reopen`生成新attempt。依赖步骤开始后不得偷偷重开前置步骤。

## 第一步交接时的下一步：商品查询纵切片（历史）

以下是第一步交接时的计划。step-02 后已完成 attempt-07；当前恢复入口见页首，不重复 start step-02。
新建Spring Boot/MyBatis商品列表和详情API、MySQL表与种子数据，随后接入Vue页面。
Java端口18080，Vue端口15173，数据库13306；金额用DECIMAL/BigDecimal，API用十进制字符串。
完成真实MySQL查询、HTTP错误与分页、前端构建、浏览器状态验证，当时再生成第二步的详解、地图与HANDOFF；当前阶段不再生成地图。
