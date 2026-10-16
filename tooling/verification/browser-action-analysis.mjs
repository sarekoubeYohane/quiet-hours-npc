import assert from 'node:assert/strict';
import {url,server,store,load} from './browser-fixture.mjs';
import {launchBrowser} from './browser-runtime.mjs';

// All decisions use the real world API. Only dice and the initial test world are fixtures.
const initial=load('world').seedWorld();
for(const character of initial.characters){character.location='cafe';character.region='cafe-front';}
initial.characters.find(c=>c.id==='owner').abilityTags=['精通髮飾設計'];
store.install(initial);
let browser;
try {
 browser=await launchBrowser();const page=await browser.newPage({reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',error=>errors.push(String(error)));
 const send=async body=>{
  const response=await page.request.post(url+'/api/world',{data:{operationId:`${Date.now()}:${crypto.randomUUID()}`,mode:'demo',minutes:15,...body}});
  assert.equal(response.status(),200);return response.json();
 };
 await send({operation:'direct',target:'owner',action:{type:'work',target:'craft-expert-challenge',content:'分析頁驗證髮飾'}});
 const random=Math.random;Math.random=()=>0.475;
 try {await send({operation:'advance'});} finally {Math.random=random;}
 const response=await page.request.get(url+'/api/world');const {world}=await response.json();
 const attempt=world.events.findLast(event=>event.actor==='owner'&&event.kind==='attempt');
 assert.deepEqual({roll:attempt.resolution.roll,modifier:attempt.resolution.modifier,dc:attempt.resolution.dc,total:attempt.resolution.total,outcome:attempt.resolution.outcome},{roll:10,modifier:4,dc:16,total:-2,outcome:'mixed'});
 assert.ok(attempt.perception?.length,'the same actual world attempt includes perception evidence');
 await page.goto(url);await page.getByRole('button',{name:'下一回合',exact:true}).waitFor();
 await page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name:'分析',exact:true}).click();
 const action=page.locator('section').filter({has:page.getByRole('heading',{name:'行動與感知詳情',exact:true})}).locator('article').filter({hasText:attempt.text});
 await action.waitFor();
 assert.match(await action.innerText(),/D20 10 \+4 − DC 16 = -2 · 部分成功/,'analysis must show the persisted action judgement numbers and outcome');
 await action.getByText('感知詳情（觀察者）',{exact:true}).click();
 assert.match(await action.innerText(),/視覺線索|聽覺線索/);
 await page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name:'觀察',exact:true}).click();
 await page.getByText('完整生活紀錄',{exact:true}).click();
 const record=page.getByRole('heading',{name:'生活紀錄',exact:true}).locator('..').locator('..').locator('article').filter({hasText:attempt.text});
 assert.match(await record.innerText(),/D20 10 \+4 − DC 16 = -2 · 部分成功/,'observation history preserves the same judgement');
 assert.deepEqual(errors,[]);console.log('PASS #89 real API craft judgement + perception shown in analysis and observation history');
} finally {await browser?.close();server.close();}
