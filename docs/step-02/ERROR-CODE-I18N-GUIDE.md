# 错误码与前端统一翻译：后端管契约，Vue 管展示

> 历史说明（2026-10-18）：本文描述 `step-02 attempt-07` 的冻结状态，正文中的“当前/本轮”均指该次尝试。工程已继续 `step-03`，当前恢复请读 [step-03 HANDOFF](../step-03/HANDOFF-step-03.md) 并查询 SQLite。完整历史资料和证据见 [冻结目录](../history/step-02/attempt-07/)。当前不再维护 mindmap。


工程：`E:\ai_agent_learning\java_python`。实现始于 step-02 attempt-06，本文经 attempt-07 一致性审校，业务代码未改。用户决定语言只在前端管理；商品数据保留原文。以下代码对应当前源码，当前与历史执行结果见最新 HANDOFF。曾有的后端语言协商已冻结到 `docs/history/step-02/attempt-05`，不要按旧指南恢复。

## 1．业务场景：同一个不存在的商品，三种界面提示

用户查询不存在的商品时，后端始终返回：

```http
HTTP/1.1 404 Not Found
Content-Type: application/json

{"code":"PRODUCT_NOT_FOUND","message":"商品不存在或未上架"}
```

页面根据当前语言显示对应词条。英文界面可以显示 `This product does not exist or is not listed.`，日文界面显示 `商品が存在しないか、公開されていません。`。改变的是浏览器展示，不是商品或这次响应内容。

| 字段/信息 | 谁负责 | 是否随界面语言变化 |
|---|---|---|
| HTTP 404 | 后端 | 否 |
| code = PRODUCT_NOT_FOUND | 后端 | 否 |
| message = 固定安全中文 | 后端 | 否；供直接调用 API 时兜底 |
| 页面可见提示 | 前端 t()/词典 | 是 |
| 商品名、描述、SKU、价格字符串 | MySQL/API | 否；CNY 不换汇 |

后端不再解析业务语言，不维护三份错误资源；所有展示词条统一放在 `web/src/messages.ts`。

## 2．核心代码逐段解释

### 2.1 后端决定状态和稳定 code

`services/commerce/src/main/java/lab/commerce/exception/GlobalExceptionHandler.java`：

```java
@ExceptionHandler(ProductNotFoundException.class)
ResponseEntity<ApiError> notFound(ProductNotFoundException exception) {
    return error(HttpStatus.NOT_FOUND, "PRODUCT_NOT_FOUND", "商品不存在或未上架");
}

private ResponseEntity<ApiError> error(HttpStatus status, String code, String message) {
    // Keep a safe fallback for direct API users; the frontend translates the stable code.
    return ResponseEntity.status(status).body(new ApiError(code, message));
}
```

`@ExceptionHandler` 表示这种具体异常交由此方法处理。`ResponseEntity` 包含 HTTP 状态和响应对象，Spring 的 JSON 消息转换器把 `ApiError` record 序列化为 JSON。

`exception` 没有被直接拼到响应里。SQL、JDBC URL、凭据可能藏在原始异常中，固定安全文案能避免把它们回传给用户。去掉翻译并不代表去掉脱敏或异常分类。

现有契约：

| code | HTTP | 固定安全 message |
|---|---:|---|
| PRODUCT_NOT_FOUND | 404 | 商品不存在或未上架 |
| INVALID_ARGUMENT | 400 | 参数必须为整数且在有效范围内 |
| DATABASE_UNAVAILABLE | 503 | 数据服务暂不可用，请稍后重试 |
| INTERNAL_ERROR | 500 | 服务内部错误，请稍后联系维护人员 |

多个具体参数异常可以共用 INVALID_ARGUMENT。资源不可用与 SQL/映射内部错误仍分别返回 503 和 500；没有增加捕获所有 Exception 的处理器。

### 2.2 请求层只负责传输与结构化错误

`web/src/api.ts` 的 fetch：

```ts
response = await fetch(path, {
  signal: requestSignal,
  headers: { Accept: 'application/json' },
  cache: 'no-store',
})
```

这里不导入 `useI18n()`，不读取 `locale`，也不显式设置 `Accept-Language`。浏览器可能根据自己的偏好自动发送这个标准头，但当前后端自定义错误不依该头改变；不要误把 Network 面板中的原生语言头当作业务代码仍在设置它。

请求层继续保留 10 秒超时、外部取消、响应体读取错误、JSON 解码与运行时商品结构校验。改动没有削弱这些原有边界。

```ts
if (!response.ok) {
  const message = isObject(body) ? body.message : undefined
  const apiCode = isObject(body) && typeof body.code === 'string'
    ? body.code
    : undefined

  throw new ApiError(
    'HTTP',
    typeof message === 'string' && message.trim() ? message : httpMessage,
    { status: response.status, apiCode },
  )
}
```

`fetch` 收到 HTTP 404 通常不会自动 reject，因此代码主动检查 `response.ok`。它把错误保存为一个对象：

```text
ApiError.code     = HTTP                 请求层分类
ApiError.status   = 404                  HTTP 状态
ApiError.apiCode  = PRODUCT_NOT_FOUND    后端业务码
ApiError.message = 商品不存在或未上架     诊断/兜底数据
```

这里的 `code` 与 `apiCode` 不是同一个层次。网络断开时没有后端业务码，仍能用 `NETWORK` 等请求层分类选择提示。

### 2.3 页面把稳定标识映射到词条

`web/src/App.vue`：

```ts
function errorText(error: unknown, fallback: MessageKey): string {
  if (!(error instanceof ApiError)) return t(fallback)
  switch (error.code) {
    case 'TIMEOUT': return t('errorTimeout')
    case 'NETWORK': return t('errorNetwork')
    case 'INVALID_JSON': return t('errorInvalidJson')
    case 'INVALID_DATA': return t('errorInvalidData')
    case 'HTTP':
      switch (error.apiCode) {
        case 'PRODUCT_NOT_FOUND': return t('errorNotFound')
        case 'INVALID_ARGUMENT': return t('errorInvalidArgument')
        case 'DATABASE_UNAVAILABLE': return t('errorDatabaseUnavailable')
        case 'INTERNAL_ERROR': return t('errorInternal')
        default: return t('errorHttp', { status: error.status ?? '?' })
      }
  }
}
```

已知错误有具体翻译；未知错误码仍然使用当前语言的通用 HTTP 提示。代码不按中文句子猜错误类别，也不把服务端 `message` 直接显示给用户。

比如后端以后把安全中文调整为“商品暂不可查看”，只要 `PRODUCT_NOT_FOUND` 的含义和状态不变，现有前端映射依然有效。稳定 code 才是两端约定；message 不是供程序判断的契约键。

### 2.4 保存错误对象，而不是保存当时的翻译

```ts
const listError = ref<unknown>(null)
const listErrorMessage = computed(() =>
  errorText(listError.value, 'errorListFallback'),
)
```

请求失败时保存对象：

```ts
listError.value = error
```

`computed` 读取错误对象，内部又通过 `t()` 读取响应式 `locale.value`。这两项任一变化，相关文案都会重新计算：

```text
错误对象 + 当前 locale → errorText → t → 当前语言文案
```

如果在 catch 中直接写 `errorMessage.value = t('errorNotFound')`，得到的只是当时的一段字符串。语言切换不会重新执行旧 catch，文案会停留在旧语言。现在保存结构化数据，就能做到已有错误立即重译，无需再次访问 Java 或 MySQL。

## 3．调用链与底层原理

```text
Vue 查询按钮
  → getJson/fetch（与界面语言无关）
  → Vite /api 代理 → Java Controller → Service → Mapper/XML → MySQL
  → Service 抛具体异常
  → Spring MVC 选择对应 @ExceptionHandler
  → HTTP status + 固定 code + 安全固定中文 message
  → getJson 构造 ApiError，保存 apiCode/status/message
  → App.vue 保存错误对象
  → computed/errorText 按 apiCode 调用 t
  → messages[locale][key] → Vue 更新文字
```

语言选择仍由 `i18n.ts` 的共享 ref、localStorage 和 `setLocale()` 维护，`html.lang` 与标题继续同步。它不再跨 HTTP 传给后端。

## 4．正常输出与亲手观察

```powershell
curl.exe -i -H "Accept-Language: en" "http://127.0.0.1:18080/api/v1/products/999999999"
curl.exe -i -H "Accept-Language: ja" "http://127.0.0.1:18080/api/v1/products/999999999"
```

两个请求的自定义响应都应是 404、PRODUCT_NOT_FOUND 和相同的安全中文 message。不需要自定义 Content-Language 或 Vary: Accept-Language。语言头仍是标准 HTTP 信息，但不再驱动本课自定义错误展示。

页面切到英文后制造相同错误，页面应显示英文；再切到日文，已有错误立即变为日文，Network 不新增商品请求。商品成功响应、中文商品名与 `129.90` 这类精确金额字符串不变。

以上是教学预期。当前测试成绩、真实接口和浏览器结果只以本轮 HANDOFF/evidence/SQLite 为准。

## 5．失败实验与定位

| 实验 | 预期与定位 |
|---|---|
| 后端返回未知 code | 当前语言的通用 HTTP 提示，包含状态；不直出服务端 message |
| 后端返回带 SQL 字样的 message（只用测试替身） | 页面仍显示安全通用词条；真实后端也必须独立脱敏 |
| 返回 503 HTML | 保留 HTTP 503 分类，不能被 JSON 解析错误覆盖 |
| 200 返回错误商品结构 | INVALID_DATA，数据不写入商品状态 |
| 网络断开或超时 | NETWORK/TIMEOUT 的本地三语提示，不依赖后端词条 |
| 已有错误时换语言 | computed 重新翻译，没有新查询 |
| 后端新增 code 却不补前端映射 | 安全通用提示仍工作，但缺少具体说明，应补映射与测试 |

不要为了实验删除真实 MySQL 数据或清空 work/mysql-data。真实停库与模拟异常是不同证据；本轮是否执行应如实记录。

## 6．生产问题与当前边界

- 前后端版本可能不同步：前端必须对未知 code 有安全通用提示；既有 code 的含义不要随意改动。
- 页面不显示 raw message，不能代替后端脱敏。直接 API 调用者仍会收到 message，后端安全固定文案要保留。
- 日志使用诊断 metadata，业务错误码与追踪信息可以辅助定位；不要把 SQL、凭据和任意堆栈发给用户。
- 当前 4 个自定义 code 不等于覆盖全部框架错误。未知路由或框架默认响应可能没有 apiCode，前端仍走通用 HTTP 提示。
- 若以后开放面向多客户端的 API，需要重新按真实需求评估多语言契约；当前用户已选择前端统一管理，不提前恢复后端资源。
- 新增词条要三语同键，保持 TypeScript 检查；动态参数与占位符仍需测试，类型约束不会自动校对翻译质量。
- 请求取消不保证 SQL 已停止，前端的取消与请求序号保护仍需保留。

## 7．小练习与下一位 agent 的接入步骤

1. 解释 `ApiError.code = HTTP` 与 `apiCode = PRODUCT_NOT_FOUND` 的不同职责。
2. 假设新增 `PRODUCT_UNAVAILABLE`，先设计 HTTP 状态和固定安全中文 message，再在前端三语词典加键、App.vue 加 apiCode 映射。此练习只设计，不擅自扩大商品业务。
3. 保留原错误对象，分别切三种语言；解释为什么不需要重新请求。
4. 用测试替身制造未知 apiCode 和不安全 message，确认页面只显示当前语言通用提示。
5. 新增实现前先读 SQLite 当前 attempt；已完成则先归档/验哈希/reopen，完成后更新当前阶段指南、HANDOFF、完整源码快照和真实证据（step-03 起不再生成离线图），再事务登记/complete/导出 ROADMAP。不要每换一个聊天就重复 reopen，也不要从历史05恢复后端语言协商。
