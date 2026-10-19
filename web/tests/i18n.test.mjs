import assert from 'node:assert/strict'
import test from 'node:test'
// Load Vue before installing a small document stub: these tests do not render DOM.
import { nextTick } from 'vue'
import { locales, messages, translate } from '../src/messages.ts'

const STORAGE_KEY = 'commerce-lab.locale'
let moduleId = 0
const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort()

function environment(t, { stored = null, getError = false, setError = false, storageError = false } = {}) {
  const values = new Map(stored === null ? [] : [[STORAGE_KEY, stored]])
  const storage = {
    getItem(key) {
      if (getError) throw new DOMException('Storage unavailable', 'SecurityError')
      return values.get(key) ?? null
    },
    setItem(key, value) {
      if (setError) throw new DOMException('Storage full', 'QuotaExceededError')
      values.set(key, String(value))
    },
  }
  const document = {
    title: '',
    documentElement: { lang: '', setAttribute(name, value) { this[name] = value } },
  }
  const window = { document }
  Object.defineProperty(window, 'localStorage', {
    get() {
      if (storageError) throw new DOMException('Storage blocked', 'SecurityError')
      return storage
    },
  })
  for (const [name, value] of Object.entries({ window, document })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name)
    Object.defineProperty(globalThis, name, { configurable: true, value, writable: true })
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original)
      else delete globalThis[name]
    })
  }
  return { values, document }
}

async function freshI18n() {
  return (await import(`../src/i18n.ts?test=${++moduleId}`)).useI18n()
}

test('三份词典的 key 与插值占位符严格一致', () => {
  assert.deepEqual([...locales], ['zh-CN', 'en', 'ja'])
  const keys = Object.keys(messages['zh-CN']).sort()
  assert.ok(keys.length > 20, '实际界面词典应覆盖页面，而不是只有语言名称')
  for (const locale of locales) {
    assert.deepEqual(Object.keys(messages[locale]).sort(), keys, locale)
    for (const key of keys) {
      assert.equal(typeof messages[locale][key], 'string', `${locale}.${key}`)
      assert.ok(messages[locale][key].trim(), `${locale}.${key} 不能为空`)
      assert.deepEqual(placeholders(messages[locale][key]), placeholders(messages['zh-CN'][key]), `${locale}.${key}`)
    }
  }
})

test('translate 对全部文案执行真实插值，结果不残留占位符', () => {
  let interpolated = 0
  for (const locale of locales) {
    for (const [key, template] of Object.entries(messages[locale])) {
      const names = placeholders(template)
      const params = Object.fromEntries(names.map(name => [name, `VALUE_${name}`]))
      const expected = template.replace(/\{(\w+)\}/g, (_match, name) => params[name])
      assert.equal(translate(locale, key, params), expected, `${locale}.${key}`)
      if (names.length) interpolated++
    }
  }
  assert.ok(interpolated >= 3, '必须实际覆盖带参数的文案')
})

test('无保存值时默认中文，并提供固定语言名称', async t => {
  const { document } = environment(t)
  const { locale, languageOptions } = await freshI18n()
  await nextTick()
  assert.equal(locale.value, 'zh-CN')
  assert.deepEqual(languageOptions, [
    { value: 'zh-CN', label: '中文' },
    { value: 'en', label: 'English' },
    { value: 'ja', label: '日本語' },
  ])
  assert.equal(document.documentElement.lang, 'zh-CN')
  assert.equal(document.title, messages['zh-CN'].appTitle)
})

for (const locale of locales) {
  test(`读取已保存语言 ${locale}，同步 html.lang 和标题`, async t => {
    const { document } = environment(t, { stored: locale })
    const state = await freshI18n()
    await nextTick()
    assert.equal(state.locale.value, locale)
    assert.equal(document.documentElement.lang, locale)
    assert.equal(document.title, messages[locale].appTitle)
  })
}

test('切换语言立即更新翻译、标题和存储；重新加载模块仍读取选择', async t => {
  const { values, document } = environment(t)
  const state = await freshI18n()
  const key = Object.keys(messages['zh-CN']).find(key => messages.en[key] !== messages['zh-CN'][key])
  assert.ok(key)
  state.setLocale('en')
  await nextTick()
  assert.equal(state.locale.value, 'en')
  assert.equal(state.t(key), translate('en', key))
  assert.equal(values.get(STORAGE_KEY), 'en')
  assert.equal(document.documentElement.lang, 'en')
  assert.equal(document.title, messages.en.appTitle)
  const restored = await freshI18n()
  assert.equal(restored.locale.value, 'en')
})

test('非法存储语言回退中文；非法 setLocale 不改变当前选择', async t => {
  const { values, document } = environment(t, { stored: 'en-US' })
  const state = await freshI18n()
  assert.equal(state.locale.value, 'zh-CN')
  state.setLocale('ja')
  await nextTick()
  const before = values.get(STORAGE_KEY)
  for (const invalid of ['en-US', 'EN', '', '__proto__', null, 1]) state.setLocale(invalid)
  await nextTick()
  assert.equal(state.locale.value, 'ja')
  assert.equal(document.documentElement.lang, 'ja')
  assert.equal(values.get(STORAGE_KEY), before)
})

for (const options of [{ getError: true }, { setError: true }, { storageError: true }]) {
  test(`localStorage 不可用仍能切换语言：${Object.keys(options)[0]}`, async t => {
    const { document } = environment(t, options)
    const state = await freshI18n()
    assert.equal(state.locale.value, 'zh-CN')
    assert.doesNotThrow(() => state.setLocale('en'))
    await nextTick()
    assert.equal(state.locale.value, 'en')
    assert.equal(document.documentElement.lang, 'en')
    assert.equal(document.title, messages.en.appTitle)
  })
}
