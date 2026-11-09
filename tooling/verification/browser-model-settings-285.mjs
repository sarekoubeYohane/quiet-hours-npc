import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import {createRequire} from 'node:module';
import {startApp} from './real-route-runtime.mjs';
import {launchBrowser} from './browser-runtime.mjs';
const {fixtureDecision}=createRequire(import.meta.url)('../../tests/pursuit-fixture.cjs');
const output=process.env.BROWSER_ARTIFACT_DIR||'/tmp/model-settings-285';await mkdir(output,{recursive:true});
const app=await startApp({modelResponder:request=>{
 const input=JSON.parse(request.messages.at(-1).content);
 if(input.blank)return {appearance:'綠色外套',personality:'安靜',abilities:'修鐘',background:'河畔長大',initialMemories:'記得外公的工作桌',beliefs:'重視承諾',preferences:'沒有特殊設定',directions:'修好老鐘'};
 if(input.contractVersion==='npc-decision.v3')return fixtureDecision(input,{type:'propose',target:'place:home',content:'輕聲哼唱',purpose:'聽自己聲音',durationMinutes:15});
 if(input.contractVersion==='world-adjudication.v1')return {status:'denied',effects:[],check:null};
 throw Error('unexpected controlled model request');
}});
const browser=await launchBrowser(),context=await browser.newContext({viewport:{width:1280,height:1000}});
await context.addCookies([{name:'qh_local_owner',value:'models-account-a',url:app.url}]);const page=await context.newPage();page.setDefaultTimeout(30000);const evidence=[];
async function createWorld(page,name){return page.evaluate(async name=>{
 const post=async(path,data)=>{const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const body=await r.json();if(!r.ok)throw Error(JSON.stringify(body));return body;};
 const fields={name,appearance:'外套',personality:'安靜',abilities:'沒有特殊設定',background:'沒有特殊設定',initialMemories:'初到此地',beliefs:'沒有特殊設定',preferences:'沒有特殊設定',directions:'生活',startLocation:''};
 const person=(await post('/api/character-templates',{id:crypto.randomUUID(),version:0,fields})).template;
 const scene=(await post('/api/scene-templates',{id:crypto.randomUUID(),version:0,name:name+'的家',note:'',rooms:[{id:'front',name:'客廳'}],connections:[],objects:[]})).template;
 return (await post('/api/saves',{id:crypto.randomUUID(),name,city:{places:[{id:'home',templateId:scene.id,version:scene.version,name:name+'的家'}],characters:[{templateId:person.id,version:person.version,placeId:'home',roomId:'front'}]}})).save.id;
 },name);}
try{
 await page.goto(app.url);await page.getByRole('navigation',{name:'共同導覽'}).getByRole('link',{name:'人物',exact:true}).click();await page.waitForURL(app.url+'/character-templates');
 await page.getByRole('button',{name:'新建建角草稿',exact:true}).click();await page.locator('[name="draftConcept"]').fill('安靜的修鐘人');await page.locator('[name="draft-name"]').fill('孟澄');await page.getByText('已保存至帳號',{exact:true}).waitFor();
 await page.getByRole('button',{name:'用 AI 補完空白文字',exact:true}).click();let panel=page.getByRole('dialog',{name:'模型設定面板'});await panel.waitFor();assert.equal(app.modelRequests.length,0);
 await panel.getByRole('button',{name:'返回原流程',exact:true}).click();assert.equal(await page.locator('[name="draftConcept"]').inputValue(),'安靜的修鐘人');assert.equal(await page.locator('[name="draft-name"]').inputValue(),'孟澄');
 await page.getByRole('button',{name:'用 AI 補完空白文字',exact:true}).click();panel=page.getByRole('dialog',{name:'模型設定面板'});await panel.getByLabel('天上意志模型',{exact:true}).fill('heaven-account-A');
 let fail=true;await page.route('**/api/model-settings',async route=>{if(route.request().method()==='POST'&&fail){fail=false;await route.fulfill({status:503,contentType:'application/json',body:'{"error":"未同步：受控保存故障，原輸入保留"}'});}else await route.continue();});
 await panel.getByRole('button',{name:'保存模型設定',exact:true}).click();await panel.getByRole('alert').waitFor();assert.equal(await panel.getByLabel('天上意志模型',{exact:true}).inputValue(),'heaven-account-A');assert.equal(app.modelRequests.length,0);
 await panel.getByRole('button',{name:'恢復保存模型設定',exact:true}).click();await panel.getByText(/模型設定已保存/).waitFor();
 await panel.getByLabel('服務 API Key',{exact:true}).fill('controlled-model-key');await panel.getByRole('button',{name:'保存服務 Key',exact:true}).click();await panel.getByText('此服務已有有效 Key',{exact:true}).waitFor();
 await panel.getByRole('button',{name:'返回原流程',exact:true}).click();assert.equal(app.modelRequests.length,0);assert.equal(await page.locator('[name="draft-name"]').inputValue(),'孟澄');
 await page.screenshot({path:output+'/returned-draft.png',fullPage:true});
 await page.getByRole('button',{name:'用 AI 補完空白文字',exact:true}).click();await page.getByText('已補完空白並保存至帳號',{exact:true}).waitFor();assert.equal(app.modelRequests.length,1);assert.equal(app.modelRequests[0].model,'heaven-account-A');
 assert.deepEqual(await page.evaluate(async()=> (await (await fetch('/api/saves')).json()).saves),[]);
 evidence.push({phase:'missing models / cancel / failed save / saved key / explicit generation',url:page.url(),modelCalls:app.modelRequests.length});
 const id=await createWorld(page,'設定來源世界');await page.goto(app.url);await page.getByRole('link',{name:'繼續 設定來源世界',exact:true}).click();await page.waitForURL(app.url+'/observe?save='+id);
 await page.getByRole('region',{name:'目前模型來源'}).getByText(/帳號預設/).waitFor();await page.locator('#intervention').fill('保留在原世界的輸入');
 await page.getByRole('button',{name:'設定帳號／存檔模型',exact:true}).click();panel=page.getByRole('dialog',{name:'模型設定面板'});await panel.getByLabel('沿用帳號預設',{exact:true}).uncheck();await panel.getByLabel('天上意志模型',{exact:true}).fill('heaven-save-custom');await panel.getByRole('button',{name:'保存模型設定',exact:true}).click();await page.getByRole('region',{name:'目前模型來源'}).getByText(/存檔自訂/).waitFor();
 await panel.getByLabel('設定範圍',{exact:true}).selectOption('account');await panel.getByLabel('天上意志模型',{exact:true}).fill('heaven-account-B');await panel.getByRole('button',{name:'保存模型設定',exact:true}).click();await panel.getByText(/模型設定已保存/).waitFor();
 await panel.getByRole('button',{name:'返回原流程',exact:true}).click();await page.getByRole('region',{name:'目前模型來源'}).getByText(/存檔自訂.*heaven-save-custom/).waitFor();assert.equal(await page.locator('#intervention').inputValue(),'保留在原世界的輸入');
 const configured=await page.evaluate(async id=>{const r=await fetch('/api/model-settings?save='+id);return r.json();},id);assert.equal(configured.source,'save');assert.equal(configured.effective.adjudication.model,'heaven-save-custom');
 const world=await page.evaluate(async id=>(await (await fetch('/api/world?save='+id)).json()).world,id);assert.equal(world.turn,0);assert.ok(!JSON.stringify(world).includes('controlled-model-key'));assert.equal(app.modelRequests.length,1);
 await page.screenshot({path:output+'/custom-source.png',fullPage:true});
 evidence.push({phase:'account inheritance / custom save / default changes do not override custom / original input',save:id,url:page.url(),turn:world.turn,modelCalls:app.modelRequests.length});
 // Regression proof on the unmodified product: another browser clears a key
 // after this observation page has already read a ready model configuration.
 await page.getByRole('button',{name:'使用 AI 模式',exact:true}).click();
 const otherDevice=await browser.newContext();await otherDevice.addCookies([{name:'qh_local_owner',value:'models-account-a',url:app.url}]);const keyPage=await otherDevice.newPage();await keyPage.goto(app.url+'/settings');
 const clear=await keyPage.evaluate(async()=>{const response=await fetch('/api/world?workspace=account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'clear-model-key',mode:'openai'})});return {status:response.status,body:await response.json()};});assert.equal(clear.status,200);
 const failedAdvance=page.waitForResponse(response=>response.request().method()==='POST'&&response.url()===app.url+'/api/world?save='+id);
 await page.getByRole('button',{name:'下一回合',exact:true}).click();const denied=await failedAdvance;assert.equal(denied.status(),400);assert.equal((await denied.json()).modelSettingsRequired,true);
 const keyPanel=page.getByRole('dialog',{name:'模型設定面板'});await keyPanel.waitFor();await keyPanel.getByText('此服務尚無有效 Key',{exact:true}).waitFor();assert.equal(await page.locator('#intervention').inputValue(),'保留在原世界的輸入');assert.equal(page.url(),app.url+'/observe?save='+id);assert.equal(app.modelRequests.length,1);
 const afterKeyClear=await page.evaluate(async id=>(await (await fetch('/api/world?save='+id)).json()).world,id);assert.equal(afterKeyClear.turn,0);
 await page.screenshot({path:output+'/key-cleared-return.png',fullPage:true});
 await keyPanel.getByRole('button',{name:'返回原流程',exact:true}).click();await page.getByRole('button',{name:'使用 AI 模式',exact:true}).click();await page.getByRole('dialog',{name:'模型設定面板'}).waitFor();assert.equal(app.modelRequests.length,1);await page.getByRole('dialog',{name:'模型設定面板'}).getByRole('button',{name:'返回原流程',exact:true}).click();
 evidence.push({phase:'another device clears key / original AI attempt opens local settings / input and save retained / no dispatch or automatic retry',save:id,url:page.url(),status:denied.status(),modelSettingsRequired:true,turn:afterKeyClear.turn,modelCalls:app.modelRequests.length});await otherDevice.close();
 const other=await browser.newContext();await other.addCookies([{name:'qh_local_owner',value:'models-account-b',url:app.url}]);const independent=await other.newPage();independent.setDefaultTimeout(30000);await independent.goto(app.url);const missingId=await createWorld(independent,'沒有模型的世界');await independent.goto(app.url);await independent.getByRole('link',{name:'繼續 沒有模型的世界',exact:true}).click();await independent.waitForURL(app.url+'/observe?save='+missingId);
 await independent.locator('#intervention').fill('切換模式仍保留');await independent.getByRole('button',{name:'使用 AI 模式',exact:true}).click();const missingPanel=independent.getByRole('dialog',{name:'模型設定面板'});await missingPanel.waitFor();await missingPanel.getByRole('button',{name:'返回原流程',exact:true}).click();assert.equal(await independent.locator('#intervention').inputValue(),'切換模式仍保留');
 await independent.getByRole('button',{name:'使用規則模式',exact:true}).click();await independent.getByRole('button',{name:'下一回合',exact:true}).click();await independent.getByText('回合已儲存',{exact:true}).waitFor();
 const rules=await independent.evaluate(async id=>(await (await fetch('/api/world?save='+id)).json()).world,missingId);assert.equal(rules.turn,1);assert.equal(app.modelRequests.length,1);
 evidence.push({phase:'observation missing models / cancel retains input / rules work without keys',save:missingId,turn:rules.turn,modelCalls:app.modelRequests.length});await other.close();
 await writeFile(output+'/evidence.json',JSON.stringify({origin:app.url,commit:app.commit,builtAt:app.builtAt,auth:'local cookie identity boundary; not production OAuth',database:'isolated disk SQLite with migrations; worlds created through product APIs',modelCalls:app.modelRequests.length,paidCalls:0,evidence},null,2));console.log(JSON.stringify({ok:true,output,evidence}));
}catch(error){await page.screenshot({path:output+'/failure.png',fullPage:true});await writeFile(output+'/failure.txt',String(error)+'\n'+await page.locator('body').innerText());throw error;}finally{await context.close();await browser.close();await app.close();}
