// Real failures below only mutate query/id values before reaching Java.
// The one route.fulfill scenario is explicitly reported as an injected UI case.
// Browsers may send their native Accept-Language; the app no longer overrides it.
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const base = 'http://127.0.0.1:15173/';
const listPattern = '**/api/v1/products?*';
const detailPattern = '**/api/v1/products/1';
const backendMessages = {
  INVALID_ARGUMENT:'参数必须为整数且在有效范围内',
  PRODUCT_NOT_FOUND:'商品不存在或未上架',
};
const result = {realRequests:[], reactiveErrors:[], businessData:[], injectedCases:[], mobile:[], pageErrors:[]};

(async () => {
  const {locales, translate} = await import(pathToFileURL(path.join(root, 'web/src/messages.ts')).href);
  const browser = await chromium.launch({headless:true,
    executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  fs.mkdirSync(path.join(root, 'evidence'), {recursive:true});
  let nativeAcceptLanguage;
  let nativeHeaderCaptured = false;

  async function select(page, locale) {
    await page.locator('#language-select').selectOption(locale);
    await page.waitForFunction(value => document.documentElement.lang === value, locale);
  }
  async function rows(page) {await page.locator('tbody tr').first().waitFor()}
  function listResponse(page) {
    return page.waitForResponse(response => /\/api\/v1\/products\?/.test(response.url()));
  }
  async function refresh(page, locale) {
    const response = listResponse(page);
    await page.getByRole('button', {name:translate(locale, 'refresh'), exact:true}).click();
    return response;
  }
  async function checkResponse(response, locale, status, code, scenario, intercepted = false) {
    assert.equal(response.status(), status, scenario);
    const sent = await response.request().allHeaders();
    if (!nativeHeaderCaptured) {
      nativeAcceptLanguage = sent['accept-language'];
      nativeHeaderCaptured = true;
      result.nativeAcceptLanguage = nativeAcceptLanguage ?? null;
    }
    // Playwright URL rewriting may omit the browser-native header from the
    // reported request metadata. Normal/retry requests must keep it unchanged;
    // intercepted requests may omit it, but must not report a UI-specific value.
    if (!intercepted || sent['accept-language'] !== undefined) {
      assert.equal(sent['accept-language'], nativeAcceptLanguage,
        `${scenario}: UI language must not override the browser-native header`);
    }
    const body = await response.json();
    const received = await response.allHeaders();
    if (code) {
      assert.equal(body.code, code, scenario);
      assert.equal(body.message, backendMessages[code], `${scenario}: fixed safe backend diagnostic`);
      assert.equal(received['content-language'], undefined, `${scenario}: no backend language selection`);
      assert.equal((received.vary || '').toLowerCase().split(',').map(value => value.trim())
        .includes('accept-language'), false, `${scenario}: no language-dependent response cache variant`);
    }
    result.realRequests.push({scenario,uiLocale:locale,nativeAcceptLanguage:sent['accept-language'] ?? null,
      requestMetadata:intercepted ? 'Playwright URL-mutated; native header may be unreported' : 'direct browser request',status,
      ...(code ? {code:body.code,message:body.message,contentLanguage:received['content-language'] ?? null} : {})});
    return body;
  }
  try {
    const page = await browser.newPage({viewport:{width:1440,height:960}});
    page.on('pageerror', error => result.pageErrors.push(error.message));
    let requestCount = 0;
    page.on('request', request => {if (new URL(request.url()).pathname.startsWith('/api/')) requestCount++});
    const initial = listResponse(page);
    await page.goto(base);
    const original = await checkResponse(await initial, 'zh-CN', 200, null, 'initial list');
    await rows(page);
    assert.equal(original.items.length, 3);
    assert.equal(original.items[0].price, '129.90');

    for (let index = 0; index < locales.length; index++) {
      const locale = locales[index];
      const nextLocale = locales[(index + 1) % locales.length];
      const beforeSwitch = requestCount;
      await select(page, locale);
      assert.equal(requestCount, beforeSwitch, 'switching UI language must not requery products');
      const normal = await checkResponse(await refresh(page, locale), locale, 200, null, 'UI-independent product request');
      await rows(page);
      assert.deepEqual(normal, original, 'products and decimal strings must be identical across UI languages');
      for (let row = 0; row < original.items.length; row++) {
        assert.equal(await page.locator('tbody .product-name').nth(row).innerText(), original.items[row].name);
      }
      assert.equal(await page.locator('tbody .price').first().innerText(), '¥129.90');
      result.businessData.push({locale,unchanged:true,firstName:normal.items[0].name,price:normal.items[0].price});

      // Only change the URL. Vite still proxies to the running Java controller.
      await page.route(listPattern, route => {
        const invalidUrl = new URL(route.request().url());
        invalidUrl.searchParams.set('page', '0');
        return route.continue({url:invalidUrl.href});
      });
      const badList = await refresh(page, locale);
      await checkResponse(badList, locale, 400, 'INVALID_ARGUMENT', 'URL-mutated real400', true);
      await page.locator('.error-panel').waitFor();
      assert.equal(await page.locator('.error-panel p').innerText(), translate(locale, 'errorInvalidArgument'));
      await page.unroute(listPattern);

      const beforeErrorSwitch = requestCount;
      await select(page, nextLocale);
      assert.equal(await page.locator('.error-panel p').innerText(), translate(nextLocale, 'errorInvalidArgument'));
      assert.equal(requestCount, beforeErrorSwitch, 'existing error translation must not refetch');
      const retryList = listResponse(page);
      await page.getByRole('button', {name:translate(nextLocale, 'retryList'),exact:true}).click();
      await checkResponse(await retryList, nextLocale, 200, null, 'list retry after UI language switch');
      await rows(page);
      result.reactiveErrors.push({kind:'list400',from:locale,to:nextLocale,refetchedOnSwitch:false});

      await select(page, locale);
      await page.route(detailPattern, route => {
        const missingUrl = new URL(route.request().url());
        missingUrl.pathname = '/api/v1/products/999999999';
        return route.continue({url:missingUrl.href});
      });
      const badDetail = page.waitForResponse(response => ['/api/v1/products/1', '/api/v1/products/999999999']
        .includes(new URL(response.url()).pathname));
      await page.locator('.detail-button').first().click();
      await checkResponse(await badDetail, locale, 404, 'PRODUCT_NOT_FOUND', 'URL-mutated real404', true);
      await page.locator('.detail-error').waitFor();
      assert.equal(await page.locator('.detail-error p').innerText(), translate(locale, 'errorNotFound'));
      await page.unroute(detailPattern);

      const beforeDetailSwitch = requestCount;
      await select(page, nextLocale);
      assert.equal(await page.locator('.detail-error p').innerText(), translate(nextLocale, 'errorNotFound'));
      assert.equal(requestCount, beforeDetailSwitch, 'existing detail error translation must not refetch');
      const retryDetail = page.waitForResponse(response => /\/api\/v1\/products\/1$/.test(response.url()));
      await page.getByRole('button', {name:translate(nextLocale, 'retryDetail'),exact:true}).click();
      const actualDetail = await checkResponse(await retryDetail, nextLocale, 200, null, 'detail retry after UI language switch');
      assert.deepEqual(actualDetail, original.items[0]);
      await page.locator('.detail-content .detail-sku').getByText(original.items[0].sku, {exact:true}).waitFor();
      assert.equal(await page.locator('.detail-content h3').innerText(), original.items[0].name);
      assert.equal(await page.locator('.description p').innerText(), original.items[0].description);
      result.reactiveErrors.push({kind:'detail404',from:locale,to:nextLocale,refetchedOnSwitch:false});
    }

    // Injected UI fallback experiment, distinct from the real Java 400/404 above.
    const unknownBody = {code:'FUTURE_ERROR',message:'后端原始中文不应直接展示给用户'};
    await page.route(listPattern, route => route.fulfill({
      status:418,contentType:'application/json',body:JSON.stringify(unknownBody),
    }));
    await select(page, 'en');
    const unknown = await refresh(page, 'en');
    assert.equal(unknown.status(), 418);
    assert.deepEqual(await unknown.json(), unknownBody);
    await page.locator('.error-panel').waitFor();
    const beforeUnknownSwitch = requestCount;
    for (const locale of locales) {
      await select(page, locale);
      assert.equal(await page.locator('.error-panel p').innerText(), translate(locale, 'errorHttp', {status:418}));
      assert.equal(await page.locator('body').innerText().then(text => text.includes(unknownBody.message)), false);
    }
    assert.equal(requestCount, beforeUnknownSwitch, 'unknown error translation must not refetch');
    await page.unroute(listPattern);
    const unknownRetry = listResponse(page);
    await page.getByRole('button', {name:translate('ja','retryList'),exact:true}).click();
    assert.deepEqual(await checkResponse(await unknownRetry, 'ja', 200, null, 'recovery after injected unknown error'), original);
    await rows(page);
    result.injectedCases.push({scenario:'unknown Chinese backend message',code:'FUTURE_ERROR',status:418,
      locales:[...locales],localizedGenericFallback:true,rawMessageHidden:true,refetchedOnSwitch:false,retryRecovered:true});

    const mobile = await browser.newPage({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1});
    mobile.on('pageerror', error => result.pageErrors.push(error.message));
    const mobileInitial = listResponse(mobile);
    await mobile.goto(base);
    await checkResponse(await mobileInitial, 'zh-CN', 200, null, 'mobile initial list');
    await rows(mobile);
    for (const locale of locales) {
      await select(mobile, locale);
      assert.deepEqual(await checkResponse(await refresh(mobile, locale), locale, 200, null, 'mobile UI-independent request'), original);
      await rows(mobile);
      assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      assert.equal(await mobile.locator('tbody .price').first().innerText(), '¥129.90');
      result.mobile.push({locale,width:390,overflow:false,productDataUnchanged:true});
    }
    assert.equal(result.pageErrors.length, 0);
    result.passed = true;
  } catch (error) {
    result.passed = false;
    result.failure = error.stack || String(error);
    throw error;
  } finally {
    fs.writeFileSync(path.join(root, 'evidence/step-02-error-i18n-browser.json'), JSON.stringify(result,null,2));
    await browser.close();
  }
  console.log(JSON.stringify(result));
})().catch(error => {console.error(error);process.exitCode=1});
