# 开发上下文与跨对话恢复

更新：2026-10-18。目录：`E:\ai_agent_learning\java_python`。

## 当前阶段与新指示

step-01 attempt-01、step-02 attempt-07 已完成。用户本次要求“找到交接文档 继续向下开发 不用生成mind-map了 不够清晰”，随后要求“把原本的mindmap也删了吧”。据此进入 step-03 attempt-01：登录、本人订单、库存事务、幂等下单与模拟支付。不自动开始 step-04 Redis 或后续消息、Flask/RAG/Agent。

旧活动地图、JSON、生成/检查脚本与地图专属证据已删除。冻结历史继续保留，后续不生成地图。13 个尚未开始的主阶段已移除 mindmap/mindmap-data 必需产物，冻结 learning_run 计划保持原样；详见 `evidence/step-03-scope-change.json`。

进入新阶段前，将 step-02 attempt-07 的 76 个 manifest 源码及登记产物，与 step-01 相关活动产物先冻结，共 100 个文件，更新 35 条 artifact 路径；删除前后全部 172 条已登记产物哈希一致。step-02 权威交接位于 `docs/history/step-02/attempt-07/docs/step-02/HANDOFF-step-02.md`。这是新阶段开发，没有 reopen 已完成的 step-02。

## 新对话恢复

按 README → AGENTS → 本文 → `docs/step-03/HANDOFF-step-03.md` → SQLite 恢复。执行：

```powershell
& 'C:\Program Files\Python312\python.exe' -m learning.ledger status --lessons
```

CLI 支持 init/status/start/reopen/check/artifact/complete/export-roadmap，没有 show/archive。当前阶段已 IN_PROGRESS/VERIFYING 时继续当前 attempt，不能重复 reopen/init。ROADMAP 是导出视图，实际状态看 SQLite。

若磁盘 HANDOFF 与当前 attempt 不同，用只读查询定位最新登记产物；新 attempt 没有登记产物时明确旧交接的归属：

```python
from contextlib import closing
import sqlite3

with closing(sqlite3.connect('file:state/learning.sqlite3?mode=ro', uri=True)) as con:
    print(con.execute(
        "SELECT step_id, attempt, path, sha256 FROM artifact "
        "WHERE kind='handoff' ORDER BY id DESC LIMIT 1"
    ).fetchone())
```

## 持续保留的实现约定

- Java 保留 Controller → Service 接口/实现 → Mapper 接口 → XML → MySQL；继续使用 Lombok/Validation、MyBatis 参数绑定和 VO 契约。金额是 BigDecimal/十进制字符串，不用浮点计算。
- 界面支持 zh-CN/en/ja，默认中文；localStorage 只记语言。读取失败/无效值默认中文，写入失败不妨碍当前切换。商品名、描述和 CNY 不翻译、不换汇。
- 所有展示文字和错误翻译由前端类型化词典管理；后端返回稳定 code、HTTP 状态和安全固定中文 message。UI 不直接显示服务端 message；未知 code 通用提示，已有错误随语言立即重译。api.ts 不依赖 useI18n，也不显式设置 Accept-Language。
- 登录采用服务端 HttpSession，前端不持久化密码或令牌；写接口用同步 CSRF 令牌。客户端 userId 不是身份。详情和支付检查订单归属。
- 下单是订单写入与库存条件扣减的单一事务；同一用户 requestKey 唯一，重复载荷返回原单，不同载荷冲突。幂等键代表一次业务意图，网络错误不能偷偷生成新键。
- 仅模拟 PENDING_PAYMENT → PAID，不访问真实支付渠道。Redis、Outbox 事件投递、到期释放库存仍属后续阶段，不冒充已实现。

## 交付与台账

每阶段交付源码、中文逐段代码详解、HANDOFF、真实验收证据、源码 manifest 和完整文本快照。不再生成地图。Markdown/JSON 正文及 SHA-256 随 artifact 入 SQLite。step-03 必需检查是 transaction_concurrency、authorization、artifacts_verified；额外记录前端、API 和浏览器验证，不用历史成绩代替本轮执行。当前 required_artifacts 是 handoff/code-guide。

必需检查真实通过、当前 attempt 全部最新登记产物哈希一致后，才调用 complete 同一事务登记并完成，再导出 ROADMAP、重新打开数据库核对。注册后继续改正文须重新登记。失败实验保留真实记录，区分预期失败、实现缺陷与测试夹具问题。

返工已完成阶段前，先按 manifest/登记产物冻结源码、文档与证据、核对哈希、事务更新历史路径，再 reopen。进入后续新阶段只归档共享基线，不因聊天或阶段变化增加旧阶段 attempt。历史目录不可覆盖。

## 教学入口

| 主题 | 入口 |
|---|---|
| 当前登录/授权、库存并发、幂等与模拟支付 | docs/step-03/CODE-GUIDE.md |
| 当前交接、启动、证据与下一步 | docs/step-03/HANDOFF-step-03.md |
| 商品查询 MVC/XML、IoC | docs/step-02/BACKEND-CODE-GUIDE.md（商品阶段历史讲解） |
| 取消/超时/运行时校验 | docs/step-02/GETJSON-CODE-GUIDE.md（写请求扩展见当前指南） |
| 三语与错误码 | docs/step-02/ERROR-CODE-I18N-GUIDE.md（商品阶段四类错误；新增见当前指南） |
| SQLite 台账/事务/哈希 | learning/ledger.py、docs/step-01/LEDGER-CODE-GUIDE.md |

新增报错在具体 handler 调用安全 error(status,code,message)，不要返回 exception.getMessage()/SQL/凭据，也不添加捕获所有 Exception 的翻译处理器。补齐三语词条、UI 映射、契约和真实/模拟验证边界。

## 本机与验证边界

默认 Vue `http://127.0.0.1:15173/`、API `http://127.0.0.1:18080/`、MySQL `127.0.0.1:13306/commerce`。工具与端口来自 state/runtime.json；密码只在私有 state。启动 `scripts/Run-Lab.ps1`，构建 `scripts/Build-Lab.ps1`。修改 Java 后停止本工程旧进程、构建并重启，旧 JAR 的商品查询成功不证明新订单 API 已上线。

work/mysql-data 是真实数据，不能把 work 整体当缓存清理。初始化必须增量可重跑，保留既有商品/库存与账号。reader 继续只读，订单阶段新增仅具必要表级权限的应用账号，Java 不使用 root。演示登录凭据仅保存于 state/demo-users.json，不复制进文档、SQLite、日志或截图。

保留 .vscode/settings.json 对 work/docs/history/target/node_modules 的排除。VS Code Java1.57/Lombok 回退1.56 仅为旧建议，未由我们安装验证。Navicat Premium Lite18.0.3 位于 E:\Tools\Navicat Premium Lite 18；reader CLI曾测，GUI后续手动连接结果未确认。

原生 MySQL 验收不等于 Docker/生产部署通过。本地会话、示例账号和模拟支付不等于生产身份系统；TLS、密码重置、登录限速、分布式会话与真实支付回调另有边界。测试成绩以当前 HANDOFF 和对应证据为准。
