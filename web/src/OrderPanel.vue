<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ApiError, createOrder, fetchOrders, fetchSession, formatPrice, login, logout, payOrder } from './api'
import type { AuthSession, OrderView, Product } from './api'
import { useI18n } from './i18n'
import type { MessageKey } from './messages'

const props = defineProps<{ product: Product | null }>()
const emit = defineEmits<{ created: [productId: number] }>()
const { t } = useI18n()
const session = ref<AuthSession>({ user: null, csrfToken: '' })
const sessionReady = ref(false)
const authBusy = ref(false)
const username = ref('')
const password = ref('')
const quantity = ref<number | string>(1)
const orders = ref<OrderView[]>([])
const listLoading = ref(false)
const listError = ref<unknown>(null)
const actionError = ref<unknown>(null)
const mutation = ref<'create' | number | null>(null)
const notice = ref<{ key: 'orderCreated' | 'orderPaid'; id: number } | null>(null)
let requestKey: string | null = null
let intentProductId = props.product?.id
let identityVersion = 0
let authRequest = 0
let listRequest = 0
let mutationRequest = 0
let authController: AbortController | null = null
let listController: AbortController | null = null
let mutationController: AbortController | null = null

const quantityValid = computed(() => typeof quantity.value === 'number'
  && Number.isSafeInteger(quantity.value) && quantity.value >= 1 && quantity.value <= 100)
const canCreate = computed(() => session.value.user && props.product
  && props.product.availableStock > 0 && quantityValid.value && !authBusy.value && mutation.value === null)

function errorText(error: unknown): string {
  if (!(error instanceof ApiError)) return t('orderErrorFallback')
  const localKeys = {
    TIMEOUT: 'orderErrorTimeout', NETWORK: 'orderErrorNetwork',
    INVALID_JSON: 'orderErrorInvalidJson', INVALID_DATA: 'orderErrorInvalidData',
  } as const
  if (error.code !== 'HTTP') return t(localKeys[error.code])
  const apiKeys: Record<string, MessageKey> = {
    AUTH_REQUIRED: 'errorAuthRequired', INVALID_CREDENTIALS: 'errorInvalidCredentials',
    CSRF_INVALID: 'errorCsrfInvalid', ORDER_FORBIDDEN: 'errorOrderForbidden',
    ORDER_NOT_FOUND: 'errorOrderNotFound', INSUFFICIENT_STOCK: 'errorInsufficientStock',
    IDEMPOTENCY_CONFLICT: 'errorIdempotencyConflict', PRODUCT_NOT_FOUND: 'errorNotFound',
    INVALID_ARGUMENT: 'orderErrorInvalidArgument', DATABASE_UNAVAILABLE: 'errorDatabaseUnavailable',
    INTERNAL_ERROR: 'errorInternal',
  }
  const key = error.apiCode && Object.hasOwn(apiKeys, error.apiCode) ? apiKeys[error.apiCode] : undefined
  return key ? t(key) : t('orderErrorHttp', { status: error.status ?? '?' })
}
const actionErrorMessage = computed(() => errorText(actionError.value))
const listErrorMessage = computed(() => errorText(listError.value))

// Loading the same detail briefly passes null; it must not discard a retry key.
watch(() => props.product?.id, id => {
  if (id === undefined || id === intentProductId) return
  intentProductId = id
  requestKey = null
  actionError.value = null
})
watch(quantity, () => {
  requestKey = null
  actionError.value = null
})

function clearIdentityData() {
  identityVersion++
  listController?.abort()
  mutationController?.abort()
  listRequest++
  mutationRequest++
  orders.value = []
  listError.value = null
  listLoading.value = false
  mutation.value = null
  requestKey = null
  notice.value = null
}

function handleFailure(error: unknown, target: 'action' | 'list') {
  if (error instanceof ApiError && error.apiCode === 'AUTH_REQUIRED') {
    clearIdentityData()
    session.value = { user: null, csrfToken: '' }
    actionError.value = error
  }
  if (target === 'action') actionError.value = error
  else listError.value = error
}

async function authenticate(mode: 'session' | 'login' | 'logout') {
  if (authBusy.value || mutation.value !== null) return
  authController?.abort()
  const controller = new AbortController()
  authController = controller
  const request = ++authRequest
  authBusy.value = true
  actionError.value = null
  notice.value = null
  const credentials = { username: username.value.trim(), password: password.value }
  if (mode === 'login') password.value = ''
  try {
    let result: AuthSession
    if (mode === 'login') {
      // Refresh CSRF before login, including after a session has expired.
      const current = await fetchSession(controller.signal)
      result = await login(credentials.username, credentials.password, current.csrfToken, controller.signal)
    } else if (mode === 'logout') {
      result = await logout(session.value.csrfToken, controller.signal)
    } else {
      result = await fetchSession(controller.signal)
    }
    if (request !== authRequest || controller.signal.aborted) return
    clearIdentityData()
    session.value = result
    sessionReady.value = true
    if (result.user) void loadOrders()
  } catch (error) {
    if (request !== authRequest || controller.signal.aborted) return
    handleFailure(error, 'action')
  } finally {
    if (request === authRequest) authBusy.value = false
  }
}

async function loadOrders() {
  if (!session.value.user) return
  listController?.abort()
  const controller = new AbortController()
  listController = controller
  const request = ++listRequest
  const identity = identityVersion
  listLoading.value = true
  listError.value = null
  try {
    const result = await fetchOrders(controller.signal)
    if (request !== listRequest || identity !== identityVersion || controller.signal.aborted) return
    orders.value = result
  } catch (error) {
    if (request !== listRequest || identity !== identityVersion || controller.signal.aborted) return
    handleFailure(error, 'list')
  } finally {
    if (request === listRequest) listLoading.value = false
  }
}

async function submitOrder() {
  if (!canCreate.value || !props.product || typeof quantity.value !== 'number') return
  requestKey ??= crypto.randomUUID()
  const intent = { productId: props.product.id, quantity: quantity.value, requestKey }
  await mutate('create', signal => createOrder(intent, session.value.csrfToken, signal), result => {
    if (props.product?.id === intent.productId && quantity.value === intent.quantity) requestKey = null
    notice.value = { key: 'orderCreated', id: result.id }
    emit('created', intent.productId)
  })
}

async function pay(order: OrderView) {
  if (order.status !== 'PENDING_PAYMENT') return
  await mutate(order.id, signal => payOrder(order.id, session.value.csrfToken, signal), result => {
    notice.value = { key: 'orderPaid', id: result.id }
  })
}

async function mutate(kind: 'create' | number, execute: (signal: AbortSignal) => Promise<OrderView>,
  success: (order: OrderView) => void) {
  if (!session.value.user || authBusy.value || mutation.value !== null) return
  const controller = new AbortController()
  mutationController = controller
  const request = ++mutationRequest
  const identity = identityVersion
  // An older list must not replace the just-created or paid order.
  listController?.abort()
  listRequest++
  listLoading.value = false
  mutation.value = kind
  actionError.value = null
  notice.value = null
  try {
    const result = await execute(controller.signal)
    if (request !== mutationRequest || identity !== identityVersion || controller.signal.aborted) return
    orders.value = [result, ...orders.value.filter(order => order.id !== result.id)].slice(0, 100)
    listError.value = null
    success(result)
    void loadOrders()
  } catch (error) {
    if (request !== mutationRequest || identity !== identityVersion || controller.signal.aborted) return
    handleFailure(error, 'action')
  } finally {
    if (request === mutationRequest) mutation.value = null
  }
}

onMounted(() => authenticate('session'))
onBeforeUnmount(() => {
  authRequest++
  clearIdentityData()
  authController?.abort()
})
</script>

<template>
  <section class="orders-panel" aria-labelledby="orders-title">
    <div class="orders-heading">
      <div><h2 id="orders-title">{{ t('ordersTitle') }}</h2><p>{{ t('ordersSubtitle') }}</p></div>
      <div v-if="session.user" class="session-actions">
        <span>{{ t('signedInAs', { username: session.user.username }) }}</span>
        <button class="button secondary" :disabled="authBusy || mutation !== null" @click="authenticate('logout')">{{ t(authBusy ? 'signingOut' : 'signOut') }}</button>
      </div>
    </div>

    <p v-if="actionError" class="order-error" role="alert">{{ actionErrorMessage }}</p>
    <p v-if="notice" class="order-notice" role="status">{{ t(notice.key, { id: notice.id }) }}</p>
    <div v-if="!sessionReady" class="session-status" :aria-busy="authBusy">
      <p v-if="authBusy" role="status">{{ t('checkingSession') }}</p>
      <button v-else class="button secondary" @click="authenticate('session')">{{ t('retrySession') }}</button>
    </div>
    <form v-else-if="!session.user" class="login-form" :aria-busy="authBusy" @submit.prevent="authenticate('login')">
      <p class="login-description">{{ t('signInDescription') }}</p>
      <div class="order-field"><label for="login-username">{{ t('usernameLabel') }}</label><input id="login-username" v-model="username" autocomplete="username" required maxlength="64" :disabled="authBusy" /></div>
      <div class="order-field"><label for="login-password">{{ t('passwordLabel') }}</label><input id="login-password" v-model="password" type="password" autocomplete="current-password" required maxlength="128" :disabled="authBusy" /></div>
      <button class="button primary" type="submit" :disabled="authBusy || !username.trim() || !password">{{ t(authBusy ? 'signingIn' : 'signIn') }}</button>
    </form>
    <template v-else>
      <form class="create-order-form" :aria-busy="mutation === 'create'" @submit.prevent="submitOrder">
        <div class="order-selection"><h3>{{ t('createOrderTitle') }}</h3><p>{{ product ? product.name : t('chooseOrderProduct') }}</p></div>
        <div class="order-field quantity-field"><label for="order-quantity">{{ t('quantityLabel') }}</label><input id="order-quantity" v-model.number="quantity" type="number" inputmode="numeric" min="1" max="100" step="1" required aria-describedby="quantity-help" :disabled="!product || authBusy || mutation !== null" /><span id="quantity-help">{{ t('quantityHelp') }}</span></div>
        <div v-if="product" class="order-unit-price"><span>{{ t('productPrice') }}</span><strong>{{ formatPrice(product.price) }}</strong></div>
        <button class="button primary" type="submit" :disabled="!canCreate">{{ t(mutation === 'create' ? 'creatingOrder' : product?.availableStock === 0 ? 'outOfStock' : 'createOrder') }}</button>
      </form>
      <div class="my-orders-heading"><div><h3>{{ t('myOrders') }}</h3><p>{{ t('recentOrdersNote') }}</p></div><button class="button secondary" :disabled="listLoading || authBusy || mutation !== null" @click="loadOrders">{{ t(listLoading ? 'loading' : 'refreshOrders') }}</button></div>
      <p v-if="listLoading" class="order-list-state" role="status">{{ t('ordersLoading') }}</p>
      <div v-else-if="listError" class="order-list-state"><p class="order-error" role="alert">{{ listErrorMessage }}</p><button class="button secondary" @click="loadOrders">{{ t('retryOrders') }}</button></div>
      <p v-else-if="orders.length === 0" class="order-list-state" role="status">{{ t('noOrders') }}</p>
      <ul v-else class="order-list" :aria-label="t('myOrders')">
        <li v-for="order in orders" :key="order.id" class="order-row">
          <div class="order-product"><strong>{{ order.productName }}</strong><span>{{ t('orderNumber', { id: order.id }) }} · {{ order.createdAt }}</span></div>
          <div class="order-amount"><strong>{{ formatPrice(order.totalAmount) }}</strong><span>{{ t('orderQuantity', { quantity: order.quantity }) }} · {{ formatPrice(order.unitPrice) }}</span></div>
          <span :class="['order-status', { 'order-status-paid': order.status === 'PAID' }]">{{ t(order.status === 'PAID' ? 'statusPaid' : 'statusPending') }}</span>
          <button v-if="order.status === 'PENDING_PAYMENT'" class="button secondary" :disabled="authBusy || mutation !== null" :aria-label="t('payOrderLabel', { id: order.id })" @click="pay(order)">{{ t(mutation === order.id ? 'payingOrder' : 'payOrder') }}</button>
        </li>
      </ul>
    </template>
  </section>
</template>
