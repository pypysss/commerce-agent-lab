// Real browser -> Vite -> Java -> MySQL. Fixture lifecycle is managed separately.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const base = process.env.LAB_WEB_URL || 'http://127.0.0.1:15173/';
const productId = Number(process.env.ORDER_FIXTURE_ID || 880000003);
const result = {step:'step-03',attempt:1,checks:[],pageErrors:[],injectedCases:[]};

(async () => {
  const {translate} = await import(pathToFileURL(path.join(root,'web/src/messages.ts')).href);
  const passwords = JSON.parse(fs.readFileSync(path.join(root,'state/demo-users.json'),'utf8'));
  const browser = await chromium.launch({headless:true,
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1100}});
    page.on('pageerror',error => result.pageErrors.push(error.message));
    let apiRequests=0;
    page.on('request', request => {if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests++;});
    await page.goto(base);
    await page.locator('#login-username').waitFor();
    await page.locator('tbody tr').first().waitFor();
    async function language(locale) {
      await page.locator('#language-select').selectOption(locale);
      await page.waitForFunction(value => document.documentElement.lang === value,locale);
    }
    async function signIn(username) {
      await page.locator('#login-username').fill(username);
      await page.locator('#login-password').fill(passwords[username]);
      await page.getByRole('button',{name:translate('zh-CN','signIn'),exact:true}).click();
      await page.locator('.session-actions').waitFor();
      await page.waitForFunction(() => !document.querySelector('.my-orders-heading button')?.disabled);
      assert.equal(await page.locator('#login-password').count(),0);
    }
    await page.locator('#login-username').fill('alice');
    await page.locator('#login-password').fill('deliberately-invalid-test-value');
    await page.getByRole('button',{name:translate('zh-CN','signIn'),exact:true}).click();
    await page.locator('.order-error').waitFor();
    for (const locale of ['en','ja','zh-CN']) {
      const before=apiRequests;
      await language(locale);
      assert.equal(await page.locator('.order-error').innerText(),translate(locale,'errorInvalidCredentials'));
      assert.equal(apiRequests,before);
    }
    result.checks.push('Invalid credentials stay structured and retranslate in three languages without requests');
    await signIn('alice');
    const row = page.locator('tbody tr').filter({hasText:'订单验收专用商品'});
    await row.getByRole('button').click();
    await page.locator('.create-order-form .order-selection p').filter({hasText:'订单验收专用商品'}).waitFor();
    await page.locator('#order-quantity').fill('2');
    let committed;
    let firstKey;
    const orderKeys=[];
    page.on('request',request => {
      if (new URL(request.url()).pathname === '/api/v1/orders' && request.method() === 'POST') {
        orderKeys.push(request.postDataJSON().requestKey);
      }
    });
    await page.route('**/api/v1/orders',async route => {
      if (route.request().method() !== 'POST') return route.continue();
      firstKey=route.request().postDataJSON().requestKey;
      const response=await route.fetch();
      assert.equal(response.status(),200);
      committed=await response.json();
      await route.abort('failed');
    }, {times:1});
    await page.getByRole('button',{name:translate('zh-CN','createOrder'),exact:true}).click();
    await page.locator('.order-error').waitFor();
    assert.ok(committed?.id);
    assert.equal(committed.productId,productId);
    for (const locale of ['en','ja','zh-CN']) {
      const before=apiRequests;
      await language(locale);
      assert.equal(await page.locator('.order-error').innerText(),translate(locale,'orderErrorNetwork'));
      assert.equal(apiRequests,before);
    }
    const retry=page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/orders'
      && response.request().method() === 'POST');
    await page.getByRole('button',{name:translate('zh-CN','createOrder'),exact:true}).click();
    const retried=await (await retry).json();
    assert.equal(retried.id,committed.id);
    assert.equal(orderKeys.length,2);
    assert.equal(orderKeys[1],firstKey);
    assert.equal(retried.totalAmount,'25.00');
    result.injectedCases.push({scenario:'Response lost after a real committed order; retry uses same key',
      realServerCommit:true,clientNetworkFailureInjected:true,orderId:retried.id,sameKey:true,totalAmount:retried.totalAmount});
    await page.locator('.order-row').filter({hasText:'订单验收专用商品'}).waitFor();
    const orderRow=page.locator('.order-row').filter({hasText:'订单验收专用商品'});
    await page.waitForFunction(() => !document.querySelector('.order-row button')?.disabled);
    await orderRow.getByRole('button').click();
    await orderRow.locator('.order-status-paid').waitFor();
    await page.getByRole('button',{name:translate('zh-CN','refreshOrders'),exact:true}).click();
    await orderRow.locator('.order-status-paid').waitFor();
    result.checks.push('Login, real order, exact CNY amount, simulation payment and refresh');
    await page.evaluate(() => window.scrollTo(0,0));
    await page.screenshot({path:path.join(root,'evidence/step-03-desktop.png'),fullPage:true});
    await page.getByRole('button',{name:translate('zh-CN','signOut'),exact:true}).click();
    await page.locator('#login-username').waitFor();
    assert.equal(await page.locator('.order-row').count(),0);
    await signIn('bob');
    assert.equal(await page.locator('.order-row').filter({hasText:'订单验收专用商品'}).count(),0);
    const forbidden=await page.evaluate(async id => {
      const response=await fetch(`/api/v1/orders/${id}`,{cache:'no-store'});
      return {status:response.status,code:(await response.json()).code};
    },retried.id);
    assert.deepEqual(forbidden,{status:403,code:'ORDER_FORBIDDEN'});
    const csrf=await page.evaluate(async id => {
      const response=await fetch(`/api/v1/orders/${id}/pay`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      return {status:response.status,code:(await response.json()).code};
    },retried.id);
    assert.deepEqual(csrf,{status:403,code:'CSRF_INVALID'});
    result.checks.push('Logout clears orders; second user cannot read first user order; missing CSRF rejected');
    await page.getByRole('button',{name:translate('zh-CN','signOut'),exact:true}).click();
    await page.locator('#login-username').waitFor();
    await page.setViewportSize({width:390,height:844});
    for (const locale of ['zh-CN','en','ja']) {
      await language(locale);
      assert.equal(await page.locator('#login-username').getAttribute('autocomplete'),'username');
      assert.equal(await page.locator('#login-password').getAttribute('type'),'password');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.evaluate(() => window.scrollTo(0,0));
      await page.screenshot({path:path.join(root,`evidence/step-03-mobile-${locale}.png`),fullPage:true});
    }
    result.checks.push('Three-language 390px layout has no document overflow');
    assert.deepEqual(result.pageErrors,[]);
    result.orderId=retried.id;
    result.outcome='PASSED';
  } catch(error) {
    result.outcome='FAILED';result.failure=error.message;
    throw error;
  } finally {
    fs.writeFileSync(path.join(root,'evidence/step-03-browser.json'),JSON.stringify(result,null,2));
    await browser.close();
  }
})().catch(error => {console.error(error.message);process.exitCode=1;});
