import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startApp} from './real-route-runtime.mjs';
import {launchBrowser} from './browser-runtime.mjs';

const output=process.env.BROWSER_ARTIFACT_DIR || join(tmpdir(),'three-step-opening-358');
await mkdir(output,{recursive:true});
const tasks=[];
const supplyNames={
 客廳:['沙發','茶几','靠墊','書架','掛鐘'],臥室:['衣櫃','床頭桌','床單','枕頭','檯燈'],玄關:[],
 前台:['客用桌椅','咖啡機','點餐鈴','菜單','收銀機','咖啡杯','磨豆機'],儲藏室:['貨架','密封罐','抹布','料箱','標籤紙'],
 室內:['餐桌','椅子','水壺','衣架','收納箱'],
};
function fixture(request){
 const input=JSON.parse(request.messages.at(-1).content);
 tasks.push(input.task);
 if(input.task==='opening-road-repair-v1'){
  const place=name=>input.places.find(p=>p.name===name).id;
  return {walks:[
   {places:[place('住宅'),place('Kris 的住處')],minutes:100},
   {places:[place('住宅'),place('街角咖啡館')],minutes:9},
  ]};
 }
 assert.equal(input.task,'opening-arrangement-v1');
 assert.equal(input.description,'');
 assert.equal(input.supplyRooms,true);
 assert.equal(input.recommendRoads,true);
 const checkedRooms=[];
 const spaces=input.city.places.map(p=>{
  const scene=input.scenes.find(s=>s.id===p.templateId);
  const extras=input.city.finalization?.spaces.find(s=>s.placeId===p.id);
  const rooms=[...scene.rooms,...extras?.rooms??[]];
  const objects=rooms.flatMap(room=>{
   checkedRooms.push({placeId:p.id,roomId:room.id});
   return supplyNames[room.name].map((name,index)=>({id:'new-'+room.id+'-'+index,roomId:room.id,name,state:[],hidden:false}));
  });
  return {placeId:p.id,rooms:[],objects,connections:[]};
 });
 const home=input.city.places.find(p=>p.name==='住宅').id;
 return {checkedRooms,characters:input.city.characters.map(a=>({templateId:a.templateId,placeId:home,roomId:'bedroom',homeId:null,homeRoomId:null,workplaceIds:[],ownedPlaceIds:[]})),backgroundPeople:[],relationships:[],accessGrants:[],finalization:{spaces,walks:[]}};
}
const app=await startApp({modelResponder:fixture});
const browser=await launchBrowser();
const context=await browser.newContext({viewport:{width:1280,height:900}});
const owner='opening-player';
await context.addCookies([{name:'qh_local_owner',value:owner,url:app.url}]);
const page=await context.newPage();
page.setDefaultTimeout(25000);
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const button=name=>page.getByRole('button',{name,exact:true});
const label=name=>page.getByLabel(name,{exact:true});
const saved=()=>page.locator('.opening-status',{hasText:'已保存至帳號'}).waitFor();
const click=name=>button(name).click();
const choose=(name,option)=>label(name).selectOption({label:option});
const screenshot=name=>page.screenshot({path:join(output,name+'.png')});
const checks=[];
async function api(path,body){
 const response=await context.request.fetch(app.url+path,{method:body?'POST':'GET',data:body,headers:{Origin:app.url,'X-World-Time-Policy':'round-v1'}});
 const result=await response.json();assert.ok(response.ok(),JSON.stringify(result));return result;
}
try{
 const accountScope='account-operations:'+owner;
 await api('/api/model-settings',{accountScope,version:0,mode:'custom',models:{npc:{provider:'openai',model:'gpt-6-luna'},adjudication:{provider:'openai',model:'gpt-6.1-sol'}}});
 const account=await api('/api/world?workspace=account');
 await api('/api/world?workspace=account',{operation:'set-model-key',mode:'openai',key:'fixture-only',operationScope:account.operationScope});
 await api('/api/world?workspace=account',{operationId:Date.now()+':'+crypto.randomUUID(),operation:'set-budget',mode:'demo',operationScope:account.operationScope,worldContext:account.world.contextId,limits:{calls:null,tokens:null}});
 await page.goto(app.url);
 await page.getByRole('link',{name:'＋新開存檔',exact:true}).click();
 await page.getByRole('heading',{name:'選人物',exact:true}).waitFor();
 await button('查看 Cass 詳情').focus();await page.keyboard.press('Enter');
 assert.equal(await page.getByRole('meter',{name:'Cass 力量'}).getAttribute('aria-valuemax'),'18');
 await click('查看 Vera 詳情');await page.getByRole('meter',{name:'Vera 力量'}).waitFor();
 await click('身體需求');await click('查看 Cass 詳情');await page.getByRole('meter',{name:'Cass 飢餓'}).waitFor();
 for(const person of ['Cass','Vera','Kris','店主'])await label('加入 '+person).check();
 await page.getByText('已選 4 名人物',{exact:true}).waitFor();await saved();await screenshot('01-選人物');
 const id=new URL(page.url()).searchParams.get('draft');
 const read=()=>api('/api/opening-drafts?id='+id+'&operationScope='+owner);
 const reopen=async()=>{
  await saved();await page.getByRole('navigation',{name:'共同導覽'}).getByRole('link',{name:'存檔',exact:true}).click();
  await page.getByRole('link',{name:'接續 三步開局驗收',exact:true}).click();
  await saved();assert.equal(new URL(page.url()).searchParams.get('draft'),id);
 };
 await click('下一步：場景與安排');await click('場所與道路');
 await page.locator('[name=opening-name]').fill('三步開局驗收');
 for(const place of ['Kris 的住處','住宅','街角咖啡館','Vera 的房間'])await click('加入 '+place);
 await choose('編輯場所','住宅');
 await click('在 住宅 新增房間');await label('房間名稱').fill('玄關');
 for(const name of ['鞋櫃','雨傘架']){
  await click('＋新增物件');
  const field=label('物件名稱').last();assert.equal(await field.evaluate(el=>el===document.activeElement),true);await field.fill(name);
 }
 await click('連接房間');await choose('門的另一端','客廳');await label('門名稱').fill('玄關門');await choose('門狀態','關閉');
 await page.getByRole('navigation',{name:'住宅的房間'}).getByRole('button',{name:/臥室/}).click();
 await page.getByText('可選：跨場所道路',{exact:true}).click();
 await label('明示隔離 Vera 的房間').check();await click('新增道路');
 await choose('道路 1 起點','Kris 的住處');await choose('道路 1 終點','住宅');await label('道路 1 步行分鐘').fill('6');
 await click('人物');await choose('店主起始場所','街角咖啡館');await choose('店主起始房間','前台');
 await choose('Cass起始場所','住宅');
 await click('場所與道路');await click('帶我去填');await label('Cass起始房間').waitFor();
 assert.equal(await label('Cass起始房間').evaluate(el=>el===document.activeElement),true);
 await choose('Cass起始房間','客廳');
 const cass=page.locator('article').filter({has:page.getByRole('heading',{name:'Cass',exact:true})});
 await cass.getByText('選填：調整本次需求與精神電量',{exact:true}).click();
 await label('Cass飢餓').fill('24');await label('Cass目前精神電量').fill('31');
 await click('人物關係');await click('新增背景人物');await label('背景人物名稱').fill('阿岑');
 await click('從阿岑建立關係');await choose('關係 1 來源','店主');await label('關係描述').fill('咖啡館老客人');
 await saved();await reopen();
 await click('人物關係');await page.getByText('店主 → 阿岑：咖啡館老客人',{exact:true}).waitFor();
 await click('人物');assert.equal(await label('店主起始房間').locator('option:checked').innerText(),'前台');
 await click('場所與道路');await choose('編輯場所','住宅');
 const rooms=page.getByRole('navigation',{name:'住宅的房間'});
 await rooms.getByRole('button',{name:/玄關（2 件/}).click();
 assert.deepEqual(await label('物件名稱').evaluateAll(els=>els.map(el=>el.value)),['鞋櫃','雨傘架']);
 await page.getByText('玄關門 · 通往客廳 · 關閉',{exact:true}).waitFor();await screenshot('02-重開玄關');
 await rooms.getByRole('button',{name:/客廳/}).click();await page.getByText('玄關門 · 通往玄關 · 關閉',{exact:true}).waitFor();
 checks.push('同一草稿重開：兩件物品、一扇雙向核對的門、方向關係、手選起點');
 const base=(await read()).draft.body.city;
 assert.equal(await page.locator('[name=opening-description]').inputValue(),'');
 assert.equal(await label('逐房配置物品').isChecked(),true);assert.equal(await label('建議跨場所步行道路').isChecked(),true);
 await click('請AI整理本次開局');
 const items=page.getByRole('region',{name:'逐房物品建議'}),roads=page.getByRole('region',{name:'道路建議'});
 await items.getByText(/玄關.*沿用 2 件.*已齊備，新增 0 件/).waitFor();
 const front=items.locator('details',{has:page.locator('summary',{hasText:'街角咖啡館・前台'})});
 await front.locator('summary').click();
 await button('採納所選物品（32 件）').waitFor();
 assert.deepEqual((await read()).draft.body.city,base);
 const chair=front.getByRole('checkbox',{name:'客用桌椅',exact:true});
 await chair.uncheck();await button('採納所選物品（31 件）').waitFor();assert.match(await front.locator('summary').innerText(),/選取 6 件/);
 await chair.check();await button('採納所選物品（32 件）').waitFor();await chair.uncheck();
 assert.equal(await roads.getByRole('button',{name:'採納道路',exact:true}).isDisabled(),true);
 assert.equal(await button('全部採納').isDisabled(),true);
 await click('採納所選物品（31 件）');await items.getByText(/已採納所選物品/).waitFor();await screenshot('03-道路未通先採納31件');
 await reopen();
 const cityAfterItems=(await read()).draft.body.city;
 const objects=city=>city.finalization.spaces.flatMap(s=>s.objects);
 assert.equal(objects(cityAfterItems).length,33);assert.ok(!objects(cityAfterItems).some(o=>o.name==='客用桌椅'));
 await click('請 AI 補路');
 const end=roads.getByLabel('道路 2 終點',{exact:true});await end.waitFor();
 assert.equal(await roads.getByLabel('道路 1 步行分鐘',{exact:true}).inputValue(),'6');
 assert.deepEqual((await read()).draft.body.city,cityAfterItems);
 await end.selectOption({label:'Kris 的住處'});assert.equal(await button('全部採納').isDisabled(),true);
 await end.selectOption({label:'街角咖啡館'});await roads.getByLabel('道路 2 步行分鐘',{exact:true}).fill('12');
 const persist=button('保存建議修改');if(await persist.isEnabled())await persist.click();
 await click('全部採納');await page.getByText(/這份建議已採納/).waitFor();
 await reopen();
 const final=(await read()).draft.body.city;
 assert.deepEqual(objects(final),objects(cityAfterItems));
 assert.deepEqual(final.finalization.walks.map(w=>w.minutes),[6,12]);
 assert.equal(final.isolatedPlaceIds.length,1);
 const shop=final.characters.find(a=>a.templateId==='card-example-owner');assert.equal(final.places.find(p=>p.id===shop.placeId).name,'街角咖啡館');assert.equal(shop.roomId,'front');
 checks.push('固定回覆檢查七房：32→31→32→31；先採納物品，再補一條缺路、改為 12 分鐘並全部採納，物品與原路只寫一次');
 await click('下一步：核對開局');await page.getByRole('heading',{name:'核對開局',exact:true}).waitFor();
 const storeStart=button('修改店主起點');await storeStart.scrollIntoViewIfNeeded();await storeStart.click();
 await label('店主起始場所').waitFor();await choose('店主起始房間','儲藏室');await click('返回核對');
 const storeCard=page.locator('article').filter({has:storeStart});await storeCard.getByText('起點：街角咖啡館・儲藏室',{exact:true}).waitFor();
 await storeStart.click();await choose('店主起始房間','前台');await click('返回核對');
 await storeCard.getByText('起點：街角咖啡館・前台',{exact:true}).waitFor();
 assert.equal(await storeStart.evaluate(el=>el===document.activeElement),true);
 await screenshot('04-核對開局');assert.equal((await api('/api/saves')).saves.length,0);
 await click('確認開局，進入觀察');await page.waitForURL(url=>url.pathname==='/observe'&&url.searchParams.get('save')===id);
 const world=(await api('/api/world?save='+id)).world;
 assert.equal(world.turn,0);assert.equal(world.characters.length,4);assert.equal(world.objects.filter(o=>o.label==='雨傘架').length,1);
 const cassAtZero=world.characters.find(person=>person.name==='Cass');assert.equal(cassAtZero.needs.values.hunger,24);assert.equal(cassAtZero.mentalEnergy.value,31);
 assert.deepEqual(tasks,['opening-arrangement-v1','opening-road-repair-v1']);
 assert.deepEqual(errors,[]);await screenshot('05-進入觀察第0回合');
 checks.push('確認前沒有正式存檔；確認後觀察頁與世界 API 對應同一存檔，停在第 0 回合');
 const evidence={commit:app.commit,draftId:id,checks,modelTasks:tasks,paidCalls:0,selectedItems:31,manualObjects:2,walkMinutes:[6,12],turn:world.turn};
 await writeFile(join(output,'evidence.json'),JSON.stringify(evidence,null,2));console.log(evidence);
} catch(error){
 await screenshot('failure');await writeFile(join(output,'failure.txt'),String(error)+'\n'+await page.locator('body').innerText());throw error;
} finally {await context.close();await browser.close();await app.close();}
