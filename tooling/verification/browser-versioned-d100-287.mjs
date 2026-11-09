import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {startApp} from './real-route-runtime.mjs';
import {launchBrowser} from './browser-runtime.mjs';
import {journey,advanceCraft} from './versioned-d100-journey.mjs';
const {fixtureDecision}=createRequire(import.meta.url)('../../tests/pursuit-fixture.cjs');
const output=process.env.BROWSER_ARTIFACT_DIR||'/tmp/versioned-d100-287';await mkdir(output,{recursive:true});
const app=await startApp({diceFaces:Array(20).fill(4),checkRolls:[61],modelResponder:request=>{const input=JSON.parse(request.messages.at(-1).content);return input.task?{bonuses:[]}:fixtureDecision(input,{type:'work',target:'craft-challenge',content:'星月'});}});
const browser=await launchBrowser(),context=await browser.newContext({viewport:{width:1400,height:1000}});await context.addCookies([{name:'qh_local_owner',value:'d100-a',url:app.url}]);const page=await context.newPage();page.setDefaultTimeout(30000);
try{
 await page.goto(app.url);await page.getByRole('navigation',{name:'共同導覽'}).getByRole('link',{name:'人物',exact:true}).click();await page.waitForURL(app.url+'/character-templates');
 const j=await journey(app),save=await j.create({name:'版本檢定旅程'});await advanceCraft(j,save);assert.equal(app.modelRequests.length,2);
 await page.getByRole('navigation',{name:'共同導覽'}).getByRole('link',{name:'存檔',exact:true}).click();await page.getByRole('link',{name:'繼續 版本檢定旅程',exact:true}).click();await page.waitForURL(app.url+'/observe?save='+save);
 await page.locator('.full-record > summary').click();await page.locator('.full-record').getByText(/d100 61 ／ 成功門檻 60 · 部分成功 · 規則 d100-v2/).waitFor();await page.getByText(/能力版本 2/).first().waitFor();await page.screenshot({path:output+'/observe-result.png',fullPage:true});
 await page.reload();await page.locator('.full-record > summary').click();await page.locator('.full-record').getByText(/d100 61 ／ 成功門檻 60 · 部分成功 · 規則 d100-v2/).waitFor();assert.equal(app.modelRequests.length,2);
 await page.getByRole('navigation',{name:'共同導覽'}).getByRole('link',{name:'分析',exact:true}).click();await page.waitForURL(app.url+'/observe?save='+save+'&view=analysis');await page.locator('.analysis-events').getByText(/d100 61 ／ 成功門檻 60 · 部分成功 · 規則 d100-v2/).waitFor();await page.screenshot({path:output+'/analysis-result.png',fullPage:true});
 const world=(await j.world(save)).world,resolution=world.events.findLast(event=>event.resolution).resolution;
 assert.equal(resolution.roll,61);assert.equal(resolution.system,'d100-v2');assert.equal(resolution.attributeVersion,2);assert.equal(resolution.outcome,'mixed');assert.equal(world.characters[0].attributes.values.dexterity,12);
 await writeFile(output+'/evidence.json',JSON.stringify({origin:app.url,commit:app.commit,builtAt:app.builtAt,auth:'local cookie identity boundary',database:'isolated disk SQLite, full migrations; card formed and saved via product APIs, city save via product API; no installed world fixture',saveId:save,route:page.url(),resolution,modelCalls:app.modelRequests.length,paidCalls:0,dice:'20 controlled d6 faces of 4 for the card; one d100 face 61, exhaustion rejects extra rolls'},null,2));console.log(JSON.stringify({ok:true,output,resolution,modelCalls:app.modelRequests.length}));
}catch(error){await page.screenshot({path:output+'/failure.png',fullPage:true});await writeFile(output+'/failure.txt',String(error)+'\n'+await page.locator('body').innerText());throw error;}finally{await context.close();await browser.close();await app.close();}
