import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { ApiError, fetchProduct, fetchProducts } from '../src/api.ts'

const TIMEOUT = '商品服务响应超时，请稍后重试。'
const NETWORK = '暂时无法连接或读取商品服务，请稍后重试。'
const INVALID_JSON = '商品服务返回了无法解析的 JSON，请刷新重试。'
const INVALID_DATA = '商品服务返回的数据格式不符合约定，请刷新重试。'
const signal = () => new AbortController().signal
const product = {
  id: 1, sku: 'COURSE-001', name: 'Java 并发学习手册', description: '学习并发',
  price: '129.90', availableStock: 10,
}
const page = { items: [product], page: 1, size: 20, total: 1 }
const fallback = status => `商品服务请求失败（${status}），请重试。`
const nativeFetch = globalThis.fetch
const nativeTimeout = AbortSignal.timeout.bind(AbortSignal)

function respond(t, body, status = 200) {
  t.mock.method(globalThis, 'fetch', async () => new Response(body, {
    status, headers: { 'Content-Type': 'application/json' },
  }))
}

function json(t, value, status = 200) {
  respond(t, JSON.stringify(value), status)
}

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

// Public APIs use browser-relative paths. Only the origin is supplied here;
// native fetch and native response-body reading still run against a real server.
async function localServer(t, { sendHeaders }) {
  const requested = deferred()
  const receivedHeaders = deferred()
  const server = createServer((_request, response) => {
    requested.resolve()
    if (sendHeaders) {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.flushHeaders()
      response.write('{"id":') // Deliberately keep the body incomplete.
    }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  })
  const origin = `http://127.0.0.1:${server.address().port}`
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    const response = await nativeFetch(new URL(path, origin), options)
    receivedHeaders.resolve()
    return response
  })
  return { requested: requested.promise, receivedHeaders: receivedHeaders.promise }
}

test('商品列表：保持金额字符串、中文与分页数据，发送正确的请求配置', async t => {
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    assert.equal(path, '/api/v1/products?page=2&size=20')
    assert.deepEqual(options.headers, { Accept: 'application/json' })
    assert.equal(options.cache, 'no-store')
    assert.ok(options.signal instanceof AbortSignal)
    return Response.json({ ...page, page: 2 })
  })
  const result = await fetchProducts(2, 20, signal())
  assert.deepEqual(result, { ...page, page: 2 })
  assert.equal(result.items[0].price, '129.90')
})

test('HTTP 错误保留稳定业务码、状态和安全诊断 message，供 UI 独立翻译', async t => {
  const body = { code: 'PRODUCT_NOT_FOUND', message: '商品不存在或未上架' }
  json(t, body, 404)
  await assert.rejects(fetchProduct(999999999, signal()), error => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.code, 'HTTP')
    assert.equal(error.status, 404)
    assert.equal(error.apiCode, body.code)
    assert.equal(error.message, body.message)
    return true
  })
})

test('未知业务错误码保持原样，非字符串 message 回退但不丢失状态与 code', async t => {
  json(t, { code: 'FUTURE_ERROR', message: { internal: 'do not display' } }, 409)
  await assert.rejects(fetchProduct(1, signal()), error => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.code, 'HTTP')
    assert.equal(error.status, 409)
    assert.equal(error.apiCode, 'FUTURE_ERROR')
    assert.equal(error.message, fallback(409))
    return true
  })
})

test('商品详情：请求详情地址并允许库存为零', async t => {
  const expected = { ...product, availableStock: 0 }
  t.mock.method(globalThis, 'fetch', async path => {
    assert.equal(path, '/api/v1/products/1')
    return Response.json(expected)
  })
  assert.deepEqual(await fetchProduct(1, signal()), expected)
})

test('空页：空商品数组和 total=0 合法', async t => {
  const empty = { items: [], page: 1, size: 20, total: 0 }
  json(t, empty)
  assert.deepEqual(await fetchProducts(1, 20, signal()), empty)
})

test('HTTP 503：保留服务端字符串 message 作为诊断信息', async t => {
  json(t, { code: 'DATABASE_UNAVAILABLE', message: '数据服务暂不可用' }, 503)
  await assert.rejects(fetchProducts(1, 20, signal()), { message: '数据服务暂不可用' })
})

test('HTTP 503 返回 HTML：保留 HTTP 状态错误而不是误报 JSON 错误', async t => {
  respond(t, '<html>upstream unavailable</html>', 503)
  await assert.rejects(fetchProduct(1, signal()), { message: fallback(503) })
})

test('HTTP 404 返回非字符串 message：使用状态码提示', async t => {
  json(t, { message: { internal: 'detail' } }, 404)
  await assert.rejects(fetchProduct(1, signal()), { message: fallback(404) })
})

test('HTTP 503 返回空白 message：使用状态码提示', async t => {
  json(t, { message: '   ' }, 503)
  await assert.rejects(fetchProduct(1, signal()), { message: fallback(503) })
})

test('HTTP 200 但 JSON 语法损坏：明确提示无法解析', async t => {
  respond(t, '{"items":')
  await assert.rejects(fetchProducts(1, 20, signal()), { message: INVALID_JSON })
})

const invalidProducts = [
  ['合法 JSON null', null],
  ['缺少字段的对象', {}],
  ['id 为零', { ...product, id: 0 }],
  ['id 超出安全整数', { ...product, id: Number.MAX_SAFE_INTEGER + 1 }],
  ['金额是数字', { ...product, price: 129.9 }],
  ['金额为负数字符串', { ...product, price: '-1.00' }],
  ['金额包含非十进制字符', { ...product, price: '129.90元' }],
  ['库存为负数', { ...product, availableStock: -1 }],
  ['库存为小数', { ...product, availableStock: 1.5 }],
  ['商品名称不是字符串', { ...product, name: null }],
]
for (const [name, value] of invalidProducts) {
  test(`商品契约不合法：${name}`, async t => {
    json(t, value)
    await assert.rejects(fetchProduct(1, signal()), { message: INVALID_DATA })
  })
}

const invalidPages = [
  ['items 不是数组', { ...page, items: {} }],
  ['数组包含错误商品', { ...page, items: [{ ...product, price: false }] }],
  ['页码为零', { ...page, page: 0 }],
  ['页容量超出安全整数', { ...page, size: Number.MAX_SAFE_INTEGER + 1 }],
  ['总数为负数', { ...page, total: -1 }],
  ['数组数量超过页容量', { ...page, items: [product, product], size: 1, total: 2 }],
  ['总数小于数组数量', { ...page, total: 0 }],
]
for (const [name, value] of invalidPages) {
  test(`分页契约不合法：${name}`, async t => {
    json(t, value)
    await assert.rejects(fetchProducts(1, 20, signal()), { message: INVALID_DATA })
  })
}

test('网络连接失败：转换为连接或读取失败提示', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('fetch failed') })
  await assert.rejects(fetchProduct(1, signal()), { message: NETWORK })
})

test('收到响应头后，读取响应体失败：保留网络错误分类', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true, status: 200,
    text: async () => { throw new TypeError('terminated') },
  }))
  await assert.rejects(fetchProduct(1, signal()), { message: NETWORK })
})

test('请求前已主动取消：原样传播取消原因', async t => {
  await localServer(t, { sendHeaders: false })
  const controller = new AbortController()
  const reason = new DOMException('用户主动取消', 'AbortError')
  controller.abort(reason)
  await assert.rejects(fetchProduct(1, controller.signal), error => error === reason)
})

for (const sendHeaders of [false, true]) {
  test(`主动取消${sendHeaders ? '发生在响应体读取中' : '发生在收到响应头前'}：保持 AbortError`, async t => {
    const server = await localServer(t, { sendHeaders })
    const controller = new AbortController()
    const pending = fetchProduct(1, controller.signal)
    await (sendHeaders ? server.receivedHeaders : server.requested)
    controller.abort()
    await assert.rejects(pending, error => error.name === 'AbortError')
  })

  test(`10 秒超时${sendHeaders ? '发生在响应体读取中' : '发生在收到响应头前'}：统一超时提示`, async t => {
    const server = await localServer(t, { sendHeaders })
    let timeoutCalls = 0
    t.mock.method(AbortSignal, 'timeout', milliseconds => {
      assert.equal(milliseconds, 10_000)
      timeoutCalls++
      return nativeTimeout(150) // Exercise real cancellation without a 10-second wait.
    })
    const pending = fetchProduct(1, signal())
    await (sendHeaders ? server.receivedHeaders : server.requested)
    await assert.rejects(pending, { message: TIMEOUT })
    assert.equal(timeoutCalls, 1)
  })
}
