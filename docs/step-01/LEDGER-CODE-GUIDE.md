# 第一步代码详解：让学习计划、验收和交接可以恢复

> 历史说明（2026-10-18）：本文描述 `step-01 attempt-01` 的冻结状态，正文中的“当前/本轮”均指该次尝试。工程已继续 `step-03`，当前恢复请读 [step-03 HANDOFF](../step-03/HANDOFF-step-03.md) 并查询 SQLite。完整历史资料和证据见 [冻结目录](../history/step-01/attempt-01/)。当前不再维护 mindmap。 本页曾在 step-02 attempt-07 校正文档，校正后的原文也已[冻结保存](../history/step-02/attempt-07/docs/step-01/LEDGER-CODE-GUIDE.md)；下文单独说明当前必需产物调整。


本节对应 `learning/ledger.py`、`learning/curriculum.json` 和 `learning/test_ledger.py`。先理解这条链：**冻结课程 → 初始化 SQLite → 开始阶段 → 记录真实验收 → 生成文件 → 原子登记并完成 → 读取 HANDOFF → 开始下一阶段**。

本台账使用 Python 标准库，不需要 Flask、ORM 或额外包。Flask 是后续业务 Agent 的 API；学习台账只负责本机协调者的记录。

## 1. 业务场景与数据边界

聊天中说“做完了”不能证明文件可打开、代码跑过、失败处理经过验证。台账把这三件事分开：计划是什么、观察到什么、交付了什么。下次换一个聊天，也能从数据库和 HANDOFF 恢复。

| 表 | 一行代表什么 | 为什么这样保存 |
|---|---|---|
| `learning_run` | 一份项目课程及其冻结版本 | 同时保存计划 Markdown 和完整课程 JSON，不依赖聊天历史 |
| `learning_step` | 一个阶段或其子课 | 15 个阶段、36 个子课；子课通过 `parent_id` 关联阶段 |
| `acceptance_check` | 某次尝试的一次实际检查 | 追加记录预期、实际、结果和证据，不用新结果覆盖失败历史 |
| `artifact` | 某次尝试的一份产物快照 | 路径、SHA-256、时间；Markdown/JSON 另存正文 |

运行状态在 `state/learning.sqlite3`。商品、库存和订单将进入 MySQL；台账中的进度不属于业务数据，也不能替代业务事务。

阶段状态是 `PENDING → IN_PROGRESS → VERIFYING → COMPLETED`。`attempt` 是重做编号，不是重试次数统计。旧尝试的通过结果不能证明这次修改仍然正确。

阶段和子课分别有数据库行，但 CLI 以阶段为操作单位。开始阶段时子课同时开始，验收和完成时子课同时推进。子课的验收说明写在课程中，其实际证据汇总到阶段检查。这避免每段讲解都要手工登记相同证据；它不表示每个子课有独立自动测试。

## 2. 初始化：为什么不会覆盖既有进度

核心代码位于 `init()` 和 `_insert_step()`：

```python
con.execute(
    "INSERT OR IGNORE INTO learning_run VALUES (?, ?, ?, ?, NULL, ?, ?)",
    (data["id"], data["version"], data["plan_markdown"],
     json.dumps(data, ensure_ascii=False), timestamp, timestamp),
)
saved = json.loads(con.execute(
    "SELECT curriculum_json FROM learning_run WHERE id = ?", (data["id"],)
).fetchone()[0])
for ordinal, step in enumerate(saved["steps"], 1):
    _insert_step(con, saved["id"], step, None, ordinal * 100, timestamp)
```

逐段理解：

1. `id` 是主键，相同项目第二次插入冲突时，`OR IGNORE` 不修改已存在的记录。这里没有 `DELETE`、`REPLACE` 或无条件 `UPDATE`。
2. 首次初始化把批准的计划正文和课程 JSON 同时存进数据库。
3. 之后读取**数据库中的冻结课程**补种缺失阶段，不把磁盘上意外修改的 JSON 当成新版计划。
4. 阶段和子课也是 `INSERT OR IGNORE`，已有状态、尝试编号和证据继续保留。
5. SQL 值通过 `?` 参数传入。数据库驱动负责绑定值；不能把标题拼进 SQL 字符串。

这是“可重复运行”，不等于“每次按文件强制同步”。若以后需要正式改课，应增加明确的计划升级/迁移入口和版本审阅；不能借重跑 `init` 悄悄改写已批准计划。

`SCHEMA` 用 `CREATE TABLE IF NOT EXISTS` 建表。SQLite 自身会有内部表，例如自增编号对应的 `sqlite_sequence`；业务定义仍然只有上述四张表。

## 3. 开始阶段与验收：状态为什么不能任意跳转

`start()` 先开启写事务，读取当前阶段，再检查前置阶段：

```python
con.execute("BEGIN IMMEDIATE")
row = _step(con, step_id)
if row["status"] in ("IN_PROGRESS", "VERIFYING"):
    return dict(row)
if row["status"] == "COMPLETED":
    raise LedgerError("Completed steps require an explicit reopen")
for prerequisite in json.loads(row["prerequisites_json"]):
    previous = con.execute(
        "SELECT status FROM learning_step WHERE id = ?", (prerequisite,)
    ).fetchone()
    if not previous or previous[0] != "COMPLETED":
        raise LedgerError(f"Prerequisite {prerequisite} must be COMPLETED")
_begin_attempt(con, row)
```

`BEGIN IMMEDIATE` 提前获取 SQLite 写事务所需的锁，避免“读时通过检查，真正写时发现另一个写者已经改了状态”的竞态。当前设计只有一个协调者写库，连接最多等待 5 秒；它不承诺支持大量并发进度写入。

第二步要求第一步已经 `COMPLETED`。第一步完成前运行 `start step-02` 会抛出 `LedgerError`，数据库保持原状。重复开始正在进行的阶段会返回现有记录，不增加 `attempt`。

`record_check()` 追加一条验收记录，再把阶段及子课推进到 `VERIFYING`。只有三种结果：

- `PASSED`：已观察到预期行为。
- `FAILED`：执行过，但实际不符合预期。
- `NOT_RUN`：没有执行，不能当作通过。

同一名字的检查允许多次记录。完成时按“当前 `attempt` 内该检查最后一条记录”判断。因此失败修复后可重测并留下新通过结果，而失败历史仍然可审计。只对课程列出的必需检查做完成门禁；额外探索检查不会自动扩大本阶段的验收范围。

## 4. 文件登记与完成事务

`_register_artifact()` 先约束路径在项目根内，再检查文件存在和扩展名。读取原始字节计算 SHA-256；Markdown 和 JSON 使用 UTF-8 解码，JSON 还要能被真正解析。HTML 在数据库中保存路径和哈希，完整交互页面仍是普通文件。

正文保存的目的：数据库可以恢复交接文本，哈希可以发现文件在登记后被改动。SHA-256 不会判断文档讲解是否正确，也不是防篡改认证。协调者仍需要打开页面、检查代码引用并记录 `artifacts_verified`。

`complete()` 的顺序是关键：

```python
with closing(connect(db)) as con, con:
    con.execute("BEGIN IMMEDIATE")
    row = _step(con, step_id, active=True)
    if row["status"] != "VERIFYING":
        raise LedgerError("Record acceptance checks before completion")
    for kind, path in (artifacts or {}).items():
        _register_artifact(con, row, kind, path, root)
    checks = _latest(con, "acceptance_check", step_id, row["attempt"], "name")
    unmet = [name for name in json.loads(row["required_checks_json"])
             if name not in checks or checks[name]["outcome"] != "PASSED"]
    if unmet:
        raise LedgerError(f"Required checks missing or not passed: {', '.join(unmet)}")
    # 随后验证当前attempt全部已登记类型的最新产物存在且字节哈希与登记值一致。
    # 所有验证通过后才 UPDATE 为 COMPLETED。
```

`with con` 在正常退出时提交，在抛出异常时回滚。`closing(...)` 负责真正关闭连接。**`with sqlite3.connect(...) as con` 本身不会关闭连接**，Windows 上尤其容易表现为数据库文件仍被占用；测试中已经专门修正了这个坑。

必需产物由每个阶段的 `learning_step.required_artifacts_json` 决定，并非台账代码全局硬编码。历史 step-01、step-02 是 `handoff`、`code-guide`、`mindmap-data`、`mindmap` 四类；用户在进入 step-03 时取消 mindmap，当前 step-03 起未开始阶段改为 `handoff`、`code-guide` 两类，冻结课程和已完成阶段的历史要求保留。变更与归档证据见 [本轮范围记录](../../evidence/step-03-scope-change.json)。

必需类型缺失或未登记会拒绝完成；登记的 JSON 必须有效。`complete()` 还会验证本次 attempt 每种附加产物最新记录的文件存在且哈希一致。推荐把最终产物字典直接传给 `complete()`：登记、验证和阶段完成处于同一个 SQLite 事务中。

### 文件系统与 SQLite 不能共享一个原子事务

先生成文件，再调用 `complete()`。若写文件成功但数据库失败：文件会存在，台账仍停在 `VERIFYING`；修复原因后用相同文件重试登记。若登记过程中某份文件找不到：这次新插入的产物记录会回滚，阶段不完成。不要先标完成再异步补写文件。

哈希是在事务内读文件时核对的，但操作系统文件写入没有被 SQLite 锁保护。如果另一个编辑器在检查后改写文件，数据库事务无法锁住它。当前约定是一个协调者完成收尾，完成后的产物视为冻结；需要修改时显式 `reopen`，生成新尝试证据并重新登记。

## 5. 正常操作与预期输出

在项目根用 PowerShell 执行：

```powershell
$pythonExe = 'C:\Program Files\Python312\python.exe'
& $pythonExe -m learning.ledger init
& $pythonExe -m learning.ledger status --lessons
& $pythonExe -m learning.ledger start step-01
& $pythonExe -m unittest learning.test_ledger -v
```

首次 `init` 返回项目及阶段状态，均为 `PENDING`、`attempt: 0`。`start step-01` 返回 `IN_PROGRESS`、`attempt: 1`。状态以实际数据库为准，已有进度时不会重置为这些初始值。

执行真实检查后再登记。例如测试命令退出码为 0、日志保存完成后：

```powershell
& $pythonExe -m learning.ledger check step-01 ledger_tests PASSED `
  --expected '台账门禁和恢复测试通过' `
  --actual '10 tests passed' `
  --evidence '对应本次保存的测试日志路径'
```

第一步还需要 `environment_ready`、`curriculum_loaded`、`artifacts_verified`。第二步需要 `mysql_real_query`、`api_contract`、`frontend_build`、`browser_flow`、`artifacts_verified`。这些名字从课程冻结快照读取，不能通过只登记一个无关的通过项绕过。

下面按当前 step-03 的两类必需产物说明完成命令格式；必须先实际生成文件并通过本轮所有必需检查，再执行。不要重复完成已冻结的 step-01/step-02；当前状态先用 status 查询。

```powershell
& $pythonExe -m learning.ledger complete step-03 `
  --artifact 'handoff=docs/step-03/HANDOFF-step-03.md' `
  --artifact 'code-guide=docs/step-03/CODE-GUIDE.md'
& $pythonExe -m learning.ledger export-roadmap --output ROADMAP.md
```

实际完成需要这些文件存在、每个必需检查都通过并且文件审核已做。执行命令本身不会运行业务测试，也不会凭空生成交接或讲解。

给其他 Python 脚本的接口：

```python
from learning import ledger

db = ledger.DEFAULT_DB
ledger.init(db)
ledger.start(db, "step-01")
# 执行验证、生成产物、逐项 record_check；这里不伪造通过。
# ledger.complete(db, "step-01", artifacts={...}, root=ledger.ROOT)
```

其他接口包括 `status(db, include_lessons=True)`、`register_artifact(...)`、`reopen(db, step_id, reason)` 和 `export_roadmap(db, output)`。`reopen` 保留旧结果并开启新 `attempt`；直接依赖它的下一阶段已经开始时会拒绝重开，避免留下“前置重做、后续仍算完成”的矛盾。

## 6. 失败实验与测试证据

聚焦测试使用临时课程和临时 SQLite，不接触真实 `state/learning.sqlite3`。测试暂存目录在 `learning/.test-tmp`，成功时清理各自的临时目录。Windows 沙箱默认 TEMP 可能不可写，因此这里选择项目可写目录。

第一步当时的 10 项测试覆盖如下；后续扩展后的当前 test_ledger.py 包含 12 项测试，新增覆盖附加产物被修改或丢失时拒绝完成并回滚。原始通过记录不改写成 12 项：

| 实验 | 应观察到的结果 |
|---|---|
| 重复初始化并篡改磁盘课程 | 已冻结正文、版本、进度、验收均保留 |
| 删除尚未执行的课程行再初始化 | 补回缺失行，进行中的阶段不回退 |
| 必需检查为失败或未执行 | 不能完成 |
| 最后一份产物缺失 | 新产物登记全部回滚，阶段仍在验证 |
| 用 SQLite trigger 模拟最后一次写入中止 | 产物、主阶段、子课状态全部回滚 |
| 登记后修改/删除文件 | 哈希/存在性门禁拒绝完成 |
| 没有登记必需产物 | 明确报告缺失类型 |
| 提前开始第二步；断开连接后重新读取 | 前置门禁生效，已提交进度与正文持久存在 |
| 重开第一步 | 新尝试不能复用旧的通过检查 |
| 产物路径指向项目外 | 路径门禁拒绝登记 |

第一步原始实现阶段实测：`Ran 10 tests ... OK`，属于当时的历史证据。当前测试入口是 `python -m unittest learning.test_ledger -v`；每次实际结果以当次日志为准。原始指南正文与哈希已保存到 docs/history/step-01/attempt-01；本次在 step-02 attempt-07 仅校正文档入口和当前行为，不重新宣称第一步执行了后续新增测试。

可在**临时数据库**做练习：登记一次 `FAILED`；按临时课程要求准备产物并故意漏掉其中一类；运行完成命令；确认状态没有变为完成；补文件和重新验收后再完成。不要用真实已交接阶段做破坏性练习。

## 7. 生产环境可能遇到的问题

- **锁等待**：SQLite 同时只有有限写并发。当前一个协调者、短事务、5 秒超时足够；多用户同时操作、远程团队台账或长期任务写入时，再迁移专用服务和数据库，不能在锁中执行 OCR/网络请求。
- **磁盘与备份**：文件满、断电、权限变化会导致提交失败。保留异常和实际状态；需要一致性备份时使用 SQLite backup API 或停止写入后备份，不能在持续写入时只复制一个文件并假定完整。
- **时区**：数据库时间统一 UTC ISO 8601，界面展示再转 Asia/Shanghai。UTC 时间戳与中文课程日期是两个用途。
- **证据与秘密**：台账可存正文，不应存密码、token、环境变量全量转储或用户私有业务数据。日志证据要先脱敏。
- **“通过”的责任**：CLI 记录协调者提供的检查结果，无法判断一句 `PASSED` 是否真实。因此自动检查退出码、浏览器证据、人工审核范围都要写清，不能用台账替代验证。
- **版本升级**：当前只有 v1 schema，不做无用的迁移框架。以后实际需要改 schema/课程时，先增加明确迁移与恢复测试；不能直接修改线上表并忽略旧记录。
- **文件改写**：完成后改文档会导致数据库内容和磁盘不同。应按 `reopen → 新验收 → 重新登记 → complete` 处理，而不是偷偷覆盖历史哈希。

## 8. 小练习与下一步入口

1. 用 SQL 查询每个顶层阶段的最后一次必需检查，解释为什么“曾经通过”与“当前尝试通过”不同。
2. 在临时数据库重开一个阶段，观察 `attempt`、旧检查、旧正文和新阶段状态。
3. 删除一份已登记临时产物，说明 SQLite 为什么不能回滚文件删除，以及 HANDOFF 应如何写恢复步骤。
4. 读完第一步 HANDOFF 后进入商品链路：从 Vue 请求出发，沿 Controller、Service、Mapper 直到 MySQL，找出每层真正承担的责任。

完整未来路线已存入课程，包括 Redis、两种消息系统、Spring Cloud、Flask/MongoDB、复杂文档 RAG、受控 Agent、人工确认工单以及性能/部署实验。它们当前只是计划行；台账中的 `PENDING` 才表示真实状态。
