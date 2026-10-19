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

export interface SessionUser {
  id: number
  username: string
}

export interface AuthSession {
  user: SessionUser | null
  csrfToken: string
}

export interface OrderView {
  id: number
  productId: number
  productName: string
  quantity: number
  unitPrice: string
  totalAmount: string
  currency: 'CNY'
  status: 'PENDING_PAYMENT' | 'PAID'
  createdAt: string
}

export interface CreateOrder {
  productId: number
  quantity: number
  requestKey: string
}

export type ApiErrorCode = 'TIMEOUT' | 'NETWORK' | 'INVALID_JSON' | 'INVALID_DATA' | 'HTTP'

// Keep diagnostic messages separate from the stable codes used by the translated UI.
export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status?: number
  readonly apiCode?: string

  constructor(code: ApiErrorCode, message: string,
    details: { cause?: unknown; status?: number; apiCode?: string } = {}) {
    super(message, { cause: details.cause })
    this.name = 'ApiError'
    this.code = code
    this.status = details.status
    this.apiCode = details.apiCode
  }
}

async function getJson<T>(
  path: string,
  signal: AbortSignal,
  validate: (value: unknown) => value is T,
  post?: { body: unknown; csrfToken: string },
): Promise<T> {
  const timeoutSignal = AbortSignal.timeout(10_000)
  const requestSignal = AbortSignal.any([signal, timeoutSignal])
  let response: Response
  let text: string
  try {
    response = await fetch(path, {
      signal: requestSignal,
      method: post ? 'POST' : 'GET',
      headers: {
        Accept: 'application/json',
        ...(post ? { 'Content-Type': 'application/json', 'X-CSRF-Token': post.csrfToken } : {}),
      },
      body: post ? JSON.stringify(post.body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
    })
    // Receiving headers does not finish the request: reading the body can fail too.
    text = await response.text()
  } catch (error) {
    if (signal.aborted) throw error
    if (timeoutSignal.aborted) {
      throw new ApiError('TIMEOUT', '商品服务响应超时，请稍后重试。', { cause: error })
    }
    throw new ApiError('NETWORK', '暂时无法连接或读取商品服务，请稍后重试。', { cause: error })
  }

  const httpMessage = `商品服务请求失败（${response.status}），请重试。`
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch (error) {
    // An HTML error page must not hide the HTTP status behind a JSON error.
    throw new ApiError(response.ok ? 'INVALID_JSON' : 'HTTP',
      response.ok ? '商品服务返回了无法解析的 JSON，请刷新重试。' : httpMessage,
      { cause: error, status: response.status })
  }
  if (!response.ok) {
    const message = isObject(body) ? body.message : undefined
    const apiCode = isObject(body) && typeof body.code === 'string' ? body.code : undefined
    throw new ApiError('HTTP', typeof message === 'string' && message.trim() ? message : httpMessage,
      { status: response.status, apiCode })
  }
  if (!validate(body)) {
    throw new ApiError('INVALID_DATA', '商品服务返回的数据格式不符合约定，请刷新重试。')
  }
  return body
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIntegerAtLeast(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
}

function isProduct(value: unknown): value is Product {
  return isObject(value)
    && isIntegerAtLeast(value.id, 1)
    && typeof value.sku === 'string'
    && typeof value.name === 'string'
    && typeof value.description === 'string'
    && typeof value.price === 'string'
    && /^[0-9]+(?:\.[0-9]+)?$/.test(value.price)
    && isIntegerAtLeast(value.availableStock, 0)
}

function isProductPage(value: unknown): value is ProductPage {
  return isObject(value)
    && Array.isArray(value.items)
    && value.items.every(isProduct)
    && isIntegerAtLeast(value.page, 1)
    && isIntegerAtLeast(value.size, 1)
    && isIntegerAtLeast(value.total, 0)
    && value.items.length <= value.size
    && value.items.length <= value.total
}

export function fetchProducts(page: number, size: number, signal: AbortSignal) {
  return getJson(`/api/v1/products?page=${page}&size=${size}`, signal, isProductPage)
}

export function fetchProduct(id: number, signal: AbortSignal) {
  return getJson(`/api/v1/products/${id}`, signal, isProduct)
}

function isSession(value: unknown): value is AuthSession {
  return isObject(value)
    && typeof value.csrfToken === 'string' && value.csrfToken.length > 0
    && (value.user === null || (isObject(value.user)
      && isIntegerAtLeast(value.user.id, 1)
      && typeof value.user.username === 'string' && value.user.username.length > 0))
}

function isOrder(value: unknown): value is OrderView {
  return isObject(value)
    && isIntegerAtLeast(value.id, 1) && isIntegerAtLeast(value.productId, 1)
    && typeof value.productName === 'string'
    && isIntegerAtLeast(value.quantity, 1) && value.quantity <= 100
    && typeof value.unitPrice === 'string' && /^[0-9]+(?:\.[0-9]+)?$/.test(value.unitPrice)
    && typeof value.totalAmount === 'string' && /^[0-9]+(?:\.[0-9]+)?$/.test(value.totalAmount)
    && value.currency === 'CNY'
    && (value.status === 'PENDING_PAYMENT' || value.status === 'PAID')
    && typeof value.createdAt === 'string' && value.createdAt.length > 0
}

function isOrders(value: unknown): value is OrderView[] {
  return Array.isArray(value) && value.length <= 100 && value.every(isOrder)
}

export function fetchSession(signal: AbortSignal) {
  return getJson('/api/v1/auth/session', signal, isSession)
}

export function login(username: string, password: string, csrfToken: string, signal: AbortSignal) {
  return getJson('/api/v1/auth/login', signal, isSession, { body: { username, password }, csrfToken })
}

export function logout(csrfToken: string, signal: AbortSignal) {
  return getJson('/api/v1/auth/logout', signal, isSession, { body: {}, csrfToken })
}

export function fetchOrders(signal: AbortSignal) {
  return getJson('/api/v1/orders', signal, isOrders)
}

export function fetchOrder(id: number, signal: AbortSignal) {
  return getJson(`/api/v1/orders/${id}`, signal, isOrder)
}

export function createOrder(order: CreateOrder, csrfToken: string, signal: AbortSignal) {
  return getJson('/api/v1/orders', signal, isOrder, { body: order, csrfToken })
}

export function payOrder(id: number, csrfToken: string, signal: AbortSignal) {
  return getJson(`/api/v1/orders/${id}/pay`, signal, isOrder, { body: {}, csrfToken })
}

// 金额来自后端十进制字符串；展示时不经过 Number 浮点转换。
export function formatPrice(value: string): string {
  const [whole = '0', fraction = ''] = value.split('.')
  return `¥${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction.padEnd(2, '0')}`
}
