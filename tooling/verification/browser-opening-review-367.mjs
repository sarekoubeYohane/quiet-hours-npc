import assert from 'node:assert/strict';
import {startApp} from './real-route-runtime.mjs';
import {launchBrowser} from './browser-runtime.mjs';

const app = await startApp();
let browser, page;
try {
  browser = await launchBrowser();
  const context = await browser.newContext({viewport:{width:1080,height:720}});
  await context.addCookies([{name:'qh_local_owner',value:'review-check',url:app.url}]);
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  const button = name => page.getByRole('button',{name,exact:true});
  const click = async name => button(name).click();
  const save = () => page.getByText('已保存至帳號',{exact:true}).waitFor();
  await page.goto(app.url+'/new?owner=review-check');
  await page.getByLabel('加入 店主',{exact:true}).check();
  await click('下一步：場景與安排');
  await click('加入 住宅'); await click('加入 街角咖啡館');
  await page.locator('[name="opening-name"]').fill('核對回程驗收');
  await click('人物'); await page.getByLabel('店主起始場所',{exact:true}).selectOption({label:'住宅'});
  await page.getByLabel('店主起始房間',{exact:true}).selectOption({label:'客廳'});
  await click('場所與道路');await click('在 住宅 新增房間');
  await page.getByLabel('房間名稱',{exact:true}).fill('玄關');await click('＋新增物件');await page.locator(':focus').fill('鞋櫃');
  await page.getByText('可選：跨場所道路',{exact:true}).click();await click('新增道路');
  await click('人物關係');await click('新增背景人物');await page.getByLabel('背景人物名稱',{exact:true}).fill('阿岑');
  await click('從阿岑建立關係');await page.getByLabel('關係描述',{exact:true}).fill('常客');
  await click('下一步：核對開局');await page.getByRole('heading',{name:'核對開局',exact:true}).waitFor();
  const draftId = new URL(page.url()).searchParams.get('draft');
  const roundTrip = async (label, field, edit, updatedLabel=label) => {
    const anchor=button(label);
    await anchor.evaluate(node=>node.scrollIntoView({block:'center'}));
    const before=await anchor.evaluate(node=>node.getBoundingClientRect().top);
    await anchor.click();
    await page.waitForFunction(expected => document.activeElement?.getAttribute('aria-label') === expected,field);
    await edit();
    await click('返回核對');
    await page.waitForFunction(expected=>document.activeElement?.textContent===expected,updatedLabel);
    const after=await button(updatedLabel).evaluate(node=>node.getBoundingClientRect().top);
    assert.ok(Math.abs(before-after)<3,label+' scroll '+before+' → '+after);
  };
  await roundTrip('修改店主起點','店主起始場所',async()=>{
    await page.locator(':focus').selectOption({label:'街角咖啡館'});await page.getByLabel('店主起始房間',{exact:true}).selectOption({label:'前台'});
  });
  await page.getByText('玄關（1 件物件、0 扇門）',{exact:true}).click();
  await roundTrip('修改住宅・玄關的鞋櫃','物件名稱',()=>page.locator(':focus').fill('玄關鞋櫃'),'修改住宅・玄關的玄關鞋櫃');
  await roundTrip('修改道路 1','道路 1 起點',()=>page.getByLabel('道路 1 步行分鐘',{exact:true}).fill('9'));
  await page.getByText('人物關係（1）',{exact:true}).click();
  await roundTrip('修改關係 1','關係 1 來源',()=>page.getByLabel('關係描述',{exact:true}).fill('咖啡館老客人'));
  await save();await page.reload();
  assert.equal(new URL(page.url()).searchParams.get('draft'),draftId);
  await page.getByText('起點：街角咖啡館・前台',{exact:true}).waitFor();
  const response = await context.request.get(app.url+'/api/saves');
  assert.equal((await response.json()).saves.length,0);
  await click('確認開局，進入觀察');await page.waitForURL(url=>url.pathname==='/observe'&&url.searchParams.get('save')===draftId);
  const world=(await (await context.request.get(app.url+'/api/world?save='+draftId)).json()).world;
  assert.equal(world.turn,0);assert.equal(world.characters[0].name,'店主');
  assert.equal(world.configuration.locations.find(place=>place.id===world.characters[0].location)?.name,'街角咖啡館');
  assert.equal(world.configuration.regions.find(room=>room.id===world.characters[0].region)?.name,'前台');
  console.log('Review browser passed all four edit destinations, restored focus and scroll, draft re-opened, single world at turn 0:',draftId);
} catch(err){console.error('failed at',page?.url(),await page?.locator('body').innerText());throw err;}
finally{await browser?.close();await app.close();}
