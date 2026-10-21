import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,requests,modelRequests,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';

process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/operation-evidence');
await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const proposal={type:'propose',target:'acceptance-tea-kit',content:'我想用這套共用茶具取熱水和茶包，替自己泡一杯普通的茶。',purpose:'飲用',mood:'平靜',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null},intents:[]};
const timings=[['tea',5],['coffee',6],['food',10],['drink',8],['wash',3],['return',1]].map(([operation,minutes])=>({operation,minutes}));
const approved={completionMinutes:null,stages:[],status:'accepted',effects:[],check:null,routine:{family:'cafe-service',version:1,operation:'tea',subject:'茶',timings}};
const completion=value=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
let browser;
try {
  for(const scenario of ['existing','unrecorded','contradictory','transport-failure']) {
    browser=await launchBrowser();
    const world=await load('acceptance-scene').enterAcceptanceScene(load('world').seedWorld());
    world.characters=world.characters.filter(c=>c.id==='owner');
    world.adjudication={provider:'openai',model:'fixture-adjudicator'};
    if(scenario==='unrecorded')world.objects=world.objects.filter(o=>o.id!=='acceptance-cup');
    const originalObjects=structuredClone(world.objects);
    store.install(world);
    let npc=0,adjudication=0;
    setModelResponder(request=>{
      const input=JSON.parse(request.messages[1].content);
      assert.ok(!JSON.stringify(input).includes('operationEvidence'),'observer evidence must never reach NPC or adjudication');
      if(input.contractVersion==='world-adjudication.v1') {
        adjudication++;
        if(scenario==='transport-failure')return Response.json({error:{message:'fixture unavailable'}},{status:503});
        return completion({...approved,completionMinutes:scenario==='contradictory'?5:null});
      }
      npc++;return completion(proposal);
    });
    const context=await browser.newContext({reducedMotion:'reduce',viewport:{width:1280,height:1000}});
    const page=await context.newPage();const errors=[];
    page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(15000);
    await page.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));
    const read=async id=>{
      const r=await page.request.get(url+'/api/world'+(id?'?operationId='+encodeURIComponent(id):''));
      assert.equal(r.status(),200);return r.json();
    };
    const nav=name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
    try {
      await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'fixture-key'}});
      await page.goto(url);await nav('設定');
      await page.getByRole('combobox',{name:'決策方式',exact:true}).click();
      await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await nav('觀察');
      const pending=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation==='advance');
      await page.getByRole('button',{name:'下一回合',exact:true}).click();const response=await pending;
      const failed=['contradictory','transport-failure'].includes(scenario);
      assert.equal(response.status(),failed?502:200,await response.text());
      await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');
      const original=requests.filter(r=>r.operation==='advance').at(-1);
      const saved=await read(original.operationId),evidence=saved.operation.evidence;
      assert.ok(evidence);assert.equal(evidence.operationId,original.operationId);
      assert.equal(evidence.requestId,response.headers()['x-world-request-id']);
      assert.equal(evidence.deployment.name,'local');
      assert.deepEqual(evidence.counts,{npc:1,adjudication:1});
      const decision=evidence.dispatches.find(d=>d.task==='npc');
      assert.equal(decision.candidate.value.content,proposal.content);
      assert.equal(decision.candidate.value.target,'acceptance-tea-kit');
      assert.equal(decision.candidate.value.durationMinutes,15);
      assert.deepEqual(decision.candidate.value.timeIntent,proposal.timeIntent);
      const ruling=evidence.dispatches.find(d=>d.task==='adjudication');
      if(scenario!=='transport-failure') {
        assert.deepEqual(ruling.candidate.value.routine.timings,timings);
        assert.equal(ruling.candidate.value.completionMinutes,scenario==='contradictory'?5:null);
        assert.deepEqual(ruling.candidate.value.effects,[]);
        assert.deepEqual(ruling.candidate.value.stages,[]);
        assert.equal(ruling.candidate.value.check,null);
      } else assert.equal(ruling.usage,null);
      assert.ok(!JSON.stringify(evidence).includes('fixture-key'));
      assert.ok(!('text' in evidence.replay));assert.ok(!('target' in evidence.replay));
      if(failed) {
        assert.equal(saved.world.turn,0);assert.deepEqual(saved.world.objects,originalObjects);
      } else {
        assert.equal(saved.world.turn,1);assert.equal(saved.world.minute,735);
        assert.equal(saved.world.characters[0].plan,undefined);
        assert.ok(saved.world.routineRules[0].templates.every(t=>t.result.minutes===15));
        const cups=saved.world.objects.filter(o=>o.state.contents==='tea');assert.equal(cups.length,1);
        if(scenario==='existing')assert.equal(cups[0].id,'acceptance-cup');
        else assert.notEqual(cups[0].id,'acceptance-cup');
        assert.equal(saved.world.objects.filter(o=>o.state.beverage==='tea'&&o.state.vessel===cups[0].id).length,1);
      }
      await page.reload();await nav('分析');
      const panel=page.getByRole('region',{name:'操作驗收證據',exact:true});
      await panel.waitFor();
      await panel.getByText('查看操作驗收證據',{exact:true}).click();
      assert.ok((await panel.innerText()).includes(original.operationId));
      const reloaded=await read(original.operationId);
      assert.deepEqual(reloaded.operation.evidence,evidence);
      assert.deepEqual(reloaded.world.objects,saved.world.objects);
      const replayResponse=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operationId===original.operationId);
      await panel.getByRole('button',{name:'重送同一操作（不新增回合）',exact:true}).click();
      const replay=await replayResponse;assert.equal(replay.status(),response.status());
      assert.notEqual(replay.headers()['x-world-request-id'],evidence.requestId);
      const after=await read(original.operationId);
      assert.deepEqual(after.operation.evidence,evidence);
      assert.equal(after.version,saved.version);
      assert.deepEqual(after.world.objects,saved.world.objects);
      assert.deepEqual(after.world.routineRules,saved.world.routineRules);
      assert.deepEqual(after.world.events,saved.world.events);
      assert.equal(after.world.aiUsage.totalCalls,saved.world.aiUsage.totalCalls);
      assert.equal(after.world.aiUsage.totalInputTokens,saved.world.aiUsage.totalInputTokens);
      assert.equal(npc,1);assert.equal(adjudication,1);assert.deepEqual(errors,[]);
      await panel.scrollIntoViewIfNeeded();
      await page.screenshot({path:outputPath(`${scenario}.png`),fullPage:false});
      await writeFile(outputPath(`${scenario}.json`),JSON.stringify({fixture:true,scenario,evidence,checks:{reload:true,sameOperationReplay:true,unchangedWorld:true,noAdditionalDispatch:true}},null,2)+'\n');
      console.log(`PASS operation evidence Chromium ${scenario}: original tea-kit proposal, ${scenario==='transport-failure'?'unavailable ruling/usage explicit':'raw timings retained'}, reload, UI same-ID replay, 1 NPC + 1 adjudication; fixture only.`);
    } finally { await context.close();await browser.close();browser=undefined; }
  }
  console.log(`Captured ${modelRequests.length} fixture transport requests; no real model requests.`);
} finally { await browser?.close();server.close(); }
