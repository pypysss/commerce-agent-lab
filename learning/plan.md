# 首两步执行与持续交接方案（历史冻结计划）

2026-10-18 新指示：用户要求继续 step-03，并取消及删除活动 mind-map。下文保留最初计划作为历史；当前交付要求为代码详解、HANDOFF、证据与源码清单/快照，不再生成地图。SQLite learning_run 的冻结计划不改写，未开始阶段的 required_artifacts 已按用户新指示调整，见 `evidence/step-03-scope-change.json`。当前进度以台账和 `docs/step-03/HANDOFF-step-03.md` 为准。

计划版本：2026-10-18.v1。以下是用户确认的执行约定，实际完成状态以 SQLite 台账为准。

## 执行范围

沿用已确认的订单库存 + Vue 3 + TypeScript + Python Flask + RAG/OCR + Agent 方案。

本轮依次完成：第一步环境准备、工程骨架、完整学习流程落库（原阶段 0）；第二步 Vue → Java → MyBatis → MySQL 商品查询链路（原阶段 1）。第一步验收和交接完成后直接进入第二步，不重复询问是否继续。两步均交付代码讲解、思维视图和 HANDOFF。

项目位于 `C:\Users\Administrator\Documents\Codex\2026-10-18\gen\outputs\commerce-agent-lab`。

## 第一步：工程底座与流程落库

SQLite 学习台账与业务数据库分开。`learning_run` 保存完整计划正文、计划版本、项目标识、当前步骤；`learning_step` 保存所有阶段及小节、目标、前置条件、验收条件、进度与错误原因；`acceptance_check` 保存每次验证的预期、实际、通过/失败/未执行及证据；`artifact` 保存 HANDOFF 和代码讲解正文、思维视图数据、文件索引和内容哈希。

源码在工程文件中，Markdown 正文同时入库并导出，思维视图是可离线打开的 HTML。重复初始化只补缺失内容，不清空已有进度，也不覆盖既有计划。

具体完成：检查 JDK、Python、Node、Docker 引擎、端口和必要资源并锁定版本；建立 Java、Python、Vue、部署配置、学习文档目录；实现台账初始化、进度查询、验收登记、产物登记命令；完整课程和已确认技术选择入库；验证重复初始化、事务回滚、失败记录、重新打开数据库的一致性；生成第一步详细代码讲解、交互思维视图与 HANDOFF。环境阻塞如实记录，未通过的检查不标完成。

## 第二步：第一条业务链路

实现 Vue 页面 → HTTP API → Controller → Service → MyBatis Mapper → MySQL → 页面展示。交付商品及库存表和种子数据；商品列表和详情 API；精确小数价格；Vue 商品列表、加载、空数据、失败状态；真实数据库和浏览器操作验证；第二步详细代码讲解、交互思维视图与 HANDOFF。

讲解 Spring 创建对象与依赖注入、HTTP 请求进入 Controller、Mapper 接口执行 SQL 的原因、`#{}` 参数绑定和 SQL 注入、连接池与结果映射、Vue 响应式和异步更新，以及容器网络、字符编码、金额精度和异常响应问题。先打通查询，订单、消息、RAG、Agent 依后续课程递进。

## 每一步固定完成规范

状态顺序：PENDING → IN_PROGRESS → VERIFYING → COMPLETED。

必须依次完成实现和验收落库；生成详解、思维视图与 HANDOFF；检查产物可打开、对应当前源码且引用正确；在 SQLite 事务中验证验收和最终产物登记并标完成；更新课程总览，读取 HANDOFF，再进入下一步。任一必需产物失败均不提前完成。

HANDOFF 包含已完成与对应代码、启动命令/API/入口、已验证/失败/未验证、数据库变化/问题/恢复、下一步目标/前置条件/具体切入点。

思维视图采用中文、深色主题、展开折叠、搜索、代码预览和缩放，展示已实现模块、关键函数、数据流与风险；Java 节点依据真实源码补充，未来模块标明未实现。

代码讲解固定为：业务场景 → 核心代码逐段解释 → 调用链和底层原理 → 正常输出 → 失败实验 → 生产问题 → 小练习。

## 全课程和约束

阶段 0 环境与台账；1 商品查询；2 订单与库存；3 Redis；4 RocketMQ；5 Kafka 与 PostgreSQL；6 Spring Cloud；7 Python Flask 与 MongoDB；8 基础 RAG；9 复杂文档/OCR；10 RAG 版本/权限/评测；11 小 Agent；12 确认后创建工单；13 JUC/JVM/SQL 性能实验；14 Docker、CI/CD、本地 K8s、备份恢复与回滚。课程小节、目标、前置条件、验收项以同目录 curriculum.json 的冻结快照入库。

所有技术有实际用途：Spring/Boot/MyBatis 实现业务；MySQL 是交易、库存、工单和 Outbox 权威数据；Redis 做商品缓存；RocketMQ 做未支付到期检查并结合数据库补偿；Kafka 传事实事件并可重放；PostgreSQL 保存报表、知识目录/版本/权限与 pgvector；MongoDB 保存解析结果、会话和 Agent 轨迹；Flask 提供 Python API；Spring Cloud 提供网关与服务调用；Docker/K8s/CI/CD 逐步完成交付。

RAG 包括 Markdown/TXT、文字 PDF、扫描 PDF、图片、多栏、复杂表格和跨页表格。原文件在卷中；OCR/索引独立 worker 执行持久任务；文档按版本构建、审核后发布；引用包含文档/版本/页码/块或表格位置；检索权限过滤；先精确向量检索，再对照 HNSW。模拟模型只能验证流程，真实中文检索质量另测。

Agent 用 Python，有限工具循环（初始上限 4 轮、8 次工具执行），提供查询订单、库存、知识检索、工单提案；实时数据来自 Java API，政策来自 RAG；模型不能自称已确认。工单提案绑定用户/订单/参数/有效期，确认时 Java 重新鉴权并在事务中完成提案、工单和 Outbox，唯一约束保证幂等。支付为模拟，真实退款不在范围。

最小 API 能力包括 Java 商品/订单/库存、Flask 文档上传与 job_id、任务状态、知识发布/删除、RAG 查询（答案/来源/诊断）、Agent 运行、Java 工单确认。最终需要交易/消息一致性、复杂文档解析、20 道开发题和 10 道留出题的检索评测、Agent 授权与超时、恢复和回滚实验。

每轮一个可运行增量，参考少量 GitHub 核心代码，记录文件、commit 和许可证；展示约 20–40 行关键代码，讲清调用链/事务边界/消息时序，制造失败并修复，留下练习与下一课交接。技术版本由第 0 课实测后锁定；旧参考项目依赖不盲目照搬。
