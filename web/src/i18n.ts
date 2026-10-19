import { ref } from 'vue'
import { locales, translate } from './messages.ts'
import type { Locale, MessageKey } from './messages.ts'

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
const languageOptions: { value: Locale; label: string }[] = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
]

function syncDocument() {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale.value
    document.title = translate(locale.value, 'appTitle')
  }
}

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

function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return translate(locale.value, key, params)
}

syncDocument()

export function useI18n() {
  return { locale, setLocale, t, languageOptions }
}
