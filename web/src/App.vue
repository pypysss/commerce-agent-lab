<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ApiError, fetchProduct, fetchProducts, formatPrice } from './api'
import type { Product, ProductPage } from './api'
import { useI18n } from './i18n'
import type { MessageKey } from './messages'
import OrderPanel from './OrderPanel.vue'

const { locale, setLocale, t, languageOptions } = useI18n()

type LoadState = 'loading' | 'success' | 'error'
const pageSize = 20
const page = ref<ProductPage>({ items: [], page: 1, size: pageSize, total: 0 })
const listState = ref<LoadState>('loading')
const listError = ref<unknown>(null)
const keyword = ref('')
const selectedId = ref<number | null>(null)
const detail = ref<Product | null>(null)
const detailState = ref<LoadState>('loading')
const detailError = ref<unknown>(null)
let listController: AbortController | null = null
let detailController: AbortController | null = null
let listRequest = 0
let detailRequest = 0

function changeLanguage(event: Event) {
  if (event.target instanceof HTMLSelectElement) setLocale(event.target.value)
}

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

// Store errors as data, then translate while rendering so a language change is immediate.
const listErrorMessage = computed(() => errorText(listError.value, 'errorListFallback'))
const detailErrorMessage = computed(() => errorText(detailError.value, 'errorDetailFallback'))

const products = computed(() => {
  const query = keyword.value.trim().toLocaleLowerCase('zh-CN')
  return page.value.items.filter(product =>
    `${product.name} ${product.sku}`.toLocaleLowerCase('zh-CN').includes(query),
  )
})
const pageCount = computed(() => Math.max(1, Math.ceil(page.value.total / pageSize)))

function clearDetail() {
  detailController?.abort()
  detailRequest++
  selectedId.value = null
  detail.value = null
}

async function loadPage(number = page.value.page, preserveDetail = false) {
  listController?.abort()
  const controller = new AbortController()
  listController = controller
  const request = ++listRequest
  listState.value = 'loading'
  listError.value = null
  if (!preserveDetail) clearDetail()
  try {
    const result = await fetchProducts(number, pageSize, controller.signal)
    if (request !== listRequest || controller.signal.aborted) return
    page.value = result
    listState.value = 'success'
  } catch (error) {
    if (request !== listRequest || controller.signal.aborted) return
    listError.value = error
    listState.value = 'error'
  }
}

function refreshAfterOrder(productId: number) {
  void loadPage(page.value.page, true)
  if (selectedId.value === productId) void loadDetail(productId)
}

async function loadDetail(id: number) {
  detailController?.abort()
  const controller = new AbortController()
  detailController = controller
  const request = ++detailRequest
  selectedId.value = id
  detail.value = null
  detailState.value = 'loading'
  detailError.value = null
  try {
    const product = await fetchProduct(id, controller.signal)
    if (request !== detailRequest || controller.signal.aborted) return
    detail.value = product
    detailState.value = 'success'
  } catch (error) {
    if (request !== detailRequest || controller.signal.aborted) return
    detailError.value = error
    detailState.value = 'error'
  }
}

onMounted(() => loadPage(1))
onBeforeUnmount(() => {
  listController?.abort()
  detailController?.abort()
})
</script>

<template>
  <a class="skip-link" href="#main">{{ t('skipToList') }}</a>
  <header class="app-header">
    <a class="brand" href="/" :aria-label="t('homeLabel')">
      <svg viewBox="0 0 28 28" aria-hidden="true"><path d="M6 9h16v14H6zM10 9V6a4 4 0 0 1 8 0v3" /></svg>
      <span>Commerce Lab</span>
    </a>
    <div class="header-actions">
      <span class="header-caption">{{ t('headerCaption') }}</span>
      <div class="language-switcher">
        <label class="sr-only" for="language-select">{{ t('languageLabel') }}</label>
        <select id="language-select" :value="locale" @change="changeLanguage">
          <option v-for="language in languageOptions" :key="language.value" :value="language.value" :lang="language.value">{{ language.label }}</option>
        </select>
      </div>
    </div>
  </header>

  <main id="main" tabindex="-1">
    <div class="page-heading">
      <div><h1>{{ t('pageTitle') }}</h1><p>{{ t('pageSubtitle') }}</p></div>
      <button class="button secondary" :disabled="listState === 'loading'" @click="loadPage()">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16 7a6.5 6.5 0 1 0 .3 5M16 3v4h-4" /></svg>
        {{ t(listState === 'loading' ? 'loading' : 'refresh') }}
      </button>
    </div>

    <div class="workspace">
      <section class="catalog" aria-labelledby="catalog-title" :aria-busy="listState === 'loading'">
        <div class="catalog-toolbar">
          <div><h2 id="catalog-title">{{ t('listTitle') }}</h2><p class="count" aria-live="polite">{{ listState === 'success' ? t('totalCount', { count: page.total }) : t('readingProducts') }}</p></div>
          <div class="search-field">
            <label for="product-search">{{ t('filterLabel') }}</label>
            <div class="search-input">
              <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg>
              <input id="product-search" v-model="keyword" type="search" :placeholder="t('searchPlaceholder')" :disabled="listState !== 'success'" />
            </div>
          </div>
        </div>

        <div v-if="listState === 'loading'" class="loading-list" role="status">
          <span class="sr-only">{{ t('listLoading') }}</span>
          <div v-for="row in 5" :key="row" class="skeleton-row" aria-hidden="true"><i /><i /><i /></div>
        </div>
        <div v-else-if="listState === 'error'" class="state-panel error-panel" role="alert">
          <h3>{{ t('listFailed') }}</h3><p>{{ listErrorMessage }}</p>
          <button class="button primary" @click="loadPage()">{{ t('retryList') }}</button>
        </div>
        <div v-else-if="products.length === 0" class="state-panel" role="status">
          <h3>{{ t(keyword.trim() ? 'noMatchesTitle' : 'noProductsTitle') }}</h3>
          <p>{{ t(keyword.trim() ? 'noMatchesDescription' : 'noProductsDescription') }}</p>
          <button v-if="keyword.trim()" class="button secondary" @click="keyword = ''">{{ t('clearFilter') }}</button>
          <button v-else class="button secondary" @click="loadPage()">{{ t('refresh') }}</button>
        </div>
        <div v-else class="table-scroll">
          <table>
            <caption class="sr-only">{{ t('tableCaption') }}</caption>
            <thead><tr><th scope="col">{{ t('productColumn') }}</th><th scope="col" class="numeric">{{ t('priceColumn') }}</th><th scope="col" class="numeric">{{ t('stockColumn') }}</th><th scope="col"><span class="sr-only">{{ t('actionsColumn') }}</span></th></tr></thead>
            <tbody>
              <tr v-for="product in products" :key="product.id" :class="{ selected: selectedId === product.id }">
                <td><span class="product-name">{{ product.name }}</span><span class="sku">{{ product.sku }}</span></td>
                <td class="numeric price">{{ formatPrice(product.price) }}</td>
                <td class="numeric"><span :class="['stock', { 'stock-empty': product.availableStock === 0 }]">{{ product.availableStock === 0 ? t('outOfStock') : product.availableStock }}</span></td>
                <td class="row-action"><button class="detail-button" :aria-pressed="selectedId === product.id" :aria-label="t('viewDetailsLabel', { name: product.name })" @click="loadDetail(product.id)">{{ t(selectedId === product.id ? 'selected' : 'viewDetails') }}</button></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="listState === 'success'" class="pagination">
          <span>{{ t(keyword.trim() ? 'matchedCount' : 'pageItemCount', { count: products.length }) }}</span>
          <div class="page-controls" :aria-label="t('paginationLabel')">
            <button class="page-button" :disabled="page.page <= 1" :aria-label="t('previousPage')" @click="loadPage(page.page - 1)"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12 5-5 5 5 5" /></svg></button>
            <span>{{ t('pagePosition', { page: page.page, pages: pageCount }) }}</span>
            <button class="page-button" :disabled="page.page >= pageCount" :aria-label="t('nextPage')" @click="loadPage(page.page + 1)"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 5 5 5-5 5" /></svg></button>
          </div>
        </div>
      </section>

      <aside class="detail-panel" aria-labelledby="detail-title" :aria-busy="selectedId !== null && detailState === 'loading'">
        <div class="detail-heading"><h2 id="detail-title">{{ t('detailTitle') }}</h2><span v-if="selectedId !== null" class="selected-label">{{ t('selected') }}</span></div>
        <div v-if="selectedId === null" class="detail-placeholder">
          <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 6h18l7 7v29H12zM30 6v8h7M18 22h13M18 28h13M18 34h8" /></svg>
          <h3>{{ t('chooseProductTitle') }}</h3><p>{{ t('chooseProductDescription') }}</p>
        </div>
        <div v-else-if="detailState === 'loading'" class="detail-loading" role="status"><span class="sr-only">{{ t('detailLoading') }}</span><i /><i /><i /><i /></div>
        <div v-else-if="detailState === 'error'" class="state-panel detail-error" role="alert">
          <h3>{{ t('detailFailed') }}</h3><p>{{ detailErrorMessage }}</p><button class="button secondary" @click="selectedId !== null && loadDetail(selectedId)">{{ t('retryDetail') }}</button>
        </div>
        <div v-else-if="detail" class="detail-content" aria-live="polite">
          <h3>{{ detail.name }}</h3><p class="detail-sku">{{ detail.sku }}</p>
          <dl><div><dt>{{ t('productPrice') }}</dt><dd class="detail-price">{{ formatPrice(detail.price) }}</dd></div><div><dt>{{ t('availableStock') }}</dt><dd>{{ detail.availableStock }} <span class="unit">{{ t('stockUnit') }}</span></dd></div><div><dt>{{ t('productId') }}</dt><dd>{{ detail.id }}</dd></div></dl>
          <div class="description"><h4>{{ t('descriptionTitle') }}</h4><p>{{ detail.description || t('noDescription') }}</p></div>
        </div>
      </aside>
    </div>
    <OrderPanel :product="detailState === 'success' ? detail : null" @created="refreshAfterOrder" />
    <footer class="page-footer"><span>{{ t('currencyNote') }}</span><span>{{ t('stockNote') }}</span></footer>
  </main>
</template>
