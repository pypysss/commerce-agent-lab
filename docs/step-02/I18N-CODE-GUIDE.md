# Vue + TypeScript 多语言专课：界面如何随语言状态更新

> 历史说明（2026-10-18）：本文描述 `step-02 attempt-07` 的冻结状态，正文中的“当前/本轮”均指该次尝试。工程已继续 `step-03`，当前恢复请读 [step-03 HANDOFF](../step-03/HANDOFF-step-03.md) 并查询 SQLite。完整历史资料和证据见 [冻结目录](../history/step-02/attempt-07/)。当前不再维护 mindmap。


工程：`E:\ai_agent_learning\java_python`。三语界面始于 attempt-04，前端统一管理展示语言的实现始于 attempt-06；本轮 step-02 attempt-07 只审校文档，业务代码未改。源码为 web/src/messages.ts、i18n.ts、App.vue 和 api.ts；Java 38 项及前端 45 项属于 attempt-06 历史结果，当前验收见 HANDOFF，不用历史结果替代。

## 1．业务场景与本轮范围

商品查询界面支持中文、English、日本語。标题、按钮、空状态、加载提示、ARIA 和错误提示随选择切换，刷新后尽量保留偏好。

用户确认商品名称、描述、SKU 和数据库内容保持原文，不调用模型翻译；价格仍是人民币 CNY，不换成美元或日元。后端现有自定义错误的展示提示按 code 在前端翻译，后端 message 保留固定安全中文；不扩展商品、日志或所有框架错误。前端原理仍聚焦 Vue 响应式、TypeScript 键约束、函数参数与错误数据。

职责分布：

| 文件 | 职责 |
|---|---|
| messages.ts | 三种语言的 62 个词条与纯字符串插值，无 Vue 依赖 |
| i18n.ts | 当前语言 ref、偏好读写、文档语言/标题同步 |
| App.vue | 选择框、翻译调用、错误对象到词条的映射 |
| api.ts | 不读取界面语言，返回商品或结构化 ApiError；保留稳定 apiCode 和服务端安全 message，UI 展示由词条决定 |

## 2．核心代码逐段解释

### 2.1 用 TypeScript 限制语言与词条键

```ts
export const locales = ['zh-CN', 'en', 'ja'] as const
export type Locale = typeof locales[number]
```

`as const` 保留三个字符串的字面量类型，Locale 因而是 `'zh-CN' | 'en' | 'ja'`，而不是任意 string。`typeof locales[number]` 表示取数组元素类型，并没有在运行时遍历数组。

中文词典中包含：

```ts
const zh = {
  appTitle: '商品查询 · Commerce Lab',
  homeLabel: 'Commerce Lab 首页',
  // 其余词条见完整源码
} as const

export type MessageKey = keyof typeof zh
```

这里片段省略其余键，完整文件有 62 个。`keyof` 将中文词条的键组成联合类型，因此 t('pageTitle') 合法，拼错成 t('pageTitlte') 会在类型检查时报错。

英文、日文分别声明为 `Record<MessageKey, string>`，保证每个中文键都有对应字符串；最终导出为：

```ts
export const messages = { 'zh-CN': zh, en, ja } satisfies Record<Locale, Record<MessageKey, string>>
```

`satisfies` 检查对象是否符合结构，不把它变成新的运行时对象，也不会自动检查翻译语义或占位符是否写对。占位符一致性由词典测试检查，翻译内容仍需人工阅读。

### 2.2 纯函数怎样替换参数

```ts
export function translate(
  locale: Locale,
  key: MessageKey,
  params: Record<string, string | number> = {},
): string {
  return messages[locale][key].replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : placeholder,
  )
}
```

例如：

```ts
translate('zh-CN', 'totalCount', { count: 3 }) // 共 3 件商品
translate('en', 'pagePosition', { page: 2, pages: 5 }) // Page 2 of 5
```

`messages[locale][key]` 先选择文本，正则找到 `{count}` 或 `{page}`，再从 params 中取值。Object.hasOwn 只接受参数对象自己的字段，count=0 也能正确替换；缺少参数时保留原占位符，便于发现调用遗漏。

英文使用 `Products: {count}` 等表达避免简单数量的单复数分支；当前没有实现复数规则框架。这个函数只返回文本，不返回 HTML，也不修改商品对象。

### 2.3 从 localStorage 读取偏好

```ts
const storageKey = 'commerce-lab.locale'

function isLocale(value: string): value is Locale {
  return locales.some(locale => locale === value)
}

function readLocale(): Locale {
  try {
    const stored = typeof window === 'undefined' ? null : window.localStorage.getItem(storageKey)
    return stored !== null && isLocale(stored) ? stored : 'zh-CN'
  } catch {
    return 'zh-CN'
  }
}

const locale = ref<Locale>(readLocale())
```

localStorage 的值不因为名为 locale 就可信，所以重新检查白名单。没有值、值是 fr 或存储读取抛异常时，都回退中文。环境没有 window 时也默认中文，便于在非浏览器测试中导入模块。

locale 定义在模块级，不是在 useI18n 内重新创建；多个组件调用 useI18n 会共享同一语言状态。这里没有为每个组件注册 watcher。

### 2.4 切换时更新状态、存储与文档

```ts
function setLocale(next: string) {
  if (!isLocale(next)) return
  locale.value = next
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(storageKey, next)
  } catch {
    // A blocked or full store must not prevent changing the current interface.
  }
  syncDocument()
}

function syncDocument() {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale.value
    document.title = translate(locale.value, 'appTitle')
  }
}
```

setLocale 接收 string 是因为 HTML select 的 value 本来是普通字符串，不能仅靠 TypeScript 假设它一定有效。非法值直接忽略；有效值先更新 ref。存储写失败只意味着下次刷新可能无法保留选择，本页切换照常生效。

document.documentElement.lang 告诉浏览器和辅助技术当前界面语言；document.title 更新标签页标题。模块初始化最后也调用一次 syncDocument，使刷新读到的偏好立即反映到文档，不需要等用户再选一次。

### 2.5 t 为什么能触发响应式更新

```ts
function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return translate(locale.value, key, params)
}

export function useI18n() {
  return { locale, setLocale, t, languageOptions }
}
```

t 不把初次语言复制成普通变量，而是在每次执行时读取 locale.value。模板或 computed 调用 t 时，这次读取会成为 Vue 的响应式依赖。setLocale 改变 ref 后，依赖它的界面重新计算。

languageOptions 固定为中文、English、日本語，对应 value 是 zh-CN、en、ja。选项使用本国语名，用户即使不懂当前界面语言，也能找到自己的语言。

## 3．Vue 模板插值与错误实时翻译

### 3.1 用户选择如何到达 ref

App.vue 的现有代码：

```ts
const { locale, setLocale, t, languageOptions } = useI18n()

function changeLanguage(event: Event) {
  if (event.target instanceof HTMLSelectElement) setLocale(event.target.value)
}
```

```vue
<select id="language-select" :value="locale" @change="changeLanguage">
  <option v-for="language in languageOptions" :key="language.value"
    :value="language.value" :lang="language.value">{{ language.label }}</option>
</select>
```

`:value` 绑定当前状态，`@change` 把事件传给函数。`instanceof HTMLSelectElement` 在运行时确认 target 确实是选择框，随后读取 value。它没有将任意 DOM 事件强行断言成选择框。

### 3.2 两种“插值”需要分清

```vue
{{ t('totalCount', { count: page.total }) }}
```

- 外层 `{{ ... }}` 是 Vue 模板表达式，执行 t 函数，模板会自动解包顶层 ref。
- `{ count: page.total }` 是 JavaScript 对象字面量，给 t 传参数。
- 中文词条里的 `共 {count} 件商品` 是普通字符串，单花括号由 translate 的正则替换。

这与 JavaScript 的模板字符串也不同。当前商品筛选中的 `` `${product.name} ${product.sku}` `` 使用反引号与 `${...}`，是 JavaScript 自身拼接字符串的语法。三个机制作用在不同阶段，不能混用。

### 3.3 错误保存对象，显示时才翻译

```ts
const listError = ref<unknown>(null)
const detailError = ref<unknown>(null)
const listErrorMessage = computed(() => errorText(listError.value, 'errorListFallback'))
const detailErrorMessage = computed(() => errorText(detailError.value, 'errorDetailFallback'))
```

请求失败的 catch 保存 `listError.value = error`。如果只保存 `error.message`，或在 catch 中保存一次 t(...) 的结果，状态里留下的就是当时语言的普通字符串；后续语言变化不会重新执行那次 catch。

当前 computed 根据错误对象调用 errorText，errorText 再调用 t。依赖关系为：

```text
listError / detailError ──┐
                         ├─ computed → t → 当前语言提示
locale.value ────────────┘
```

因此已经显示错误时切换语言，不需要再次请求后端。列表和详情继续有各自状态，详情失败不会抹掉正常列表。

### 3.4 code 与 apiCode 如何映射

api.ts 的 ApiError 保存 code/status/apiCode，App.vue 只接受已知类别：

| 浏览器 code | 服务端 apiCode | 页面词条 |
|---|---|---|
| TIMEOUT | 不需要 | errorTimeout |
| NETWORK | 不需要 | errorNetwork |
| INVALID_JSON | 不需要 | errorInvalidJson |
| INVALID_DATA | 不需要 | errorInvalidData |
| HTTP | PRODUCT_NOT_FOUND | errorNotFound |
| HTTP | INVALID_ARGUMENT | errorInvalidArgument |
| HTTP | DATABASE_UNAVAILABLE | errorDatabaseUnavailable |
| HTTP | INTERNAL_ERROR | errorInternal |
| HTTP | 未知或没有 | errorHttp，插入 HTTP status |
| 非 ApiError | 不适用 | 列表/详情各自的 fallback 词条 |

HTTP 分支的实际代码：

```ts
case 'HTTP':
  switch (error.apiCode) {
    case 'PRODUCT_NOT_FOUND': return t('errorNotFound')
    case 'INVALID_ARGUMENT': return t('errorInvalidArgument')
    case 'DATABASE_UNAVAILABLE': return t('errorDatabaseUnavailable')
    case 'INTERNAL_ERROR': return t('errorInternal')
    default: return t('errorHttp', { status: error.status ?? '?' })
  }
```

服务器固定安全中文 message 保留在 ApiError.message 里，页面不直接展示，而按 apiCode 使用当前语言的本地词条。所有展示语言在前端维护，因此无需切换时重发商品请求，也不按句子内容猜错误类别。后端已移除业务语言配置及三语资源，只决定稳定 code、状态和安全兜底 message；见 [错误码与前端统一翻译](ERROR-CODE-I18N-GUIDE.md)。

## 4．正常输出与数据边界

| 选择 | 页面主标题 | 空列表标题 |
|---|---|---|
| 中文 | 商品查询 | 还没有商品 |
| English | Product catalog | No products yet |
| 日本語 | 商品検索 | 商品はまだありません |

所有选择下，商品名称“Java 并发学习手册”和数据库描述保持原文；`price:"129.90"` 仍通过 formatPrice 显示为 `¥129.90`。页脚明确 CNY，不因日文界面将这个符号解释为日元。

金额格式函数继续用字符串分段，不转 Number，不进行汇率计算。详情按钮的 ARIA 会翻译句式，并把原始商品名作为 `{name}` 参数插入。

## 5．失败实验与观察方式

1. 将 commerce-lab.locale 临时写成 fr 后刷新：应回退中文，不让任意值进入词典索引。
2. 在测试环境使 localStorage.getItem 抛异常：默认中文；让 setItem 抛异常后选择 English：本页应仍切换，刷新是否保留取决于存储。
3. 页面显示 HTTP 503 错误后切换日本語：同一错误应立即换语言，Network 不应为切换额外发送商品请求。
4. 注入未知业务 code 和中文 message：页面使用当前语言通用状态码提示，不原样泄露中文 message。
5. 选 English 后刷新：存储可用时仍为 English，html.lang 与 document.title 同步；商品名称不变。
6. 从英文词典删掉一个键，在隔离副本执行类型检查：应发现缺失；把占位符拼错则需运行词典测试发现。

执行当前前端测试和类型检查/构建：

```powershell
npm --prefix E:\ai_agent_learning\java_python\web test
npm --prefix E:\ai_agent_learning\java_python\web run build
```

测试成绩见本轮验收证据。字典单测、偏好测试和浏览器交互各自验证不同边界，不用“能启动”替代它们。

## 6．生产边界与坑

- localStorage 只是同源浏览器中的语言偏好，不是用户身份、登录令牌或授权依据；被修改不应影响后端权限。
- 当前没有跨标签页 storage 事件同步，也没有根据浏览器语言自动选语或服务端用户语言偏好。需要时再明确优先级，避免多个来源互相覆盖。
- 当前采用小型手写词典，支持命名参数，不支持复杂复数、富文本、多时区或翻译平台流程。语言和页面增长后可评估成熟方案，不必现在引入框架。
- 商品内容和搜索仍针对数据库原文；界面语言不自动产生英文/日文商品索引，也不创建多语言数据库字段。
- 页面只显示本地词条，但服务端仍不得在 message 中返回 SQL、堆栈或密钥；这些内容即使不显示，也会出现在网络响应和诊断对象里。
- Vue 文本插值会按文本展示，不能为了翻译方便改成 v-html。所有普通标题、ARIA 和错误文案都应经过同一词条入口。
- 浏览器取消或超时只能停止本地读取与等待，不能保证后端操作已撤销；未来订单写请求仍需要服务端超时、幂等与结果查询。

## 7．小练习

1. 解释 as const、keyof、Record 和 satisfies 分别限制了什么，哪些限制不会留到浏览器运行时。
2. 用 0 件商品解释为什么 `Products: {count}` 不需要当前未实现的复数框架。
3. 将 catch 中错误改存一次 t(...) 的结果，观察切换语言的差异，然后恢复对象与 computed。
4. 指出模板里的对象花括号、Vue 双花括号、词条参数和 JS `${...}` 各由谁处理。
5. 新增一个界面提示时，列出需修改的三个词典、模板和测试；不要修改数据库商品内容。
