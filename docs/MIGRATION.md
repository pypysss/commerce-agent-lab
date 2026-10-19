# 工作目录迁移记录

2026-10-18 用户指定工作台为 **E:\ai_agent_learning\java_python**。

旧目录为生成会话下的 outputs/commerce-agent-lab；源码、SQLite台账、文档、地图、证据、
本次专用JDK/Maven/MySQL包和MySQL数据已一并迁移。当前项目根目录直接是java_python，没有再嵌套子项目目录。

- 状态保留：step-01 COMPLETED，step-02 IN_PROGRESS。
- artifact路径是项目内相对路径，迁移不需要重写已验收产物正文及哈希。
- `learning_run.plan_markdown`和第一步交接保留历史批准快照，出现旧路径时以本迁移记录为准。
- 本机runtime.json及下载清单的解包路径已更新；不会复制密码到本记录或学习台账。
- 原MySQL进程已退出后再移动数据目录，数据库并非在线复制。
- `work/`包含本项目可重建工具包、构建缓存和本地MySQL数据，已忽略提交；数据库数据不可当成普通临时缓存删除。

在新根目录继续：

```powershell
. .\scripts\Use-LabEnvironment.ps1
python -m learning.ledger status
```

后台进程在自动化宿主中可能随启动命令退出而被回收；调试时可在独立终端前台执行：
`powershell -ExecutionPolicy Bypass -File scripts/Start-MySQL.ps1 -Foreground`。
用户正常PowerShell中的默认启动方式仍支持隐藏后台进程。
