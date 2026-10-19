// Normal data always comes from Vue -> Java -> MyBatis -> MySQL.
// Failure and empty-response fixtures below are explicitly labelled in the report.
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const base = 'http://127.0.0.1:15173/';
const storageKey = 'commerce-lab.locale';
const listPattern = '**/api/v1/products?*';
const result = {realChain:[], injectedUiCases:[], storageCases:[], screenshots:[], pageErrors:[]};
const deferred = () => {
  let resolve;
  const promise = new Promise(done => {resolve = done});
  return {promise, resolve};
};

(async () => {
  const {locales, translate} = await import(pathToFileURL(path.join(root, 'web/src/messages.ts')).href);
  const browser = await chromium.launch({headless:true,
    executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  fs.mkdirSync(path.join(root, 'evidence'), {recursive:true});
  const listen = page => page.on('pageerror', error => result.pageErrors.push(error.message));
  async function localeOf(page, locale) {
    await page.locator('#language-select').selectOption(locale);
    await page.waitForFunction(value => document.documentElement.lang === value, locale);
    assert.equal(await page.title(), translate(locale, 'appTitle'));
    assert.equal(await page.locator('#language-select').getAttribute('aria-label')
      || await page.locator('label[for="language-select"]').innerText(), translate(locale, 'languageLabel'));
  }
  async function rows(page) { await page.locator('tbody tr').first().waitFor(); }
  async function refresh(page) {
    const locale = await page.locator('#language-select').inputValue();
    await page.getByRole('button', {name:translate(locale, 'refresh'), exact:true}).first().click();
  }
  async function recover(page) {
    const locale = await page.locator('#language-select').inputValue();
    await page.getByRole('button', {name:translate(locale, 'retryList'), exact:true}).click();
    await rows(page);
  }
  async function screenshot(page, name) {
    const file = `evidence/${name}.png`;
    await page.screenshot({path:path.join(root, file), fullPage:true});
    result.screenshots.push(file);
  }
  try {
    const page = await browser.newPage({viewport:{width:1440,height:960}});
    listen(page);
    const listGate = deferred();
    await page.route(listPattern, async route => {await listGate.promise; await route.continue()});
    const firstResponse = page.waitForResponse(response => /\/api\/v1\/products\?/.test(response.url()));
    await page.goto(base, {waitUntil:'domcontentloaded'});
    await page.locator('.loading-list .sr-only').waitFor({state:'attached'});
    for (const locale of locales) {
      await localeOf(page, locale);
      assert.equal(await page.locator('.loading-list .sr-only').innerText(), translate(locale, 'listLoading'));
      assert.equal(await page.locator('.detail-placeholder h3').innerText(), translate(locale, 'chooseProductTitle'));
    }
    listGate.resolve();
    const response = await firstResponse;
    assert.equal(response.status(), 200);
    const payload = await response.json();
    assert.equal(payload.items.length, 3);
    await rows(page);
    await page.unroute(listPattern);
    result.realChain.push('仅延迟真实列表响应，验证三语加载状态；放行后真实Java/MySQL返回3条商品');

    for (const locale of locales) {
      await localeOf(page, locale);
      assert.equal(await page.locator('h1').innerText(), translate(locale, 'pageTitle'));
      assert.equal(await page.locator('#catalog-title').innerText(), translate(locale, 'listTitle'));
      assert.equal(await page.locator('#detail-title').innerText(), translate(locale, 'detailTitle'));
      assert.equal(await page.locator('#product-search').getAttribute('placeholder'), translate(locale, 'searchPlaceholder'));
      assert.equal(await page.locator('label[for="product-search"]').innerText(), translate(locale, 'filterLabel'));
      assert.equal(await page.locator('table caption').innerText(), translate(locale, 'tableCaption'));
      assert.equal(await page.locator('.page-controls').getAttribute('aria-label'), translate(locale, 'paginationLabel'));
      await page.getByRole('button', {name:translate(locale, 'previousPage'),exact:true}).waitFor();
      await page.getByRole('button', {name:translate(locale, 'nextPage'),exact:true}).waitFor();
      assert.equal(await page.locator('tbody .price').first().innerText(), '¥129.90');
      assert.equal(await page.locator('tbody .stock-empty').innerText(), translate(locale, 'outOfStock'));
      assert.equal(await page.locator('.page-footer span').first().innerText(), translate(locale, 'currencyNote'));
      for (let index = 0; index < payload.items.length; index++) {
        assert.equal(await page.locator('tbody tr').nth(index).locator('.product-name').innerText(), payload.items[index].name);
        assert.equal(await page.locator('.detail-button').nth(index).getAttribute('aria-label'),
          translate(locale, 'viewDetailsLabel', {name:payload.items[index].name}));
      }
      const detailResponse = page.waitForResponse(value => new URL(value.url()).pathname === '/api/v1/products/1');
      await page.locator('.detail-button').first().click();
      assert.equal((await detailResponse).status(), 200);
      await page.locator('.detail-content .detail-sku').getByText('COURSE-001', {exact:true}).waitFor();
      assert.equal(await page.locator('.detail-content h3').innerText(), payload.items[0].name);
      assert.equal(await page.locator('.description p').innerText(), payload.items[0].description);
      assert.equal(await page.locator('.detail-price').innerText(), '¥129.90');
      assert.equal(await page.locator('.description h4').innerText(), translate(locale, 'descriptionTitle'));
      await page.getByLabel(translate(locale, 'filterLabel'), {exact:true}).fill('no-match-for-i18n');
      await page.getByText(translate(locale, 'noMatchesTitle'), {exact:true}).waitFor();
      await page.getByRole('button', {name:translate(locale, 'clearFilter'),exact:true}).click();
      assert.equal(await page.locator('tbody tr').count(), 3);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${locale} desktop overflow`);
      await screenshot(page, `step-02-i18n-desktop-${locale}`);
      result.realChain.push(`${locale}: 列表/详情/筛选/ARIA/标题完整翻译；商品名和描述保持数据库中文，金额仍为¥129.90/CNY`);
    }

    await page.reload();
    await rows(page);
    assert.equal(await page.locator('#language-select').inputValue(), 'ja');
    assert.equal(await page.evaluate(() => localStorage.getItem('commerce-lab.locale')), 'ja');
    assert.equal(await page.title(), translate('ja', 'appTitle'));
    result.storageCases.push('切到日语后刷新页面，选择和标题保持日语');

    await page.route(listPattern, route => route.fulfill({status:200, contentType:'application/json',
      body:JSON.stringify({items:[],page:1,size:20,total:0})}));
    await refresh(page);
    for (const locale of locales) {
      await localeOf(page, locale);
      await page.getByText(translate(locale, 'noProductsTitle'), {exact:true}).waitFor();
      await page.getByText(translate(locale, 'noProductsDescription'), {exact:true}).waitFor();
    }
    result.injectedUiCases.push('注入空列表，三语空状态随选择即时更新');
    await page.unroute(listPattern);
    await refresh(page);
    await rows(page);

    const failures = [
      {status:503, body:JSON.stringify({code:'DATABASE_UNAVAILABLE',message:'数据服务暂不可用，请稍后重试'}),key:'errorDatabaseUnavailable',label:'已知后端错误码'},
      {status:503, body:JSON.stringify({code:'TEST_UNKNOWN',message:'教学注入：不应直接显示这段中文'}),key:'errorHttp',params:{status:503},label:'未知后端中文message使用当前语言状态码提示'},
      {status:200, body:'<html>not json</html>',key:'errorInvalidJson',label:'无效JSON'},
      {status:200, body:JSON.stringify({items:'wrong-shape'}),key:'errorInvalidData',label:'接口结构错误'},
      {abort:true,key:'errorNetwork',label:'网络错误'},
    ];
    for (const fixture of failures) {
      await page.route(listPattern, route => fixture.abort ? route.abort('failed') : route.fulfill({status:fixture.status,body:fixture.body}));
      await refresh(page);
      await page.locator('.error-panel').waitFor();
      for (const locale of locales) {
        await localeOf(page, locale);
        assert.equal(await page.locator('.error-panel h3').innerText(), translate(locale, 'listFailed'));
        assert.equal(await page.locator('.error-panel p').innerText(), translate(locale, fixture.key, fixture.params));
        assert.equal(await page.locator('tbody tr').count(), 0);
      }
      result.injectedUiCases.push(`注入${fixture.label}，保持错误状态时切换三语立即更新；无原始中文message泄漏`);
      await page.unroute(listPattern);
      await recover(page);
    }

    const detailGate = deferred();
    await page.route('**/api/v1/products/1', async route => {await detailGate.promise; await route.continue()});
    await page.locator('.detail-button').first().click();
    for (const locale of locales) {
      await localeOf(page, locale);
      assert.equal(await page.locator('.detail-loading .sr-only').innerText(), translate(locale, 'detailLoading'));
    }
    detailGate.resolve();
    await page.locator('.detail-content .detail-sku').getByText('COURSE-001', {exact:true}).waitFor();
    await page.unroute('**/api/v1/products/1');
    result.realChain.push('仅延迟真实详情响应，三语详情加载状态即时更新，放行后读取真实详情');

    await page.route('**/api/v1/products/1', route => route.fulfill({status:404,contentType:'application/json',
      body:JSON.stringify({code:'PRODUCT_NOT_FOUND',message:'商品不存在或未上架'})}));
    await page.locator('.detail-button').first().click();
    await page.locator('.detail-error').waitFor();
    for (const locale of locales) {
      await localeOf(page, locale);
      assert.equal(await page.locator('.detail-error h3').innerText(), translate(locale, 'detailFailed'));
      assert.equal(await page.locator('.detail-error p').innerText(), translate(locale, 'errorNotFound'));
    }
    await page.unroute('**/api/v1/products/1');
    await page.getByRole('button', {name:translate('ja','retryDetail'),exact:true}).click();
    await page.locator('.detail-content .detail-sku').getByText('COURSE-001', {exact:true}).waitFor();
    result.injectedUiCases.push('注入详情404，三语详情错误和重试按钮翻译，重试恢复真实详情');

    const firstDetailStarted = deferred();
    const lateDetail = deferred();
    const lateHandled = deferred();
    await page.route('**/api/v1/products/1', async route => {
      const actualResponse = await route.fetch();
      firstDetailStarted.resolve();
      await lateDetail.promise;
      try {
        await route.fulfill({response:actualResponse});
        lateHandled.resolve(null);
      } catch (error) {
        lateHandled.resolve(error);
      }
    });
    const firstAborted = page.waitForEvent('requestfailed', {predicate:request => new URL(request.url()).pathname === '/api/v1/products/1'});
    await page.locator('.detail-button').first().click();
    await firstDetailStarted.promise;
    await page.locator('.detail-button').nth(1).click();
    await page.locator('.detail-content .detail-sku').getByText('TOOL-002', {exact:true}).waitFor();
    await firstAborted;
    lateDetail.resolve();
    const lateError = await lateHandled.promise;
    // Some browser versions reject fulfilling an already-cancelled routed request.
    if (lateError) assert.ok((await firstAborted).failure(), 'late fulfilment only fails for the cancelled request');
    await page.unroute('**/api/v1/products/1');
    assert.equal(await page.locator('.detail-content .detail-sku').innerText(), 'TOOL-002');
    assert.equal(await page.locator('.detail-error').count(), 0);
    result.realChain.push('延迟真实商品1响应后立即选择商品2：旧请求被取消，无错误提示，详情保持商品2');

    const invalid = await browser.newPage({viewport:{width:1440,height:960}});
    listen(invalid);
    await invalid.addInitScript(key => localStorage.setItem(key, 'en-US'), storageKey);
    await invalid.goto(base);
    await rows(invalid);
    assert.equal(await invalid.locator('#language-select').inputValue(), 'zh-CN');
    assert.equal(await invalid.title(), translate('zh-CN', 'appTitle'));
    result.storageCases.push('无效已保存语言 en-US 回退中文');
    await invalid.close();

    const blocked = await browser.newPage({viewport:{width:1440,height:960}});
    listen(blocked);
    await blocked.addInitScript(() => Object.defineProperty(window,'localStorage',{
      configurable:true,get(){throw new DOMException('blocked for test','SecurityError')},
    }));
    await blocked.goto(base);
    await rows(blocked);
    await localeOf(blocked, 'en');
    assert.equal(await blocked.locator('tbody tr').count(), 3);
    result.storageCases.push('注入localStorage访问失败，页面正常加载并可切换英文');
    await blocked.close();

    const mobile = await browser.newPage({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1});
    listen(mobile);
    await mobile.goto(base);
    await rows(mobile);
    for (const locale of locales) {
      await localeOf(mobile, locale);
      await mobile.locator('.detail-button').nth(2).click();
      await mobile.locator('.detail-content .detail-sku').getByText('GUIDE-003', {exact:true}).waitFor();
      assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${locale} mobile overflow`);
      assert.equal(await mobile.locator('tbody .price').first().innerText(), '¥129.90');
      await screenshot(mobile, `step-02-i18n-mobile-${locale}`);
      result.realChain.push(`${locale}: 390px真实列表与零库存详情，无整页水平溢出，人民币金额未转换`);
    }
    assert.equal(result.pageErrors.length, 0);
    result.passed = true;
  } catch (error) {
    result.passed = false;
    result.failure = error.stack || String(error);
    throw error;
  } finally {
    fs.writeFileSync(path.join(root, 'evidence/step-02-i18n-browser.json'), JSON.stringify(result,null,2));
    await browser.close();
  }
  console.log(JSON.stringify(result));
})().catch(error => {console.error(error);process.exitCode=1});
