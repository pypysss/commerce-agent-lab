import assert from 'node:assert/strict'
import test from 'node:test'
import { createOrder, fetchOrder, fetchOrders, fetchSession, login, logout, payOrder } from '../src/api.ts'

const signal = () => new AbortController().signal
const session = { user: { id: 1, username: 'reader' }, csrfToken: 'test-csrf' }
const order = {
  id: 7, productId: 1, productName: 'Java 并发学习手册', quantity: 2,
  unitPrice: '129.90', totalAmount: '259.80', currency: 'CNY',
  status: 'PENDING_PAYMENT', createdAt: '2026-10-18T10:00:00',
}

function respond(t, body, status = 200, inspect = () => {}) {
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    inspect(path, options)
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  })
}

test('会话GET及订单读取校验完整结构；金额保持精确字符串', async t => {
  respond(t, session, 200, (path, options) => {
    assert.equal(path, '/api/v1/auth/session')
    assert.equal(options.method, 'GET')
    assert.equal(options.credentials, 'same-origin')
    assert.equal(options.headers['Accept-Language'], undefined)
    assert.equal(options.headers['X-CSRF-Token'], undefined)
  })
  assert.deepEqual(await fetchSession(signal()), session)
  t.mock.restoreAll()
  respond(t, [order])
  assert.deepEqual(await fetchOrders(signal()), [order])
  t.mock.restoreAll()
  respond(t, order)
  assert.equal((await fetchOrder(7, signal())).totalAmount, '259.80')
})

for (const invalid of [
  { csrfToken: '', user: null }, { csrfToken: 'ok' },
  { csrfToken: 'ok', user: { id: 0, username: 'x' } },
  { csrfToken: 'ok', user: { id: 1, username: '' } },
]) {
  test(`拒绝坏会话结构 ${JSON.stringify(invalid)}`, async t => {
    respond(t, invalid)
    await assert.rejects(fetchSession(signal()), { code: 'INVALID_DATA' })
  })
}

for (const invalid of [
  { ...order, totalAmount: 259.8 }, { ...order, unitPrice: '-1' },
  { ...order, quantity: 0 }, { ...order, quantity: 101 }, { ...order, quantity: 1.1 },
  { ...order, currency: 'USD' }, { ...order, status: 'CANCELLED' },
  { ...order, id: Number.MAX_SAFE_INTEGER + 1 }, { ...order, createdAt: '' },
]) {
  test(`拒绝坏订单结构 ${Object.keys(invalid).filter(key => invalid[key] !== order[key]).join()}`, async t => {
    respond(t, invalid)
    await assert.rejects(fetchOrder(7, signal()), { code: 'INVALID_DATA' })
  })
}

test('订单列表不接受包装对象或超过100条', async t => {
  respond(t, { items: [order] })
  await assert.rejects(fetchOrders(signal()), { code: 'INVALID_DATA' })
  t.mock.restoreAll()
  respond(t, Array.from({ length: 101 }, () => order))
  await assert.rejects(fetchOrders(signal()), { code: 'INVALID_DATA' })
})

for (const [name, path, invoke, expectedBody, response] of [
  ['login', '/api/v1/auth/login', s => login('reader', 'example-only', 'test-csrf', s), { username: 'reader', password: 'example-only' }, session],
  ['logout', '/api/v1/auth/logout', s => logout('test-csrf', s), {}, { user: null, csrfToken: 'next-csrf' }],
  ['create', '/api/v1/orders', s => createOrder({ productId: 1, quantity: 2, requestKey: 'same-intent-key' }, 'test-csrf', s), { productId: 1, quantity: 2, requestKey: 'same-intent-key' }, order],
  ['pay', '/api/v1/orders/7/pay', s => payOrder(7, 'test-csrf', s), {}, { ...order, status: 'PAID' }],
]) {
  test(`${name} 使用POST/JSON/同源Cookie/显式CSRF；不设置界面语言头`, async t => {
    respond(t, response, 200, (actualPath, options) => {
      assert.equal(actualPath, path)
      assert.equal(options.method, 'POST')
      assert.equal(options.credentials, 'same-origin')
      assert.equal(options.headers['Content-Type'], 'application/json')
      assert.equal(options.headers['X-CSRF-Token'], 'test-csrf')
      assert.equal(options.headers['Accept-Language'], undefined)
      assert.deepEqual(JSON.parse(options.body), expectedBody)
    })
    assert.deepEqual(await invoke(signal()), response)
  })
}

test('写请求保留后端稳定HTTP/code，供界面三语翻译', async t => {
  respond(t, { code: 'INSUFFICIENT_STOCK', message: '安全兜底' }, 409)
  await assert.rejects(createOrder({ productId: 1, quantity: 2, requestKey: 'key' }, 'test-csrf', signal()),
    { code: 'HTTP', status: 409, apiCode: 'INSUFFICIENT_STOCK' })
})
