import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import { createRenderer, defineComponent, h, nextTick, ref } from 'vue'
import { useI18n } from '../src/i18n.ts'
import { messages } from '../src/messages.ts'

// Compile the actual SFC and run it with Vue's renderer; no browser or extra DOM dependency.
const source = await readFile(new URL('../src/OrderPanel.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const script = compileScript(descriptor, { id: 'order-panel-test', inlineTemplate: true })
const compiled = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText.replace(/from ["']vue["']/g, `from '${import.meta.resolve('vue')}'`)
  .replace(/from ["']\.\/api["']/g, `from '${new URL('../src/api.ts', import.meta.url).href}'`)
  .replace(/from ["']\.\/i18n["']/g, `from '${new URL('../src/i18n.ts', import.meta.url).href}'`)
const Component = (await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)).default

const product = { id: 1, sku: 'JAVA-001', name: '数据库原文商品', description: '商品原文', price: '129.90', availableStock: 20 }
const user = { id: 1, username: 'reader' }
const session = { user, csrfToken: 'test-csrf' }
const order = { id: 7, productId: 1, productName: product.name, quantity: 1, unitPrice: '129.90', totalAmount: '129.90', currency: 'CNY', status: 'PENDING_PAYMENT', createdAt: '2026-10-18T10:00:00' }
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const flush = async () => { for (let i = 0; i < 5; i++) { await setImmediate(); await nextTick() } }

function node(tag, text = '') {
  return { tag, text, props: {}, children: [], parent: null, value: '',
    addEventListener() {}, removeEventListener() {}, getRootNode() { return {} } }
}
const renderer = createRenderer({
  createElement: tag => node(tag), createText: text => node('#text', text), createComment: text => node('#comment', text),
  setText: (el, text) => { el.text = text },
  setElementText: (el, text) => { el.text = text; el.children = [] },
  patchProp: (el, key, _old, value) => { el.props[key] = value; if (key === 'type') el.type = value },
  insert(el, parent, anchor = null) {
    if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1)
    const index = anchor ? parent.children.indexOf(anchor) : -1
    parent.children.splice(index < 0 ? parent.children.length : index, 0, el)
    el.parent = parent
  },
  remove(el) { if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1); el.parent = null },
  parentNode: el => el.parent,
  nextSibling: el => el.parent?.children[el.parent.children.indexOf(el) + 1] ?? null,
})
const all = root => [root, ...root.children.flatMap(all)]
const text = root => root.tag === '#comment' ? '' : root.text + root.children.map(text).join(' ')
const find = (root, predicate) => all(root).find(predicate)
const submit = async form => { await form.props.onSubmit({ preventDefault() {} }); await flush() }
const click = async button => { await button.props.onClick(); await flush() }

async function mount(t, fetcher, initialProduct = product) {
  t.mock.method(globalThis, 'fetch', fetcher)
  for (const name of ['Document', 'ShadowRoot']) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name)
    Object.defineProperty(globalThis, name, { configurable: true, value: class {} })
    t.after(() => original ? Object.defineProperty(globalThis, name, original) : delete globalThis[name])
  }
  useI18n().setLocale('zh-CN')
  const selected = ref(initialProduct)
  const created = []
  const root = node('root')
  const app = renderer.createApp(defineComponent(() => () => h(Component, { product: selected.value, onCreated: id => created.push(id) })))
  app.mount(root)
  t.after(() => { app.unmount(); useI18n().setLocale('zh-CN') })
  await flush()
  return { root, selected, created }
}

test('网络失败及同商品详情刷新保留requestKey，数量改变与成功后新单生成新key', async t => {
  const attempts = []
  let stored = []
  const { root, selected } = await mount(t, async (path, options) => {
    if (path === '/api/v1/auth/session') return json(session)
    if (path === '/api/v1/orders' && options.method === 'GET') return json(stored)
    const body = JSON.parse(options.body)
    attempts.push(body)
    if (attempts.length <= 2) throw new TypeError('connection lost')
    stored = [{ ...order, id: attempts.length, quantity: body.quantity }]
    return json(stored[0])
  })
  const form = () => find(root, el => el.props.class === 'create-order-form')
  await submit(form())
  selected.value = null
  await nextTick()
  selected.value = { ...product }
  await nextTick()
  await submit(form())
  assert.equal(attempts[0].requestKey, attempts[1].requestKey)
  const quantity = find(root, el => el.props.id === 'order-quantity')
  quantity.props['onUpdate:modelValue'](2)
  await nextTick()
  await submit(form())
  assert.notEqual(attempts[2].requestKey, attempts[1].requestKey)
  await submit(form())
  assert.notEqual(attempts[3].requestKey, attempts[2].requestKey)
  assert.match(text(root), /订单 #4 已创建/)
})

test('已有错误随三语立即重译，不重发请求；未知原型属性code使用通用提示', async t => {
  let requests = 0
  let apiCode = 'INSUFFICIENT_STOCK'
  const { root } = await mount(t, async (path, options) => {
    requests++
    if (path === '/api/v1/auth/session') return json(session)
    if (options.method === 'GET') return json([])
    return json({ code: apiCode, message: 'THIS SERVER MESSAGE MUST STAY HIDDEN' }, 409)
  })
  const form = () => find(root, el => el.props.class === 'create-order-form')
  await submit(form())
  const before = requests
  for (const locale of ['zh-CN', 'en', 'ja']) {
    useI18n().setLocale(locale)
    await nextTick()
    assert.ok(text(root).includes(messages[locale].errorInsufficientStock))
    assert.ok(text(root).includes(product.name))
    assert.ok(!text(root).includes('THIS SERVER MESSAGE'))
  }
  assert.equal(requests, before)
  for (const unknown of ['UNKNOWN_CODE', '__proto__', 'constructor', 'toString']) {
    apiCode = unknown
    await submit(form())
    assert.ok(text(root).includes(messages.ja.orderErrorHttp.replace('{status}', '409')))
  }
})

test('退出清空订单，迟到的旧用户列表不能写入新状态', async t => {
  let resolveOldList
  const oldList = new Promise(resolve => { resolveOldList = resolve })
  const { root } = await mount(t, async path => {
    if (path === '/api/v1/auth/session') return json(session)
    if (path === '/api/v1/auth/logout') return json({ user: null, csrfToken: 'next-csrf' })
    return oldList
  })
  const logoutButton = find(root, el => el.tag === 'button' && text(el) === messages['zh-CN'].signOut)
  await click(logoutButton)
  resolveOldList(json([order]))
  await flush()
  assert.ok(find(root, el => el.props.id === 'login-username'))
  assert.ok(!text(root).includes(order.productName))
  assert.ok(!find(root, el => el.props.class === 'order-list'))
})

test('会话过期清空本人订单，显示重新登录提示；密码提交后立即清空', async t => {
  let signedIn = true
  const { root } = await mount(t, async (path, options) => {
    if (path === '/api/v1/auth/session') return json({ user: signedIn ? user : null, csrfToken: 'test-csrf' })
    if (path === '/api/v1/auth/login') {
      assert.deepEqual(JSON.parse(options.body), { username: 'reader', password: 'example-only' })
      signedIn = true
      return json(session)
    }
    if (options.method === 'GET') return json([order])
    signedIn = false
    return json({ code: 'AUTH_REQUIRED', message: 'ignored' }, 401)
  })
  await submit(find(root, el => el.props.class === 'create-order-form'))
  assert.ok(text(root).includes(messages['zh-CN'].errorAuthRequired))
  assert.ok(!find(root, el => el.props.class === 'order-list'))
  find(root, el => el.props.id === 'login-username').props['onUpdate:modelValue']('reader')
  const password = find(root, el => el.props.id === 'login-password')
  password.props['onUpdate:modelValue']('example-only')
  await nextTick()
  await submit(find(root, el => el.props.class === 'login-form'))
  assert.ok(find(root, el => el.props.class === 'order-list'))
  assert.equal(password.value, '')
})
