# 第一步环境报告

> 历史说明（2026-10-18）：本文描述 `step-01 attempt-01` 的冻结状态，正文中的“当前/本轮”均指该次尝试。工程已继续 `step-03`，当前恢复请读 [step-03 HANDOFF](../step-03/HANDOFF-step-03.md) 并查询 SQLite。完整历史资料和证据见 [冻结目录](../history/step-01/attempt-01/)。当前不再维护 mindmap。


本报告区分「安装文件存在」「实际执行」「未来未验证」，时间：2026-10-18（上海）。

| 项目 | 实测结果 |
|---|---|
| Python | 3.12.10，原机器已存在 |
| Node.js | 24.20.0，原机器已存在 |
| JDK | Temurin 21.0.12.1+1，项目本地ZIP解包，`java -version`已执行 |
| Maven | 3.9.16，项目本地ZIP解包，`mvn --version`已执行 |
| MySQL | 8.4.11，普通Windows进程，监听127.0.0.1:13306，真实SELECT VERSION()已执行 |
| Docker | 客户端29.7.2存在；Linux引擎管道不存在，未能连接 |
| WSL | 查询返回E_ACCESSDENIED；没有擅自修改系统虚拟化或WSL配置 |
| 端口 | 数据库13306、Java18080、Vue15173，分配前确认未占用 |

## 校验与隔离

- JDK：从Adoptium官方GitHub Release获取，SHA256匹配官方同版本校验文件。
- Maven：从Maven Central获取，SHA512匹配官方同版本校验文件。
- MySQL：官方下载页MD5与下载文件一致；额外计算本地SHA256锁定文件，**未验证GPG签名**。
- 下载地址和哈希见`evidence/toolchain-lock.json`，不含密码。
- 工具包和MySQL数据在生成目录下的`work/`中；实际路径保存在本机`state/runtime.json`。
- 环境变量仅修改当前PowerShell进程；不写系统PATH、不注册MySQL系统服务。
- MySQL应用账号仅有SELECT权限。随机本地凭据保存在忽略提交的state文件中，不写进台账、源码、文档和验证日志。

## 原生MySQL为何可用于本步

前两步学习HTTP、依赖注入、Mapper、SQL和真实数据库行为，不依赖容器机制。
原生MySQL与Docker中的MySQL使用同样的表和SQL，因此可以真实验收查询链路。
Docker引擎问题仍是后续容器课程的前置问题；本步通过不代表Docker已经就绪。

## 运行

在项目根目录执行：

```powershell
. .\scripts\Use-LabEnvironment.ps1
& .\scripts\Start-MySQL.ps1
python -m learning.ledger status
python -m unittest learning.test_ledger -v
```

`state/runtime.json`是本机路径配置，复制项目到其他机器后需要重新准备工具链。
数据目录已经存在时不得再次执行`--initialize-insecure`。第一次空密码初始化后立即设置随机密码。
后续修改数据库结构只通过受控初始化/迁移脚本，应用不使用root账户。
