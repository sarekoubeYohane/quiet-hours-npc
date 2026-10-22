import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url, server, store, load, requests, setModelResponder} from './browser-fixture.mjs';
import {launchBrowser, outputPath} from './browser-runtime.mjs';
import {approval} from './routine-program-fixture.mjs';

// Only external model replies, time and database fault injection are fixtures.
// Scene entry, decisions, effects, persistence and the rendered UI use the app.
process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/live-gaps');
await mkdir(process.env.BROWSER_ARTIFACT_DIR, {recursive:true});
const original=load('world').seedWorld();
original.adjudication={provider:'openai',model:'fixture-world'};
original.playerBudget={calls:120,tokens:1000000};
store.install(original);
const rest={type:'rest',target:'',content:'安靜休息一會兒',purpose:'休息',mood:'平靜',durationMinutes:15,timeIntent:{kind:'open-ended',maxMinutes:null},intents:[]};
const propose=(target,content,purpose='日常生活')=>({...rest,type:'propose',target,content,purpose,timeIntent:{kind:'completion',maxMinutes:null}});
const accepted=effects=>({status:'accepted',completionMinutes:15,effects,stages:[],branches:null,check:null,routine:null});
const completion=value=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
const firstTea=propose('acceptance-tea-kit','我想用這套共用茶具取熱水和茶包，替自己泡一杯普通的茶。','飲用');
let actor='owner',decision=firstTea,candidate=approval(),npc=0,adjudication=0;
setModelResponder(request=>{
  const input=JSON.parse(request.messages[1].content);
  assert.doesNotMatch(JSON.stringify(input),/operationEvidence|fixture-key/);
  if(input.contractVersion==='world-adjudication.v1'){
    assert.equal(input.actor.id,actor);adjudication++;return completion(candidate);
  }
  npc++;return completion(input.self.id===actor?decision:rest);
});
const snapshots=[];
let browser;
try {
  browser=await launchBrowser();
  const page=await browser.newPage({reducedMotion:'reduce',viewport:{width:1440,height:1000}});
  page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));
  const nav=name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
  const read=async id=>{
    const response=await page.request.get(url+'/api/world'+(id?'?operationId='+encodeURIComponent(id):''));
    assert.equal(response.status(),200);return response.json();
  };
  const cup=world=>world.objects.find(object=>object.id==='acceptance-cup');
  const selectAI=async()=>{
    await nav('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();
    await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await nav('觀察');
  };
  const act=async(button,operation,expected=200)=>{
    const clock=await(await page.request.post(url+'/__fixture',{data:{advanceMs:1000}})).json();
    await page.evaluate(now=>{Date.now=()=>now;},clock.now);
    const pending=page.waitForResponse(response=>response.url().endsWith('/api/world')&&response.request().method()==='POST'&&JSON.parse(response.request().postData()).operation===operation);
    await button.click();const response=await pending;
    assert.equal(response.status(),expected,(await response.json()).error);
    await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');
    return {response,saved:await read()};
  };
  const advance=async(name,expected=200)=>{
    const {response}=await act(page.getByRole('button',{name:'下一回合',exact:true}),'advance',expected);
    const request=requests.filter(value=>value.operation==='advance').at(-1);
    const saved=await read(request.operationId);
    snapshots.push({name,status:response.status(),evidence:saved.operation.evidence,objects:saved.world.objects});
    return saved;
  };
  const replayAndReload=async saved=>{
    const id=saved.operation.operationId??saved.operation.evidence.operationId;
    const before={version:saved.version,objects:saved.world.objects,rules:saved.world.routineRules,events:saved.world.events,usage:saved.world.aiUsage,evidence:saved.operation.evidence};
    const counts={npc,adjudication};
    await page.reload();await nav('分析');
    const panel=page.getByRole('region',{name:'操作驗收證據',exact:true});
    await panel.getByText('查看操作驗收證據',{exact:true}).click();
    assert.match(await panel.innerText(),new RegExp(id));
    assert.deepEqual(JSON.parse(await panel.locator('pre').innerText()),saved.operation.evidence);
    const pending=page.waitForResponse(response=>response.url().endsWith('/api/world')&&response.request().method()==='POST'&&JSON.parse(response.request().postData()).operationId===id);
    await panel.getByRole('button',{name:'重送同一操作（不新增回合）',exact:true}).click();
    assert.equal((await pending).status(),saved.operation.status);
    const after=await read(id);
    assert.deepEqual({version:after.version,objects:after.world.objects,rules:after.world.routineRules,events:after.world.events,usage:after.world.aiUsage,evidence:after.operation.evidence},before);
    assert.deepEqual({npc,adjudication},counts);
    await selectAI();return after;
  };
  await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'fixture-key'}});
  await page.goto(url);await nav('設定');
  await page.getByRole('button',{name:'進入最小驗收場景',exact:true}).click();
  await act(page.getByRole('button',{name:'確認進入驗收',exact:true}),'enter-acceptance');
  assert.equal(npc+adjudication,0);await selectAI();

  // First approval is a model transport fixture with the original long proposal.
  let saved=await advance('first-approval-water');
  assert.equal(cup(saved.world).state.contents,'water');
  const plan=structuredClone(saved.world.characters.find(person=>person.id==='owner').plan);
  assert.equal(plan.phases.cursor,1);
  const firstEvidence=saved.operation.evidence;
  saved=await replayAndReload(saved);
  assert.deepEqual(saved.world.characters.find(person=>person.id==='owner').plan,plan);
  saved=await advance('first-tea-completed');
  assert.equal(cup(saved.world).state.contents,'tea');
  assert.equal(saved.world.characters.find(person=>person.id==='owner').plan,undefined);
  const firstDrink=saved.world.objects.find(object=>object.state.vessel==='acceptance-cup'&&object.lifecycle==='active');
  assert.ok(firstDrink);
  const approvedCalls=adjudication;
  decision=propose('acceptance-cup','喝茶','飲用');
  saved=await advance('drink');
  assert.equal(cup(saved.world).state.contents,'dirty');
  assert.equal(saved.world.objects.find(object=>object.id===firstDrink.id).lifecycle,'consumed');
  decision=propose('acceptance-cup','清洗杯子','清洗');saved=await advance('wash');
  assert.equal(cup(saved.world).state.contents,'empty');assert.equal(cup(saved.world).state.clean,'yes');
  decision=propose('acceptance-cup','泡一杯茶','飲用');saved=await advance('same-cup-water');
  assert.equal(cup(saved.world).state.contents,'water');
  saved=await advance('same-cup-tea');assert.equal(cup(saved.world).state.contents,'tea');
  assert.equal(adjudication,approvedCalls);
  assert.equal(saved.world.objects.filter(object=>object.state.vessel==='acceptance-cup'&&object.lifecycle==='active').length,1);
  assert.equal(saved.world.objects.filter(object=>object.id==='acceptance-cup').length,1);
  saved=await replayAndReload(saved);
  const ruling=firstEvidence.dispatches.find(dispatch=>dispatch.task==='adjudication');
  assert.deepEqual(ruling.candidate.value.routine.programs,approval().routine.programs,'new evidence must retain raw v2 programs');
  assert.equal(ruling.candidate.value.branches,null);
  assert.equal(ruling.candidate.truncated,false);
  await nav('分析');
  const rulePanel=page.getByRole('region',{name:'日常規則與成果'});
  assert.match(await rulePanel.innerText(),/驗收杯子 · 可用 · 茶/);
  await rulePanel.scrollIntoViewIfNeeded();await page.screenshot({path:outputPath('same-cup-reused.png')});
  await nav('觀察');
  console.log('PASS UI first v2 approval, cross-turn completion, drink/wash/same-cup reuse, original-ID UI replay and bounded raw program evidence.');

  // The model fixture chooses to grant; no observer intervention or positive
  // dialogue is interpreted as an authoritative grant.
  decision=propose('acceptance-cup','喝茶','飲用');saved=await advance('second-drink');
  const dirtyRevision=cup(saved.world).revision;
  decision=propose('acceptance-cup','我願意借杯子給 Vera，並先放回桌上。');
  candidate=accepted([{kind:'transfer',objectId:'acceptance-cup',expectedRevision:dirtyRevision,toHolder:null,toRegion:'cafe-front'},{kind:'grant',targetId:'acceptance-cup',recipient:'vera'}]);
  saved=await advance('owner-autonomous-grant');
  assert.ok(cup(saved.world).allowedTo.includes('vera'));assert.equal(cup(saved.world).holder,null);
  actor='vera';decision=propose('acceptance-cup','借用已獲准的杯子');
  candidate=accepted([{kind:'transfer',objectId:'acceptance-cup',expectedRevision:cup(saved.world).revision,toHolder:'vera',toRegion:'cafe-front'}]);
  saved=await advance('borrow');assert.equal(cup(saved.world).holder,'vera');assert.equal(cup(saved.world).owner,'owner');
  decision={...rest,type:'move',target:'kris-home'};saved=await advance('carry');
  assert.equal(cup(saved.world).region,saved.world.characters.find(person=>person.id==='vera').region);
  assert.notEqual(cup(saved.world).region,'cafe-front');
  decision=propose('acceptance-cup','洗淨借來的杯子');
  candidate=accepted([{kind:'state',objectId:'acceptance-cup',expectedRevision:cup(saved.world).revision,key:'contents',value:'empty'}]);
  saved=await advance('borrower-wash');assert.equal(cup(saved.world).state.contents,'empty');assert.equal(cup(saved.world).state.clean,'yes');
  decision={...rest,type:'move',target:'cafe'};saved=await advance('carry-back');
  decision=propose('acceptance-cup','歸還借來的杯子');
  candidate=accepted([{kind:'transfer',objectId:'acceptance-cup',expectedRevision:cup(saved.world).revision,toHolder:null,toRegion:'cafe-front'}]);
  saved=await advance('return');assert.equal(cup(saved.world).holder,null);assert.equal(cup(saved.world).owner,'owner');
  saved=await replayAndReload(saved);
  await page.getByText('供應、物件與活動階段',{exact:true}).click();
  const status=page.getByRole('region',{name:'驗收場景狀態',exact:true});
  assert.match(await status.getByRole('article',{name:'驗收杯子物件',exact:true}).innerText(),/空杯/);
  await status.scrollIntoViewIfNeeded();await page.screenshot({path:outputPath('borrowed-washed-returned.png')});
  console.log('PASS UI autonomous fixture grant, borrow/carry/wash/return preserves cup identity and ownership.');

  actor='cass';decision=propose('acceptance-meal','取用餐點並吃掉');
  candidate=accepted([{kind:'materialize',supplyId:'acceptance-meal',expectedRemaining:1},{kind:'consume',objectId:'acceptance-meal:1',expectedRevision:1}]);
  saved=await advance('meal-consumed');assert.equal(saved.world.supplies.find(supply=>supply.id==='acceptance-meal').remaining,0);
  assert.equal(saved.world.objects.find(object=>object.id==='acceptance-meal:1').lifecycle,'consumed');
  saved=await replayAndReload(saved);
  console.log('PASS UI meal acquired/consumed and persisted/replayed without resurrection.');

  // Faults occur at SQLite commit boundaries; the application still decides
  // not-committed/committed and uses the same operation journal for replay.
  actor='owner';decision=propose('acceptance-cup','泡一杯茶','飲用');
  const beforeFailure=structuredClone(saved.world.objects),beforeTurn=saved.world.turn;
  store.throwBeforeNextSave();saved=await advance('save-before-failure',502);
  assert.equal(saved.world.turn,beforeTurn);assert.deepEqual(saved.world.objects,beforeFailure);
  assert.equal(saved.operation.evidence.outcome,'not-committed');
  assert.equal(saved.operation.evidence.result,undefined);
  saved=await replayAndReload(saved);
  store.throwAfterNextSave();saved=await advance('save-after-confirmed');
  assert.equal(saved.world.turn,beforeTurn+1);assert.equal(cup(saved.world).state.contents,'water');
  assert.equal(saved.operation.evidence.outcome,'committed');
  saved=await replayAndReload(saved);
  assert.equal(adjudication,6,'known routine reuse and save replay must not add rulings');
  assert.deepEqual(errors,[]);
  const artifact={fixture:true,realPaidModelCalls:0,counts:{npc,adjudication},checks:{realSceneEntry:true,rawPrograms:true,rawBranches:true,sameCupReuse:true,autonomousGrantFixture:true,borrowCarryWashReturn:true,mealConsumed:true,reload:true,sameOperationReplay:true,saveBeforeFailure:true,saveAfterConfirmed:true,noPageErrors:true},snapshots};
  const encoded=JSON.stringify(artifact,null,2)+'\n';
  assert.doesNotMatch(encoded,/fixture-key|operationScope|originalWorld|acceptanceBackup/);
  await writeFile(outputPath('browser-evidence.json'),encoded);
  console.log(`PASS UI save-before rollback/save-after confirmation and exact replay; ${npc} NPC + ${adjudication} adjudication fixture dispatches, zero paid models.`);
} finally {await browser?.close();server.close();}
