/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {nonPhoneObjects}=require('./fixtures/non-phone-objects.cjs');
const load=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,name+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const completion=value=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
const proposal={type:'propose',target:'cup',content:'把杯子外側擦乾並檢查殘留痕跡',purpose:'整理物件',mood:'平靜',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null},intents:[]};
const accepted=effects=>({status:'accepted',completionMinutes:15,effects,stages:[],branches:null,check:null,routine:null});
const change=(value='茶漬',revision=1)=>({kind:'change-state',exposure:'public',version:1,access:'authorized',target:{type:'object',id:'cup'},expectedRevision:revision,changes:[{key:'surface',from:null,value}],reason:'布料擦拭後杯子表面留下可辨識的痕跡。'});
async function scenario({reply=accepted([change()]),decision=proposal,die=12,mutate=()=>{}}={}){
 const w=seedWorld();w.characters=w.characters.filter(c=>c.id==='owner');w.contextId='objects-146';w.adjudication={provider:'openai',model:'fixture-world'};
 w.objects=[{id:'cup',source:'original-cup',label:'原杯子',region:'cafe-front',holder:'owner',owner:'owner',revision:1,state:{contents:'empty'},lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner'],stateTransitions:{contents:['empty','water','tea']}}];mutate(w);store.install(w);
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:Date.now()+':'+crypto.randomUUID(),worldContext:w.contextId,mode:'openai',model:'gpt-6-luna',...body})}));await post({operation:'set-model-key',key:'fixture-key'});
 const oldFetch=global.fetch,oldRandom=Math.random;let npc=0,adjudication=0,dice=0;const inputs=[];
 global.fetch=async(_url,init)=>{const request=JSON.parse(init.body),input=JSON.parse(request.messages[1].content);inputs.push({input,request});if(input.contractVersion==='world-adjudication.v1'){adjudication++;return completion(reply);}npc++;return completion(decision);};Math.random=()=>{dice++;return (die-.5)/20;};
 return {post,read:async()=>(await(await GET()).json()).world,choose:value=>{decision=value;},reply:value=>{reply=value;},counts:()=>({npc,adjudication,dice}),inputs,restore:()=>{global.fetch=oldFetch;Math.random=oldRandom;}};
}
const advance=async(s,extra={})=>{const r=await s.post({operation:'advance',minutes:15,...extra});assert.equal(r.status,200,await r.clone().text());return s.read();};
test('legacy state still rejects an unlisted tea stain without mutating the saved original cup',async()=>{
 const s=await scenario({reply:accepted([{kind:'state',objectId:'cup',expectedRevision:1,key:'surface',value:'茶漬'}])});
 try{const before=await s.read(),r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,502);assert.match((await r.json()).error,/物件不支援/);const saved=await s.read();assert.deepEqual(saved.objects,before.objects);assert.equal(saved.turn,before.turn);assert.deepEqual(s.counts(),{npc:1,adjudication:1,dice:0});}finally{s.restore();}
});
test('a model-confirmed unlisted state persists on the same cup and is available to a later proposal',async()=>{
 const s=await scenario();try{let saved=await advance(s);assert.equal(nonPhoneObjects(saved).length,1);assert.equal(nonPhoneObjects(saved)[0].id,'cup');assert.equal(nonPhoneObjects(saved)[0].source,'original-cup');assert.equal(nonPhoneObjects(saved)[0].owner,'owner');assert.equal(nonPhoneObjects(saved)[0].state.surface,'茶漬');assert.equal(nonPhoneObjects(saved)[0].revision,2);
 s.reply(accepted([{...change('濕潤',2),changes:[{key:'surface',from:'茶漬',value:'濕潤'}]}]));saved=await advance(s);assert.equal(nonPhoneObjects(saved)[0].state.surface,'濕潤');const request=s.inputs.filter(item=>item.input.self).at(-1);assert.equal(nonPhoneObjects(request.input)[0].state.surface,'茶漬');assert.deepEqual(s.counts(),{npc:2,adjudication:2,dice:0});}finally{s.restore();}
});

test('the actual schema prompt parser and receipt expose the same bounded new state without leaking its reason to NPCs',async()=>{
 const reply=accepted([change()]),s=await scenario({reply});try{
  const raw=JSON.stringify(reply),before=await s.read(),parsed=load('adjudication-contract').parseAdjudicationCandidate(raw);
  assert.equal(parsed.candidate.effects[0].kind,'change-state');const afterParse=await s.read();before.aiUsage.windowStartedAt=afterParse.aiUsage.windowStartedAt;assert.deepEqual(afterParse,before);
  const r=await s.post({operation:'advance',minutes:15}),body=await r.json();assert.equal(r.status,200,body.error);
  const {input,request}=s.inputs.find(item=>item.input.contractVersion==='world-adjudication.v1');assert.match(input.effectRules.join(' '),/change-state version=1/);assert.equal(input.effectContractVersion,'world-effects.v5');
  const schema=request.response_format.json_schema.schema.$defs.effect.anyOf.find(item=>item.properties.kind.const==='change-state');assert.equal(schema.properties.changes.maxItems,4);assert.deepEqual(schema.properties.access.enum,['authorized','physical']);
  const e=body.operationEvidence;assert.deepEqual(e.dispatches[1].candidate.value,reply);assert.ok(e.result.objects[0].stateEntries.some(item=>item.key==='surface'&&item.value==='茶漬'));assert.deepEqual(e.result.beforeObjects[0].stateEntries,[{key:'contents',value:'empty'}]);assert.equal(e.truncated,false);assert.ok(Buffer.byteLength(JSON.stringify(e))<=65536);
  assert.doesNotMatch(body.world.characters[0].activity,/布料擦拭後|裁定理由/);
  const reread=await(await GET(new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(e.operationId)))).json();assert.deepEqual(reread.operation.evidence,e);assert.equal((await s.post(e.replay)).status,200);assert.deepEqual(s.counts(),{npc:1,adjudication:1,dice:0});
 }finally{s.restore();}
});

test('invalid unlisted-state candidates and changed current facts reject atomically before any die',async()=>{
 const invalid=[e=>e.version=2,e=>e.access='unknown',e=>e.target.id='another-world-object',e=>e.expectedRevision=2,e=>e.changes[0].from='過期茶漬',e=>e.changes.push({...e.changes[0]}),e=>e.changes[0].key='__proto__',e=>e.changes[0].key='owner',e=>e.changes[0].key='surface.constructor',e=>e.changes[0].value='x'.repeat(101),e=>e.reason='',e=>{delete e.changes[0].from;}];
 for(const modify of invalid){const effect=change();modify(effect);const s=await scenario({reply:{...accepted([effect]),check:{difficulty:12,ability:'整理'}}});try{const before=await s.read(),body={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()},r=await s.post(body);assert.equal(r.status,502);const saved=await s.read();assert.deepEqual(saved.objects,before.objects);assert.equal(saved.turn,before.turn);assert.equal(saved.aiUsage.totalCalls,2);assert.deepEqual(s.counts(),{npc:1,adjudication:1,dice:0});assert.equal((await s.post(body)).status,502);assert.deepEqual(s.counts(),{npc:1,adjudication:1,dice:0});}finally{s.restore();}}
});

test('unlisted states obey total saved bounds and generic kinds retain their source and identity',async()=>{
 const s=await scenario({mutate:w=>{for(let n=0;n<15;n++)w.objects[0].state['detail'+n]='present';}});try{const before=await s.read(),r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,502);assert.deepEqual((await s.read()).objects,before.objects);}finally{s.restore();}
 const d=await scenario({reply:accepted([{kind:'materialize',supplyId:'fabric',expectedRemaining:1}]),decision:{...proposal,target:'fabric'},mutate:w=>{w.supplies=[{id:'fabric',label:'一塊亞麻布',region:'cafe-front',owner:'owner',allowedTo:['owner'],knownTo:['owner'],kind:'textile',remaining:1,initialState:{texture:'柔軟'}}];}});try{const saved=await advance(d);assert.equal(saved.objects.find(o=>o.source==='fabric').kind,'textile');assert.equal(saved.supplies[0].remaining,0);}finally{d.restore();}
});

test('all five result bands preserve confirmed differences, failed consumption and the selected state only',async()=>{
 const outcomes=['critical-success','success','mixed','failure','critical-failure'];
 for(const [die,outcome,surface,used] of [[20,'critical-success','乾爽',false],[12,'success','乾爽',false],[6,'mixed','仍有茶漬',false],[2,'failure',undefined,true],[1,'critical-failure',undefined,true]]){
  const reply={...accepted([]),check:{difficulty:12,ability:'整理'},branches:[{outcomes:outcomes.slice(0,2),effects:[change('乾爽')],stages:[]},{outcomes:['mixed'],effects:[change('仍有茶漬')],stages:[]},{outcomes:outcomes.slice(3),effects:[{kind:'consume',objectId:'material',expectedRevision:1}],stages:[]}]};
  const s=await scenario({reply,die,mutate:w=>w.objects.push({...structuredClone(w.objects[0]),id:'material',source:'material-source',kind:'food',state:{},stateTransitions:undefined})});try{const saved=await advance(s);assert.equal(saved.objects[0].state.surface,surface);assert.equal(saved.objects[1].lifecycle,used?'consumed':'active');assert.equal(Object.values(saved.freeTrials)[0].outcome,outcome);assert.deepEqual(s.counts(),{npc:1,adjudication:1,dice:1});}finally{s.restore();}
 }
});

test('cross-turn state conditions preserve earlier effects on interruption and never apply stale future changes',async()=>{
 const phase=(afterMinutes,revision,from,value)=>({afterMinutes,preconditions:[{objectId:'cup',revision,region:'cafe-front',holder:'owner',state:from===null?[]:[{key:'surface',value:from}]}],effects:[{...change(value,revision),changes:[{key:'surface',from,value}]}]});
 for(const mode of ['complete','takeover','changed']){const reply={...accepted([]),completionMinutes:30,stages:[phase(15,1,null,'茶漬'),phase(30,2,'茶漬','乾爽')]},s=await scenario({reply});try{let saved=await advance(s);assert.equal(saved.objects[0].state.surface,'茶漬');assert.equal(saved.characters[0].plan.phases.cursor,1);
   if(mode==='takeover')await s.post({operation:'takeover'});
   if(mode==='changed'){saved.objects[0].state.surface='他人留下的新濕痕';saved.objects[0].revision++;store.replaceCommittedWorld(saved);}
   saved=await advance(s);assert.equal(saved.objects[0].state.surface,mode==='complete'?'乾爽':mode==='changed'?'他人留下的新濕痕':'茶漬');assert.equal(saved.characters[0].plan,undefined);assert.deepEqual(s.counts(),{npc:1,adjudication:1,dice:0});
  }finally{s.restore();}}
});

test('new state effects retain existing save failure, unknown commit and version conflict replay semantics',async()=>{
 for(const fault of ['throwBeforeNextSave','throwAfterNextSave','conflictOnNextSave']){const s=await scenario();try{store[fault]();const body={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()},response=await s.post(body);assert.equal(response.status,fault==='throwAfterNextSave'?200:502);const saved=await s.read();assert.equal(saved.objects[0].state.surface,fault==='throwAfterNextSave'?'茶漬':undefined);assert.equal(saved.aiUsage.totalCalls,2);assert.equal((await s.post(body)).status,response.status);assert.deepEqual((await s.read()).objects,saved.objects);assert.deepEqual(s.counts(),{npc:1,adjudication:1,dice:0});}finally{s.restore();}}
});

test('new change-state previous values and reasons cannot expose credentials in either bounded diagnostic',async()=>{
 const effect=change();effect.changes=[{key:'authorization',from:'opaque-previous-secret',value:'opaque-next-secret'}];effect.reason='檢查敏感欄位的拒絕證據。';
 const s=await scenario({reply:accepted([effect])});try{const response=await s.post({operation:'advance',minutes:15});assert.equal(response.status,502);const body=await response.json();assert.ok(body.adjudicationFailure);const encoded=JSON.stringify({receipt:body.operationEvidence,legacy:body.adjudicationFailure});for(const secret of ['opaque-previous-secret','opaque-next-secret','fixture-key'])assert.ok(!encoded.includes(secret),secret);assert.equal(body.operationEvidence.redacted,true);assert.ok(Buffer.byteLength(JSON.stringify(body.operationEvidence))<=65536);}finally{s.restore();}
});
