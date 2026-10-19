# 第三步：身份、订单、库存与模拟支付

本课对应 step-03 attempt-01。源码是实际实现依据；测试成绩和运行边界看 [HANDOFF](HANDOFF-step-03.md)。本轮按用户要求取消地图，直接按下面的调用链阅读。

## 1. 业务场景与读代码顺序

用户先浏览商品，再登录，选择数量并下单，最后点击模拟支付。Alice 只能看到和支付自己的订单，Bob 即使知道 Alice 的订单编号也不能访问。下单成功立即扣可用库存，待支付订单也占用库存。本课没有到期取消与释放库存；这会在后续消息阶段补齐，不能把未支付当成已经释放。

依次阅读：

1. `web/src/OrderPanel.vue`：会话、下单意图、三语状态和本人订单。
2. `config/SessionAccess.java`、`controller/AuthController.java`：会话身份和 CSRF。
3. `controller/OrderController.java`、`service/impl/OrderServiceImpl.java`：输入、授权、事务与状态。
4. `mapper/OrderMapper.java`、`services/commerce/src/main/resources/mapper/OrderMapper.xml`：数据库真正执行的操作。
5. `infra/mysql/002-orders.sql`、`scripts/initialize_database.py`：表约束、账号和增量初始化。
6. `services/commerce/src/test/java/lab/commerce/OrdersApiIT.java`：真实 HTTP/数据库失败与竞争实验。

Java 路径均相对 `services/commerce/src/main/java/lab/commerce/`，XML 位于 `src/main/resources/`。沿用 Controller → Service 接口 → ServiceImpl → Mapper 接口 → XML → MySQL，不增加缓存或消息层。

## 2. 登录为什么不传 userId

`GET /api/v1/auth/session` 返回 `{user, csrfToken}`；未登录时 user 为 null。页面用用户名和密码提交登录，Java 用数据库里的 PBKDF2 哈希验证，成功后由 `HttpSession` 保存 `UserView`，并更换 session ID 和 CSRF token。订单 API 从会话取 userId，不从 POST JSON 接受“我是谁”。否则攻击者只需把 userId 改成别人，就能越权。

`AuthServiceImpl.verify` 使用 JDK `PBKDF2WithHmacSHA256`，盐是随机 16 字节，派生 256 位哈希，迭代次数保存在编码里；用 `MessageDigest.isEqual` 比较。未知用户也执行派生，避免立即返回造成明显时间差。密码不以明文存数据库；本机初始化生成的演示登录凭据只放在被忽略的 `state/demo-users.json`。不要把真实值复制到笔记、日志或 SQLite。

Cookie 是 HttpOnly、SameSite Strict，本地 HTTP 不设置 Secure。浏览器自动携带同源会话 Cookie；页面不把密码或 session ID 存 localStorage。退出时旧 session 失效，新匿名 session 拿到新 CSRF token。应用重启会丢失内存会话，需要重新登录。

CSRF 是另一个问题：浏览器可能自动携带 Cookie，所以只有“带了 Cookie”不足以证明写请求来自本页面。`SessionAccess.preHandle` 对 API POST 比较 `X-CSRF-Token` 和 session 中的随机同步令牌，缺失/错误返回 403 CSRF_INVALID。登录和退出也需要令牌。用户和令牌保存在同一不可变认证快照中，请求在校验时绑定这个快照；控制器读取请求身份，避免另一标签切换账号后，旧请求误用新用户身份。令牌只在前端内存中传递；会话接口禁止缓存。CSRF 令牌不能替代用户身份或订单归属检查。

## 3. 核心事务逐段解释

`OrderServiceImpl.create` 的关键顺序是：

```java
@Transactional(isolation = Isolation.READ_COMMITTED)
public OrderView create(long userId, long productId, int quantity, String requestKey) {
    // 先查同一用户/键是否已有订单；有则核对商品和数量。
    // 从数据库读取商品名和 BigDecimal 单价，生成订单快照。
    try {
        mapper.insert(order);
    } catch (DuplicateKeyException exception) {
        var existing = mapper.findByRequestKey(userId, requestKey);
        if (existing == null) throw exception;
        return repeated(existing, productId, quantity);
    }
    if (mapper.deductStock(productId, quantity) != 1) {
        throw new OrderAccessException(INSUFFICIENT_STOCK);
    }
    return OrderView.from(order);
}
```

这是提取关键语句的阅读片段，不是可单独粘贴编译的完整方法；完整实现包含输入检查、商品查询和订单字段赋值。

`@Transactional` 由 Spring 代理建立边界，MyBatis 使用同一事务连接。INSERT 后还没有对外提交；库存不足抛出运行时异常时，库存与订单整体回滚。因此“先插入订单”并不意味着缺货订单会留在数据库里，也不意味着前端先收到成功。

库存 SQL：

```sql
UPDATE inventory
SET available_stock = available_stock - #{quantity}, version = version + 1
WHERE product_id = #{productId} AND available_stock >= #{quantity}
```

关键是把检查和扣减放在**同一个数据库语句**。如果 Java 先 SELECT 看到 1，再由两个线程各 UPDATE 减 1，它们都可能通过旧检查。这里 InnoDB 对该行加锁，后到的更新等待并检查当时的库存；更新行数为 0 表示没有足够库存。`CHECK available_stock >= 0` 再提供数据约束。

version 随扣减递增，但本课没有 `WHERE version = ?`，所以这不是一个乐观锁 CAS 实现。防超卖的直接机制是条件更新与 InnoDB 行锁。JVM synchronized 只能保护一个进程，不能代替数据库约束。

订单保存 productName、unitPrice 和 totalAmount 快照，后续商品改名/改价不改变既有订单。金额用 BigDecimal 乘整数，VO 调用 `toPlainString`，前端按字符串格式化，129.90 × 2 不经过 JavaScript Number 计算。

## 4. 幂等键与事务隔离

`commerce_order` 有唯一键 `(user_id, request_key)`。每个用户的一次下单意图对应一个键，两个用户使用相同键互不影响。同一键、相同商品和数量返回既有订单；同一键改参数返回 409 IDEMPOTENCY_CONFLICT。

仅在 Java 先 SELECT 是否存在是不够的：两个线程可以同时查到空。唯一 INSERT 才是竞争的裁判；第二个插入等待第一个事务提交，再收到重复键错误。它必须在任何库存扣减前发生，才能保证重复请求不会再次减库存。

MySQL 默认 REPEATABLE READ 的普通 SELECT 可能一直读取本事务先前的快照，看不见刚提交的赢家。因此本课下单方法显式选择 READ_COMMITTED：每条查询获得新的已提交快照，唯一冲突后的普通 SELECT 能读到赢家。它也避免在重复 INSERT 已持有索引锁后再用 FOR UPDATE 升级锁。其他只读/支付方法没有因此被全局改为 RC。这里依赖 InnoDB 对重复键失败语句的回滚行为；整个事务仍要正常退出才能返回重复结果。死锁或连接故障仍可能返回安全的服务错误，调用者应保持同一键重试。

前端 `OrderPanel.vue` 的 requestKey 只在内存中保存。网络超时/响应丢失可能发生在 Java 已提交之后，因此重试必须复用这个键。用户变更商品/数量是新意图；成功后下一次点击才是新意图。刷新或关闭页面会丢失未确认键：此时应先查询本人订单再决定是否重新下单，本课尚未实现跨刷新恢复待确认意图。

## 5. 订单归属与支付状态

列表在 SQL 直接用 session userId 过滤，只返回本人最近 100 条。详情查到订单后校验 userId；不存在返回 404 ORDER_NOT_FOUND，别人的订单返回 403 ORDER_FORBIDDEN。这个教学选择会暴露“该编号存在”，若业务要求隐藏存在性，可以统一 404，但必须同时更新契约和测试。

支付先 `findByIdForUpdate` 锁定订单，校验归属，再条件更新 `PENDING_PAYMENT → PAID`。重复支付返回 PAID，不再次扣库存。没有调用银行、支付网关或真实资金操作，也没有退款/取消路径。

订单金额以数据库商品快照为准，客户端不能提交单价或总额。状态只允许 PENDING_PAYMENT/PAID，数量 1..100，数据库有 CHECK 和外键；Controller 校验 HTTP 参数，Service 继续保留内部调用防御。

## 6. 前端为什么还要请求序号

AbortController 是停止等待的手段，不保证服务器事务已经停止。`OrderPanel` 同时用 authRequest/listRequest/mutationRequest 和 identityVersion 防止旧响应覆盖当前会话的数据。退出/更换身份时清空订单并取消旧列表/写请求；写操作期间禁用退出，减少一个页面内的身份竞争。旧列表也不能把刚支付的 PAID 覆盖回待支付。

错误保留为 ApiError 对象，computed 按当前词典转成展示文字。AUTH_REQUIRED、INVALID_CREDENTIALS、CSRF_INVALID、ORDER_FORBIDDEN、ORDER_NOT_FOUND、INSUFFICIENT_STOCK、IDEMPOTENCY_CONFLICT 加入三语；数据库/参数/商品错误继续复用。未知 code 用通用 HTTP 提示，后端 message 不直接进页面。切换语言只更新文案，不再请求业务数据。

`api.ts` 复用原 getJson，增加 POST body 和 CSRF 选项，同时保留 10 秒超时、取消、坏 JSON/坏结构校验。TypeScript 类型只是开发时说明；isSession/isOrder/isOrders 才检查真正从网络收到的 unknown 数据。

## 7. 正常输出与失败实验

正常下单返回 OrderView：id、productId、productName、quantity、unitPrice、totalAmount、currency=CNY、status、createdAt。详情与支付使用同一返回模型。前端显示待支付或已支付，以及原文商品名和人民币金额。

可观察的实验与意义：

| 实验 | 期望 |
|---|---|
| 匿名读取订单 | 401 AUTH_REQUIRED |
| 缺失 CSRF 写请求 | 403 CSRF_INVALID，不写数据库 |
| Bob 访问 Alice 的详情/支付 | 403 ORDER_FORBIDDEN |
| 10 件测试库存、20 次并发各买1件 | 10 成功，库存0，没有负数 |
| 并发同 requestKey | 一个订单、一次扣减，其余返回同一订单 |
| 同键修改数量 | 409 IDEMPOTENCY_CONFLICT |
| 事务中途制造异常 | 订单和扣库存一起回滚 |
| Java 已提交但浏览器没收到响应 | 同键重试返回原单 |
| 重复模拟支付 | 同一订单保持 PAID，库存不再次扣减 |

自动化使用专用测试商品和测试账号，清理时限定这些 fixture，保留原种子商品/库存。`OrdersApiIT` 使用额外的测试管理员连接管理 fixture，应用数据源仍为受限 writer。真实执行结果在 HANDOFF；本表是预期，不能当测试成绩。

## 8. 本机权限与生产边界

001/002 SQL 按文件名顺序增量执行，INSERT IGNORE 不重置既有种子库存。初始化生成 writer 与演示账号，重复初始化不重新生成密码或覆盖已有登录哈希。reader 仍只读；writer 只有商品 SELECT、库存 SELECT/UPDATE、用户 SELECT、订单 SELECT/INSERT/UPDATE，无 DDL/DELETE，不能修改登录密码。测试管理员环境只在 Maven 测试阶段短暂注入，随后清除。

当前绑定 loopback，内存 session、随机本地演示密码和同步 CSRF 足以学习该调用链。对公网生产仍需 TLS、Secure Cookie、限速、密码与会话生命周期、审计与支付回调设计，不能据本地通过声称这些已验证。无缓存、消息、Outbox 投递或分布式事务，不把后续目录当实现。

## 9. 小练习

1. 在 XML 找出真正防超卖的 WHERE 条件；解释移除它为什么 Java 数量校验不能补救。
2. 说明下单为什么单独选择 READ_COMMITTED，普通 SELECT 在 RR 下有什么边界。
3. 同键把数量从1改2，观察 409 后订单数和库存；不要修改真实种子做实验。
4. 已出现缺货提示后切换三语，观察提示立即变化且 Network 没有新的订单请求。
5. 判断“浏览器取消了请求”“数据库回滚了事务”“用户没收到成功响应”是否是同一件事。
