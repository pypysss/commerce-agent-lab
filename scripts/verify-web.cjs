// Normal list/detail use the real Java/MySQL chain; injected failures are labelled separately.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const browser = await chromium.launch({headless:true,
    executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const result = {realChain:[], injectedUiCases:[], pageErrors:[]};
  try {
    const page = await browser.newPage({viewport:{width:1440,height:960}});
    page.on('pageerror', e => result.pageErrors.push(e.message));
    await page.route('**/api/v1/products?*', async route => {
      await new Promise(resolve => setTimeout(resolve,350));
      await route.continue();
    });
    await page.goto('http://127.0.0.1:15173/');
    await page.getByText('正在加载商品列表',{exact:true}).waitFor({state:'attached'});
    await page.locator('tbody tr').first().waitFor();
    assert.equal(await page.locator('tbody tr').count(),3);
    assert.equal(await page.locator('tbody tr').first().locator('.price').innerText(),'¥129.90');
    result.realChain.push('真实三条商品、中文、金额129.90和加载状态');
    await page.unroute('**/api/v1/products?*');
    await page.getByRole('button',{name:'查看Java 并发学习手册详情',exact:true}).click();
    await page.locator('.detail-content .detail-sku').getByText('COURSE-001').waitFor();
    result.realChain.push('详情经独立真实API读取');
    await page.screenshot({path:path.join(root,'evidence/step-02-desktop.png'),fullPage:true});
    await page.getByLabel('筛选当前页').fill('does-not-exist');
    await page.getByText('当前页没有匹配的商品',{exact:true}).waitFor();
    await page.getByRole('button',{name:'清除筛选',exact:true}).click();
    assert.equal(await page.locator('tbody tr').count(),3);
    result.realChain.push('无匹配筛选与清除恢复');
    await page.getByRole('button',{name:'查看开发者桌面工具包详情',exact:true}).focus();
    await page.keyboard.press('Enter');
    await page.locator('.detail-content .detail-sku').getByText('TOOL-002').waitFor();
    result.realChain.push('键盘操作详情');

    await page.route('**/api/v1/products?*',route => route.fulfill({status:503,
      contentType:'application/json',body:JSON.stringify({code:'TEST_OUTAGE',message:'教学注入：服务暂不可用'})}));
    await page.getByRole('button',{name:'刷新列表',exact:true}).click();
    await page.getByText('商品列表加载失败',{exact:true}).waitFor();
    assert.equal(await page.locator('tbody tr').count(),0);
    await page.unroute('**/api/v1/products?*');
    await page.getByRole('button',{name:'重新加载',exact:true}).click();
    await page.locator('tbody tr').first().waitFor();
    result.injectedUiCases.push('注入HTTP503，无假成功，重试恢复真实数据');

    await page.route('**/api/v1/products?*',route => route.fulfill({status:200,
      contentType:'application/json',body:JSON.stringify({items:[],page:1,size:20,total:0})}));
    await page.getByRole('button',{name:'刷新列表',exact:true}).click();
    await page.getByText('还没有商品',{exact:true}).waitFor();
    result.injectedUiCases.push('注入空数据，展示空状态');
    await page.unroute('**/api/v1/products?*');
    await page.getByRole('button',{name:'刷新列表',exact:true}).first().click();
    await page.locator('tbody tr').first().waitFor();

    const invalidResponses = [
      {status:200, body:JSON.stringify({items:[{id:1,sku:'TEST',name:'测试',description:'错误金额类型',price:129.9,availableStock:1}],page:1,size:20,total:1}),
       message:'商品服务返回的数据格式不符合约定，请刷新重试。', label:'HTTP200错误字段结构被拒绝，不进入成功状态'},
      {status:200, body:'<html>not json</html>',
       message:'商品服务返回了无法解析的 JSON，请刷新重试。', label:'HTTP200非法JSON显示解析错误'},
      {status:503, body:'<html>unavailable</html>',
       message:'商品服务请求失败（503），请重试。', label:'HTTP503 HTML保留状态错误，不误报JSON错误'},
    ];
    for (const fixture of invalidResponses) {
      await page.route('**/api/v1/products?*',route => route.fulfill({status:fixture.status,body:fixture.body}));
      await page.getByRole('button',{name:'刷新列表',exact:true}).click();
      await page.getByText(fixture.message,{exact:true}).waitFor();
      assert.equal(await page.locator('tbody tr').count(),0);
      await page.unroute('**/api/v1/products?*');
      await page.getByRole('button',{name:'重新加载',exact:true}).click();
      await page.locator('tbody tr').first().waitFor();
      result.injectedUiCases.push(fixture.label + '，重试恢复真实服务');
    }

    const mobile = await browser.newPage({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1});
    mobile.on('pageerror',e=>result.pageErrors.push(e.message));
    await mobile.goto('http://127.0.0.1:15173/');
    await mobile.locator('tbody tr').first().waitFor();
    await mobile.getByRole('button',{name:'查看RAG 实践指南详情',exact:true}).click();
    await mobile.locator('.detail-content .detail-sku').getByText('GUIDE-003').waitFor();
    assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    await mobile.screenshot({path:path.join(root,'evidence/step-02-mobile.png'),fullPage:true});
    result.realChain.push('390px移动视图、零库存详情、无页面水平溢出');
    assert.equal(result.pageErrors.length,0);
    result.passed = true;
    fs.writeFileSync(path.join(root,'evidence/step-02-browser.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result));
  } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
