# 第二步前端代码详解：从商品页面到真实 Java API

> 历史说明（2026-10-18）：本文描述 `step-02 attempt-07` 的冻结状态，正文中的“当前/本轮”均指该次尝试。工程已继续 `step-03`，当前恢复请读 [step-03 HANDOFF](../step-03/HANDOFF-step-03.md) 并查询 SQLite。完整历史资料和证据见 [冻结目录](../history/step-02/attempt-07/)。当前不再维护 mindmap。


工程：`E:\ai_agent_learning\java_python`。本课只实现商品查询。当前文档经 attempt-07 审校，代码实现沿用 attempt-06：三语 UI 使用类型化词典，展示语言统一在前端管理。api.ts 不导入 useI18n 或显式设置 Accept-Language；后端只返回稳定错误码、状态和固定安全中文兜底信息。结构化错误支持即时切换；商品名称、描述保留原文，CNY 不换汇。学习时打开 App.vue、api.ts、messages.ts、i18n.ts 和 Network 面板；旧语言协商已归档至 attempt-05，当前与历史成绩见最新 HANDOFF。

## 1. 业务场景与启动入口

使用者打开页面，查看 MySQL 中的商品。列表展示名称、SKU、价格和可用库存；点击「查看详情」时，再向后端请求单件详情。输入关键词只筛选当前已加载的一页，并不查询整个数据库。顶部选择框切换界面、ARIA 和错误提示，请求层不随语言改变；不翻译数据库商品内容，不自动重发商品查询。界面中没有新增、订单或支付入口。

```powershell
Set-Location 'E:\ai_agent_learning\java_python\web'
npm ci
npm run dev
```

浏览器访问 `http://127.0.0.1:15173`。Java 服务须先在 `127.0.0.1:18080` 启动。若尚未生成 package-lock.json，应先由工程初始化执行 `npm install`，以后使用 `npm ci` 按锁文件复现。类型检查和生产构建执行 `npm run build`。锁文件应提交，node_modules 不提交。

`vite.config.ts` 的关键配置（省略其他项）：

```ts
const env = loadEnv(mode, '.', ['COMMERCE_WEB_PORT', 'COMMERCE_API_TARGET'])
const port = Number(env.COMMERCE_WEB_PORT || 15173)
const apiTarget = env.COMMERCE_API_TARGET || 'http://127.0.0.1:18080'
return {
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true,
    proxy: { '/api': apiTarget },
  },
  preview: { host: '127.0.0.1', port, strictPort: true },
}
```

`strictPort` 避免端口被占用后静默改成另一个地址。默认浏览器请求 `15173/api/...`，Vite 开发服务器转发到 `18080/api/...`。对浏览器而言，这是同源请求，因此本课不需要添加宽松的跨域配置。代理没有删除 `/api` 前缀。

当前启动脚本从 state/runtime.json 导出 COMMERCE_WEB_PORT 与 COMMERCE_API_TARGET，Vite 通过 loadEnv 读取；package.json 与 Run-Web 不再重复硬编码 CLI 端口。单独 npm run dev 没有这些变量时仍使用上述默认值。这两个变量用于开发服务器配置，不通过 import.meta.env 把服务端密钥注入页面。

**生产中的坑：代理配置不会打进静态文件。** 正式部署应由 Nginx、网关或同一应用入口转发 `/api`。当前安装的 Vite 在没有单独配置 preview.proxy 时会继承 server.proxy，所以 `npm run preview` 可能仍能转发 API；这来自本地预览服务器，不是 dist 自带了代理。preview 用于本地预览构建，不能当作完整生产部署。

## 2. 应用如何启动：HTML → Vue → 组件

`index.html` 放置 `<div id="app"></div>` 并加载 `src/main.ts`：

```ts
import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')
```

`createApp` 创建 Vue 应用上下文，`mount` 将根组件挂到实际 DOM。`.vue` 是 Single File Component，浏览器不能直接解释；Vite 的 Vue 插件在开发时转译，并在构建时生成 JavaScript 和 CSS。

`<script setup lang="ts">` 中的顶层变量可以直接用于模板，不需要额外写 `return`。TypeScript 的接口在编译后会被擦除，主要帮助开发时检查字段与函数调用；它不是网络边界上的运行时数据校验器。

## 3. API 契约：不要把金额变成浮点数

`api.ts` 明确页面收到的数据：

```ts
export interface Product {
  id: number
  sku: string
  name: string
  description: string
  price: string
  availableStock: number
}

export interface ProductPage {
  items: Product[]
  page: number
  size: number
  total: number
}
```

- `GET /api/v1/products?page=1&size=20` 返回一个 ProductPage。
- `GET /api/v1/products/{id}` 返回单个 Product。
- 错误响应的正文为 `{code, message}`，HTTP 状态码本身仍须正确设置。

`price` 是十进制文本，例如 `"129.90"`。数据库 DECIMAL、Java BigDecimal 和浏览器字符串必须保持同一个精度约定。如果服务端发送 JSON 数字 `129.9`，浏览器会解析为 IEEE 754 二进制浮点数；转回字符串也无法恢复已经丢失的精度与尾零。

```ts
export function formatPrice(value: string): string {
  const [whole = '0', fraction = ''] = value.split('.')
  return `¥${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction.padEnd(2, '0')}`
}
```

这里仅插入千位分隔符和至少补齐两位小数，不经过 `Number`。输入 `"129.90"` 输出 `¥129.90`；输入 `"1000.00"` 输出 `¥1,000.00`。实际 MySQL DECIMAL(12,2) 数据目前返回两位小数。OpenAPI 的价格正则允许任意非空小数位，运行时校验沿用这个契约；formatPrice 不会截断或舍入超过两位的小数。这个函数不承担金额运算、汇率或舍入业务。未来做订单总价，应在 Java BigDecimal 中计算并返回结果，不能直接用 JavaScript `0.1 + 0.2` 处理账务。

## 4. 发请求、读取响应体、校验数据

`fetchProducts` 和 `fetchProduct` 继续构造各自路径，共用小型 `getJson`。每个调用同时传入对应的运行时校验函数；页面的调用方式不需要改变。

```ts
async function getJson<T>(
  path: string,
  signal: AbortSignal,
  validate: (value: unknown) => value is T,
): Promise<T>
```

`T` 表示调用方期望的类型，`unknown` 表示未经检查的网络数据，`value is T` 是 TypeScript 类型谓词。调用 `validate(body)` 返回 true 后，编译器允许把 body 当作 T；真正判断字段的是校验函数里的普通 JavaScript 条件，不是类型标注自动产生的检查。

请求必须按三个边界理解：

1. `await fetch(...)` 等到响应头，此时响应体不一定已读完。
2. `await response.text()` 等到完整响应文本；慢响应、取消、超时也可能发生在这里。
3. `JSON.parse(text)` 将文本解码为值；随后校验值的结构是否符合 Product 或 ProductPage。

前两个异步阶段放在同一个 try/catch 中，调用方取消继续抛原异常；超时根据独立 timeoutSignal 的状态分类；其余网络/读取失败生成 NETWORK 类型的 ApiError。JSON.parse 使用独立的 catch，避免把语法错误与网络错误混在一起。`AbortSignal.any/timeout` 面向现代浏览器。取消结束前端读取与等待，不能保证后端操作已撤销；未来写操作仍需服务端超时、幂等和结果查询。

fetch 只显式设置 Accept: application/json，不读取界面语言。浏览器可能自动发送它自己的 Accept-Language，但后端自定义错误不依该头变化；商品数据仍保持原文。语言切换只影响 Vue 展示，不触发请求。

**HTTP 404/503 一般不会让 fetch 自动 reject。** 收到非 2xx 时，ApiError 保存 HTTP 状态、服务端 code 和安全 message；后者是固定安全中文兜底信息，但页面不直接展示它。App.vue 根据稳定错误码选择当前语言词条，所以语言在请求过程中或报错后改变，显示仍能即时更新。未知错误码使用含状态码的翻译。即使代理返回 HTML，也保留 503 等 HTTP 信息。成功响应分别检查 JSON 能否解析、字段和取值能否通过校验。

```ts
export type ApiErrorCode = 'TIMEOUT' | 'NETWORK' | 'INVALID_JSON' | 'INVALID_DATA' | 'HTTP'
```

ApiError 的 code 描述浏览器请求阶段；apiCode 承接服务端 PRODUCT_NOT_FOUND、INVALID_ARGUMENT、DATABASE_UNAVAILABLE、INTERNAL_ERROR 等业务错误码。它们分别映射到界面词条。详情要求商品字段完整，列表要求每项都是有效商品、分页字段安全且结果长度一致。

因此 `200 {}` 现在会被拒绝，合法的 `200 {items:[],page:1,size:20,total:0}` 仍然是空状态。通过检查后直接返回 body，不再以 `as T` 把未知数据强行视作业务对象。完整源码逐段说明和错误优先级见 [getJson 专课](GETJSON-CODE-GUIDE.md)。

页面通过 computed 和 t 产生错误提示，再用 Vue 文本插值展示，不使用 v-html。validate 解决响应结构问题，不检查登录权限，也不替代后端业务约束。ApiError 的源码与诊断信息边界见 [getJson 专课](GETJSON-CODE-GUIDE.md)，语言切换原理见 [I18N 专课](I18N-CODE-GUIDE.md)。

## 5. 响应式状态：数据变化如何变成 DOM 更新

```ts
type LoadState = 'loading' | 'success' | 'error'
const listState = ref<LoadState>('loading')
const keyword = ref('')
const selectedId = ref<number | null>(null)
const detail = ref<Product | null>(null)
```

可以把 `ref` 理解为一个会追踪读取与写入的值容器。在 TypeScript 中使用 `.value` 访问，在模板中 Vue 自动解包。组件渲染读取这些值后会建立依赖；写入新值会触发更新任务。Vue 会批量调度渲染，再比较虚拟节点并更新需要变化的 DOM，不要求开发者手工 `document.querySelector` 修改每一行。

列表和详情使用两个独立状态：详情失败不应把已成功的列表整体变成错误。`selectedId === null` 则是详情区的未选择状态。空结果不是网络失败，应放在 success 分支。

```ts
const products = computed(() => {
  const query = keyword.value.trim().toLocaleLowerCase('zh-CN')
  return page.value.items.filter(product =>
    `${product.name} ${product.sku}`
      .toLocaleLowerCase('zh-CN').includes(query),
  )
})
```

`computed` 是依赖驱动的派生值。关键词或已加载数据改变时重新计算，其余读取可以使用缓存。`v-model="keyword"` 把 input 事件写回状态，过滤结果随之变化。本课每页最多 20 件，浏览器线性扫描足够，无需为这项操作加入搜索库。数据增长后的升级方向是服务端分页搜索，而不是下载整个商品库到浏览器。

### 5.1 语言也是响应式状态，错误保存对象

```ts
const { locale, setLocale, t, languageOptions } = useI18n()
const listError = ref<unknown>(null)
const detailError = ref<unknown>(null)
const listErrorMessage = computed(() => errorText(listError.value, 'errorListFallback'))
const detailErrorMessage = computed(() => errorText(detailError.value, 'errorDetailFallback'))
```

catch 保存 error 对象，不提前把它转成中文字符串。errorText 根据 ApiError.code/apiCode 调用 t，t 内部读取 locale.value，因此 computed 同时依赖错误对象和当前语言。页面已经显示错误后切换语言，提示会立即重新计算，不需要再次请求接口。

messages.ts 提供 3 个语言的 62 个词条；中文决定 MessageKey 联合类型，英文和日文须完整实现这些键。i18n.ts 的模块级 ref 由所有 useI18n 调用共享，setLocale 先校验白名单，再更新状态、localStorage 和文档语言/标题，不为每个组件创建 watcher。

模板中的 `{{ t('totalCount', { count: page.total }) }}` 有两层含义：Vue 的双花括号执行 JavaScript 表达式；t 在选中的词条里替换单花括号 `{count}`。它不翻译整个商品对象，`{{ product.name }}` 仍显示数据库内容。

## 6. 取消与竞态：为什么要同时用 AbortController 和序号

想象先点商品 A，随后立即点 B。A 的请求可能更慢，如果直接把每次响应写入 detail，最后会出现「B 已选择，面板却显示 A」的问题。

```ts
detailController?.abort()
const controller = new AbortController()
detailController = controller
const request = ++detailRequest
selectedId.value = id
detail.value = null
detailState.value = 'loading'

const product = await fetchProduct(id, controller.signal)
if (request !== detailRequest || controller.signal.aborted) return
detail.value = product
detailState.value = 'success'
```

- abort 用于停止旧请求的读取与等待，减少无用工作。
- 请求序号用于保护写入状态的资格：只有最新请求能够提交结果。
- `detail.value = null` 避免 loading 期间继续显示上一个商品，造成旧值冒充新值。
- catch 也先检查序号和取消标记，因此用户主动切换商品不会弹出错误。

这类问题发生于异步完成顺序，并不要求 JavaScript 同时执行两个线程。单线程事件循环也会遇到过期响应覆盖。

刷新列表或翻页会调用 `clearDetail`，取消详情、递增详情序号并清空选择；组件卸载时同时取消两类请求。列表同样有自己的 controller 和序号。两条请求链相互独立。

## 7. 模板分支与可访问性

```vue
<div v-if="listState === 'loading'" role="status">...</div>
<div v-else-if="listState === 'error'" role="alert">...</div>
<div v-else-if="products.length === 0" role="status">...</div>
<div v-else class="table-scroll">...</div>
```

`v-if` 在条件变化时创建或销毁对应 DOM。分支顺序很重要：先判断 loading/error，再判断空数组；否则初始空数组会闪现「没有商品」，网络失败也可能被误画成正常空状态。

表格 `v-for` 使用稳定的 `:key="product.id"`，帮助 Vue 识别同一商品。按钮设置 `aria-label`，读取商品名来区分每一行。原生 button 支持 Tab、Enter、Space；整行可点击 div 往往还需要自行补齐键盘语义，因此本课不这样做。

语言选择框有供辅助技术读取的 label，选项固定显示为中文、English、日本語，便于在不熟悉当前界面语言时识别。按钮、表格 caption、分页标签和加载状态同样通过 t 翻译；商品详情 ARIA 中的名称参数仍为数据库原文。document.documentElement.lang 与 document.title 随选择同步。

搜索有可见 label；列表和详情设置 `aria-busy`，加载提供 status，错误提供 alert。选中商品时既有背景变化，也有「已选择」文字，不只靠颜色。详情保留常驻区域，不强制抢焦点。窄屏详情排在列表下方，用户可以正常滚动到达。

**本课边界：** 浏览器自动化可以验证布局与键盘焦点，但不能替代完整屏幕阅读器审计。发布给真实用户前应结合目标设备和辅助技术进行实际检查。

## 8. 一次完整调用链

```text
onMounted
  → loadPage(1)
  → fetchProducts(1, 20, signal)
  → fetch('/api/v1/products?page=1&size=20')
  → Vite 同源代理
  → Java Controller / Service / MyBatis
  → MySQL
  → JSON ProductPage
  → page.value = result
  → Vue 批量刷新 DOM

点击详情
  → loadDetail(id)
  → GET /api/v1/products/{id}
  → detail.value = product
  → 更新详情面板
```

浏览器 Network 面板应能够看到列表和详情是两次真实请求。页面点击详情不只是复制当前行数据，因此可以用单独的详情错误实验验证链路。

## 9. 失败实验与应观察的证据

| 场景 | 操作 | 应出现的现象 | 恢复 |
|---|---|---|---|
| 当前页筛选无匹配 | 输入一个不存在的 SKU | 「当前页没有匹配的商品」 | 点击清除筛选 |
| 列表失败 | 在测试环境停 Java 或阻断列表请求后点击刷新 | 列表错误及重新加载，不能冒出假商品 | 恢复 Java，点击重新加载 |
| 详情失败 | 阻断单件详情接口后点击详情 | 列表保留，详情区单独报错 | 恢复接口，点击重试详情 |
| 慢响应 | 在测试浏览器给列表增加延迟 | 显示骨架、刷新暂时禁用 | 响应到来后显示商品 |
| 响应乱序 | A 详情延迟，随后选择 B | 最后选择与详情均为 B | 无需手工修复 |
| 真空列表 | 测试路由返回空 items/total=0 | 「还没有商品」 | 恢复真实路由并刷新 |
| 合法 JSON、错误结构 | 测试路由返回 HTTP 200 和 `{}` | 显示数据结构错误，页面不因读取 items 崩溃 | 恢复真实响应并重试 |
| HTTP 错误、非 JSON | 测试路由返回 HTTP 503 和 HTML | 显示带 503 的请求失败信息 | 恢复真实响应并重试 |
| 响应体超时 | 测试让头部到达但响应体持续未完成 | 显示超时，不误报 JSON 格式错误 | 恢复响应或重试 |
| 错误中切换语言 | 先注入503，再切换为English或日本語 | 同一错误立即换语言，无需新增请求 | 恢复真实响应并重试 |
| 无效语言偏好 | localStorage 的 commerce-lab.locale 写为无效值后刷新 | 回退中文，页面继续可用 | 选择有效语言 |
| 存储不可用 | 测试拦截localStorage读写抛异常 | 默认中文；仍可在当前页面切换语言 | 恢复存储或关闭测试拦截 |
| 窄屏与键盘 | 约 390px 视口、Tab/Enter 操作 | 搜索和详情仍能操作，焦点可见 | 返回桌面视口 |

路由拦截只用于故障或状态测试，不进入应用代码，不算真实数据库验收。验收必须另外用真实 Java/MySQL API 记录正常结果。为做空状态实验不需要删除真实表数据。

## 10. 上生产前会遇到的问题

1. **入口与网络：** `127.0.0.1` 表示发起请求机器或所在容器自己。若 Vite/Nginx 运行在容器里，不能用自己的 localhost 访问另一个容器；应配置 Compose 服务名或网关地址。浏览器中的 localhost 也不是服务器地址。
2. **身份与授权：** 当前商品查询是学习范围，未来订单/工单必须由后端验证用户和资源权限；隐藏前端按钮不构成权限控制。密钥不能进入 VITE_ 环境变量，因为它们会打进客户端文件。
3. **金额与数量：** 展示保留十进制字符串；所有扣库存与计价在后端处理。页面库存只是查询时快照，不能保证稍后下单一定成功。
4. **分页与一致性：** 当前 offset 分页适合少量商品。数据频繁变化时可能跨页重复或遗漏，深分页也可能慢；有明确需求再引入游标分页。当前页过滤不冒充服务端搜索。
5. **超时与重试：** 本课自动取消读取并提供人工重试。未来 POST 不应无条件自动重试；网络超时可能发生在服务器已经提交之后，要用幂等键与结果查询。
6. **构建与发布：** `npm run build` 的成功表示 TypeScript 与打包成功，不等于接口可用。CI 还需在实际版本上执行契约、集成与必要浏览器检查。静态文件可使用内容哈希长缓存，HTML 保持能及时指向新版本。
7. **输入与输出：** 后端执行参数校验，SQL 使用 MyBatis 参数绑定。Vue 默认文本插值会转义 HTML，但引入 v-html 或未经处理的富文本会重新打开 XSS 风险。
8. **观察与隐私：** 前端需要可追踪的错误与请求关联信息，后端需要延迟和数据库指标；日志不要记录身份令牌、用户敏感数据或模型密钥。
9. **运行时契约：** 当前手写校验覆盖商品和分页字段，允许额外字段，不负责完整 JSON Schema、响应体体积上限或所有业务语义。Java long 能超出 JavaScript 安全整数范围；当前校验拒绝此类值，未来 ID 增长或对接外部数据时，应将 ID 契约改为字符串并同步两端，而非删除防护。
10. **语言偏好：** localStorage 只是当前浏览器同源的界面偏好，不是认证或服务端授权依据。当前不做跨标签页同步、商品内容翻译或币种换算；语言不改变数据库、SKU、商品ID或金额精度。

## 11. 本课小练习

先独立完成，再与请求链路对照：

1. 在详情中为库存为 0 的商品增加一条明确说明，保持原有数据库/API 不变。
2. 在 Network 面板找到一次列表、一次详情请求，说明它们的 URL、状态码、响应字段与 Initiator。
3. 输入不存在的名称，解释为什么 UI 没有向 Java 发起新请求；再说出要做全库搜索应该改哪一层。
4. 临时在测试里延迟 A 的详情，快速选择 B；删除请求序号保护再观察差异，完成后恢复保护。
5. 将测试商品 price 改成数字 129.90，再改回字符串 "129.90"，说明为什么两次 JSON.parse 都能成功，但只有后者通过商品校验。
6. 已显示请求错误时切换语言，解释为什么保存 Error 对象配合 computed，比 catch 中保存一次 t(...) 的结果更适合实时切换。

下一步会实现订单与库存事务；现有查询接口继续作为读链路，库存正确性由 Java/MySQL 的条件更新与事务决定。
