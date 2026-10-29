/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,name+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const {decision,candidate,adoption,choose}=require('./pursuit-selection-fixture.cjs');
const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:Date.now()+':'+crypto.randomUUID(),mode:'openai',model:'gpt-6-luna',...body})}));
const read=async()=> (await(await GET()).json()).world;
const trace=async id=>(await(await GET(new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(id)))).json()).decisionTrace;
async function setup(prepare=()=>{}){const w=seedWorld();w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'gpt-6-luna'};prepare(w);store.install(w);await post({operation:'set-model-key',key:'fixture-key'});return w;}
async function transport(respond,run){const original=global.fetch;const frames=[];global.fetch=async(url,init)=>{assert.match(String(url),/^https:\/\/api\.openai\.com\//);const request=JSON.parse(init.body),input=JSON.parse(request.messages[1].content);const value=respond(input,request,frames);frames.push({request,input,value});return Response.json({usage:{prompt_tokens:30,completion_tokens:20},choices:[{message:{content:JSON.stringify(value)},finish_reason:'stop'}]});};try{return await run(frames);}finally{global.fetch=original;}}

test('one normal dispatch offers multiple pursuits, explicitly adopts one revised scope, and the next actual request retains only its commitment',async()=>{
 await setup();let round=0;
 await transport((input,request)=>{const v=decision(input);assert.match(request.messages[0].content,/候選追求/);
  if(round===0){const rest=candidate('owner','rest','照顧自己的精神','休息到精神舒適'),tidy=candidate('owner','tidy','收拾角落','把角落的小東西整理好');v.pursuitCandidates=[rest,tidy];v.pursuitUpdates=[adoption(input,rest,'owner:quiet','先安靜休息十五分鐘再看感受')];v.pursuitSelection.adoptions=[{candidateId:rest.id,pursuitId:'owner:quiet'}];v.pursuitSelection.reason='現在比較想照顧自己的精神';choose(v,{kind:'candidate',id:rest.id,version:0},'owner:quiet');}
  else {assert.equal(input.self.intents.find(x=>x.id==='owner:quiet').scope,'先安靜休息十五分鐘再看感受');assert.equal(JSON.stringify(input).includes('把角落的小東西整理好'),false);assert.equal(JSON.stringify(input).includes('owner:candidate:'),false);choose(v,{kind:'existing',id:'owner:quiet',version:1});}
  return v;},async frames=>{const operationId=Date.now()+':'+crypto.randomUUID();let response=await post({operation:'advance',minutes:15,operationId});assert.equal(response.status,200,await response.clone().text());const saved=await read();assert.equal(saved.characters[0].intents.length,2);assert.equal(saved.characters[0].intents.find(x=>x.id==='owner:quiet').version,1);assert.equal(saved.objects?.some(o=>o.kind==='meal')||false,false);assert.equal(JSON.stringify(saved).includes('把角落的小東西整理好'),false);const evidence=await trace(operationId);assert.equal(evidence.outcome,'committed');const selection=evidence.steps.find(x=>x.kind==='npc-pursuit-selection');assert.equal(selection.source,'model-self-report');assert.equal(selection.data.candidates.length,2);assert.equal(selection.data.adopted[0].candidate.scope,'休息到精神舒適');assert.equal(selection.data.adopted[0].pursuit.scope,'先安靜休息十五分鐘再看感受');
   round++;response=await post({operation:'advance',minutes:15});assert.equal(response.status,200,await response.clone().text());assert.deepEqual((await read()).characters[0].intents,saved.characters[0].intents);assert.equal(frames.length,2);await post({operation:'advance',minutes:15,operationId});assert.equal(frames.length,2);
  });
});

test('empty candidates and focus remain legal; a later decision can prefer an existing direction and explicitly decline a new candidate',async()=>{
 const initial=await setup();let round=0;
 await transport(input=>{const v=decision(input);if(round===1){const possibility=candidate('owner','talk','試著和人說說話');v.pursuitCandidates=[possibility];v.pursuitSelection.declinedCandidateIds=[possibility.id];v.pursuitSelection.reason='我現在不想找人談話';choose(v,{kind:'existing',id:'owner:direction',version:1});v.methodAssessment.choice='wait';}return v;},async frames=>{
  for(round=0;round<2;round++){const operationId=Date.now()+':'+crypto.randomUUID();const response=await post({operation:'advance',minutes:15,operationId});assert.equal(response.status,200,await response.clone().text());const evidence=await trace(operationId);const selection=evidence.steps.find(x=>x.kind==='npc-pursuit-selection').data;if(round===0){assert.deepEqual(selection.candidates,[]);assert.equal(selection.selection.focus,null);}else{assert.equal(selection.selection.focus.kind,'existing');assert.equal(selection.selection.declinedCandidateIds[0],'owner:candidate:talk');}assert.deepEqual((await read()).characters[0].intents,initial.characters[0].intents);}
  assert.equal(frames.length,2);assert.equal((await read()).characters[0].arrangements?.items?.length||0,0);
 });
});

test('pure activity progress adds no candidate dispatch and chosen continue preserves the same actual progress',async()=>{
 await setup();let round=0;
 await transport(input=>{const v=decision(input);if(round===0){v.durationMinutes=60;choose(v,{kind:'existing',id:'owner:direction',version:1});}else{assert.ok(input.currentActivity.canContinueExisting);v.action={type:'continue',target:'',content:'',purpose:''};v.methodAssessment.choice='continue';v.methodAssessment.selectedAction={type:'continue',target:''};choose(v,{kind:'existing',id:'owner:direction',version:1});}return v;},async frames=>{
  assert.equal((await post({operation:'advance',minutes:15})).status,200);const first=await read(),start=first.characters[0].plan.startedAt,until=first.characters[0].plan.until;
  assert.equal((await post({operation:'advance',minutes:15})).status,200);assert.equal(frames.length,1);assert.equal((await read()).characters[0].plan.until,until);
  assert.equal((await post({operation:'intervene',target:'owner',text:'外頭下雨了，我只是告訴你。'})).status,200);round++;
  const response=await post({operation:'advance',minutes:15});assert.equal(response.status,200,await response.clone().text());const after=await read();assert.equal(frames.length,2);assert.equal(after.characters[0].plan.startedAt,start);assert.equal(after.characters[0].plan.until,until);assert.deepEqual(after.characters[0].intents,first.characters[0].intents);
 });
});

for(const [name,mutate] of [
 ['missing collection',v=>{delete v.pursuitCandidates;}],
 ['missing convergence',v=>{delete v.pursuitSelection;}],
 ['duplicate candidate identity',v=>{v.pursuitCandidates.push(v.pursuitCandidates[0]);}],
 ['foreign actor candidate',v=>{v.pursuitCandidates[0].id='vera:candidate:quiet';}],
 ['too many candidates',v=>{v.pursuitCandidates=Array.from({length:5},(_,i)=>candidate('owner','n'+i,'想試試這個方向'));}],
 ['unknown candidate adoption',v=>{v.pursuitSelection.adoptions[0].candidateId='owner:candidate:missing';}],
 ['duplicated adoption',v=>{v.pursuitSelection.adoptions.push(v.pursuitSelection.adoptions[0]);}],
 ['new commitment without adoption',v=>{v.pursuitSelection.adoptions=[];v.pursuitSelection.focus=null;v.focusIntentId=null;v.methodAssessment.intentIds=[];}],
 ['existing pursuit disguised as adoption',v=>{v.pursuitUpdates=[];v.pursuitSelection.adoptions[0].pursuitId='owner:direction';}],
 ['new commitment disguised as existing focus',v=>{v.pursuitSelection.focus={kind:'existing',id:'owner:quiet',version:1};}],
 ['stale existing focus',v=>{v.pursuitSelection.focus={kind:'existing',id:'owner:direction',version:2};v.focusIntentId='owner:direction';v.methodAssessment.intentIds=['owner:direction'];}],
 ['unadopted candidate focus',v=>{v.pursuitCandidates.push(candidate('owner','other','另外一個可能'));v.pursuitSelection.focus.id='owner:candidate:other';}],
 ['focus-to-action contradiction',v=>{v.focusIntentId='owner:direction';v.methodAssessment.intentIds=['owner:direction'];}],
 ['simultaneously adopted and declined',v=>{v.pursuitSelection.declinedCandidateIds=[v.pursuitCandidates[0].id];}],
 ['unknown private source',v=>{v.pursuitCandidates[0].references=[{kind:'short',id:'private-trace-only',version:1}];}],
 ['stale visible source',(v,input)=>{const source=input.self.shortTerm[0];v.pursuitCandidates[0].references=[{kind:'short',id:source.id,version:source.version+1}];}],
])test(`invalid ${name} rolls back the whole decision without repair or redispatch`,async()=>{
 const initial=await setup();await transport(input=>{const v=decision(input),proposal=candidate('owner','quiet','照顧自己的精神');v.pursuitCandidates=[proposal];v.pursuitUpdates=[adoption(input,proposal,'owner:quiet')];v.pursuitSelection.adoptions=[{candidateId:proposal.id,pursuitId:'owner:quiet'}];choose(v,{kind:'candidate',id:proposal.id,version:0},'owner:quiet');mutate(v,input);return v;},async frames=>{
  const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()},response=await post(op);assert.equal(response.status,502);const saved=await read();assert.deepEqual(saved.characters,initial.characters);assert.deepEqual(saved.events,initial.events);assert.equal(saved.turn,0);assert.equal(saved.aiUsage.totalCalls,1);assert.equal(saved.aiUsage.totalInputTokens,30);assert.equal(frames.length,1);await post(op);assert.equal(frames.length,1);const evidence=await trace(op.operationId);assert.notEqual(evidence.outcome,'committed');assert.equal(evidence.steps.some(x=>x.kind==='npc-pursuit-selection'),false);
 });
});

function candidatesAtBytes(target){const values=Array.from({length:3},(_,i)=>candidate('owner','boundary'+i,'a','b'));for(const item of values)item.satisfaction='';let remaining=target-Buffer.byteLength(JSON.stringify(values));for(const item of values)for(const [key,max] of [['content',120],['scope',120],['satisfaction',80]])while(remaining&&item[key].length<max){const letter=remaining>=3?'界':'x';item[key]+=letter;remaining-=Buffer.byteLength(letter);}assert.equal(remaining,0);assert.equal(Buffer.byteLength(JSON.stringify(values)),target);return values;}
test('the disclosed candidate JSON byte boundary accepts 2048 and rejects 2049 without truncating choices',async()=>{
 for(const bytes of [2048,2049]){const initial=await setup();await transport(input=>{const v=decision(input);v.pursuitCandidates=candidatesAtBytes(bytes);return v;},async frames=>{const response=await post({operation:'advance',minutes:15});assert.equal(response.status,bytes===2048?200:502,await response.clone().text());assert.equal(frames.length,1);assert.deepEqual((await read()).characters[0].intents,initial.characters[0].intents);});}
});

function withSelectionBytes(input,target){const v=decision(input);for(let i=0;i<3;i++){const proposal=candidate('owner',`${i}`+'c'.repeat(47),'a','b'),id='owner:'+i+'p'.repeat(57);assert.equal(proposal.id.length,64);assert.equal(id.length,64);v.pursuitCandidates.push(proposal);v.pursuitUpdates.push(adoption(input,proposal,id));v.pursuitSelection.adoptions.push({candidateId:proposal.id,pursuitId:id});}choose(v,{kind:'candidate',id:v.pursuitCandidates[0].id,version:0},v.pursuitUpdates[0].id);let remaining=target-Buffer.byteLength(JSON.stringify(v.pursuitSelection));assert.ok(remaining>0);while(remaining){const letter=remaining>=3?'界':'x';v.pursuitSelection.reason+=letter;remaining-=Buffer.byteLength(letter);}assert.ok(v.pursuitSelection.reason.length<=160);assert.equal(Buffer.byteLength(JSON.stringify(v.pursuitSelection)),target);return v;}
test('the disclosed convergence byte boundary accepts 1024 and rejects 1025 atomically',async()=>{
 for(const bytes of [1024,1025]){const initial=await setup();await transport(input=>withSelectionBytes(input,bytes),async frames=>{const response=await post({operation:'advance',minutes:15});assert.equal(response.status,bytes===1024?200:502,await response.clone().text());assert.equal(frames.length,1);const saved=await read();if(bytes===1024)assert.equal(saved.characters[0].intents.length,4);else assert.deepEqual(saved.characters[0].intents,initial.characters[0].intents);});}
});

test('hidden world differences do not change the actual same-call candidate input',async()=>{
 await setup();await transport(input=>decision(input),async()=>{assert.equal((await post({operation:'advance',minutes:15})).status,200);});const template=await read(),messages=[];
 for(const secret of ['hidden-A','hidden-B']){await setup(w=>{Object.assign(w,structuredClone(template));w.supplies=[{id:'hidden-source',label:secret,region:'cafe-back',remaining:secret==='hidden-A'?30:0,owner:'owner',knownTo:[],allowedTo:['owner'],kind:'food',initialState:{secret}}];});await transport((input,request)=>{assert.equal(JSON.stringify(request).includes(secret),false);messages.push(request.messages);const v=decision(input);v.pursuitCandidates=[candidate('owner','quiet','照顧自己的精神')];return v;},async frames=>{const response=await post({operation:'advance',minutes:15});assert.equal(response.status,200,await response.clone().text());assert.equal(frames.length,1);});}
 assert.deepEqual(messages[0],messages[1]);
});

test('a representative four-character round keeps the same four dispatches with full candidate sets and no candidate scoring calls',async()=>{
 const template=seedWorld();await setup(w=>{w.characters=template.characters;w.pursuitContext=template.pursuitContext;});
 await transport((input,request)=>{assert.equal(request.max_completion_tokens,2048);const v=decision(input);v.pursuitCandidates=[candidate(input.self.id,'rest','照顧自己的精神'),candidate(input.self.id,'tidy','整理身邊的小東西'),candidate(input.self.id,'think','想想最近在乎的事情'),candidate(input.self.id,'observe','留意眼前尚不理解的線索')];choose(v,{kind:'existing',id:input.self.id+':direction',version:1});return v;},async frames=>{const response=await post({operation:'advance',minutes:15});assert.equal(response.status,200,await response.clone().text());const saved=await read();assert.equal(frames.length,4);assert.equal(new Set(frames.map(f=>f.input.self.id)).size,4);assert.equal(saved.aiUsage.totalCalls,4);assert.ok(saved.characters.every(c=>c.intents.length===1));assert.equal(saved.aiUsage.totalUnknownCalls,0);assert.ok(frames.every(f=>f.value.pursuitCandidates.length===4));const bytes=frames.map(f=>({actor:f.input.self.id,input:Buffer.byteLength(JSON.stringify(f.input)),request:Buffer.byteLength(JSON.stringify(f.request)),candidates:Buffer.byteLength(JSON.stringify(f.value.pursuitCandidates)),selection:Buffer.byteLength(JSON.stringify(f.value.pursuitSelection)),reply:Buffer.byteLength(JSON.stringify(f.value))}));assert.ok(bytes.every(b=>b.input<=88*1024&&b.candidates<=2048&&b.selection<=1024));console.log('pursuit-selection-four-actor-bytes',JSON.stringify(bytes));});
});

test('candidate references may use an actually visible selected memory without making an unadopted possibility into memory',async()=>{
 await setup();let round=0;
 await transport(input=>{const v=decision(input);if(round===0){const source=input.self.shortTerm[0];v.memorySelections=[{id:source.id,version:source.version,reason:'這段自我經歷對我仍有意義'}];}else if(round===1){const source=input.self.longTerm[0];assert.ok(source);const proposal=candidate('owner','memory-option','考慮一個還沒有承接的新想法');proposal.references=[{kind:'long',id:source.id,version:source.version}];v.pursuitCandidates=[proposal];}else{assert.equal(JSON.stringify(input).includes('考慮一個還沒有承接的新想法'),false);assert.equal(JSON.stringify(input).includes('owner:candidate:memory-option'),false);}return v;},async frames=>{for(round=0;round<3;round++){const response=await post({operation:'advance',minutes:15});assert.equal(response.status,200,await response.clone().text());}const saved=await read();assert.equal(frames.length,3);assert.equal(saved.characters[0].intents.length,1);assert.equal(saved.characters[0].longTerm.length,1);assert.equal(JSON.stringify(saved.characters[0]).includes('考慮一個還沒有承接的新想法'),false);});
});

test('four explicit new commitments still fit the original four-update decision allowance',async()=>{
 await setup();await transport(input=>{const v=decision(input);for(let i=0;i<4;i++){const proposal=candidate('owner','new'+i,'這是本人選擇的短追求'+i);v.pursuitCandidates.push(proposal);v.pursuitUpdates.push(adoption(input,proposal,'owner:new'+i));v.pursuitSelection.adoptions.push({candidateId:proposal.id,pursuitId:'owner:new'+i});}choose(v,{kind:'candidate',id:'owner:candidate:new3',version:0},'owner:new3');return v;},async frames=>{const response=await post({operation:'advance',minutes:15});assert.equal(response.status,200,await response.clone().text());assert.equal(frames.length,1);assert.equal((await read()).characters[0].intents.length,5);assert.equal(frames[0].value.pursuitCandidates.length,4);});
});
