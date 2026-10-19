# 第一步代码详解入口

> 历史说明（2026-10-18）：本文描述 `step-01 attempt-01` 的冻结状态，正文中的“当前/本轮”均指该次尝试。工程已继续 `step-03`，当前恢复请读 [step-03 HANDOFF](../step-03/HANDOFF-step-03.md) 并查询 SQLite。完整历史资料和证据见 [冻结目录](../history/step-01/attempt-01/)。当前不再维护 mindmap。


先阅读 [环境报告](ENVIRONMENT.md)，再阅读 [SQLite台账逐段详解](LEDGER-CODE-GUIDE.md)。
本步的业务场景是：换一个会话或进程后，仍能知道课程走到哪里，哪些验收真实通过，下一步从哪里继续。

## 从命令到数据库

`python -m learning.ledger init` → `main()`解析参数 → `init()`读取冻结课程 →
建立四张表 → `INSERT OR IGNORE`补充记录 → 提交 → 重新查询状态。

`with con:`只负责提交/回滚，不会自动关闭SQLite连接，所以代码同时使用`contextlib.closing()`。
这是本项目测试中实际发现并修正的问题，Windows上未关闭连接会使临时库清理失败。

## 需要亲自跟踪的四段代码

1. `connect()`：独立连接、超时和`PRAGMA foreign_keys = ON`。外键约束必须对每个连接启用。
2. `start()`：`BEGIN IMMEDIATE`、前置步骤检查、attempt递增。失败后不能跳过第一步开始第二步。
3. `record_check()`：预期与实际分开保存；FAILED和NOT_RUN保留其含义。
4. `complete()`：先检查当前尝试的必需验收，再检查文件与哈希，最后事务内登记产物并完成状态。

详细SQL和函数片段见台账详解；地图节点也会展示真实源文件中的短代码。

## 失败实验与恢复

先在临时测试数据库创建一个步骤，再故意缺失HANDOFF、修改已登记文件或写入FAILED检查。
运行complete应失败，阶段不能变为COMPLETED，失败事务中的artifact登记也应回滚。
重新打开数据库，确认之前已提交的计划/检查仍然存在。相关自动化实验在`learning/test_ledger.py`。

## 生产问题

SQLite适合本地单协调者台账；不能据此推断它适合多人高频写或网络共享盘。
数据库事务不覆盖HTML/Markdown写文件，须先生成并验证文件，再提交完成事务。
本机路径配置与凭据不是课程正文，必须与可分享的讲解及台账日志分离。

## 小练习

复制测试用课程并新增一个检查项，观察没有对应PASSED结果时为何不能complete。
解释：为什么重新运行init不能覆盖计划？为什么重做不能复用上一attempt的通过记录？
