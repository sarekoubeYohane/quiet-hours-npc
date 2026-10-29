/* eslint-disable @typescript-eslint/no-require-imports -- Model transport/controlled world fixtures. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {nonPhoneObjects}=require('./fixtures/non-phone-objects.cjs');
const load=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,`${name}.cjs`));
const {POST,GET}=load('route'),{seedWorld}=load('world'),store=load('store');
const response=value=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
const proposal=target=>({type:'propose',target,content:'清洗杯子',purpose:'清洗',mood:'平靜',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null},intents:[]});
const approval=()=>({status:'accepted',completionMinutes:null,effects:[],stages:[],branches:null,check:null,routine:{family:'cafe-service',version:3,operation:'wash',subject:'杯子',timings:[{operation:'wash',minutes:15}],programs:[{operation:'wash',methods:[{content:'清洗杯子',purpose:'清洗'}],bindings:[{role:'vessel',type:'object',select:'target',kind:null,label:null,state:[{key:'茶漬',value:'有'}],access:'authorized',link:null,background:null,quantity:null,sourceRole:null,sourceSubject:null}],effects:[],check:null,branches:null,stages:[{afterMinutes:15,preconditions:[{kind:'state-condition',version:1,target:{type:'object',id:'$vessel'},state:[{key:'茶漬',value:'有'}]}],effects:[{kind:'change-state',version:1,target:{type:'object',id:'$vessel'},expectedRevision:0,access:'authorized',exposure:'public',changes:[{key:'茶漬',from:'有',value:'無'},{key:'濕潤',from:null,value:'是'}],reason:'普通清洗去除茶漬並在杯壁留下水分。'}]}]}]}});
const cup=id=>({id,label:id,source:'fixture-source',region:'cafe-front',holder:'owner',owner:'owner',revision:1,lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner'],state:{茶漬:'有',contents:'empty'}});
async function scenario({generic=false,objects,adjustReply=value=>value,adjustWorld=()=>{}}={}){
 const world=seedWorld();world.contextId='routine-world-changes-fixture';world.characters=world.characters.filter(c=>c.id==='owner');world.characters[0].routineCapabilities=['wash'];world.adjudication={provider:'openai',model:'fixture-world'};world.objects=objects||[cup('cup-a'),cup('cup-b')];if(generic)world.objects.forEach(object=>{object.kind='furniture';object.label=object.id==='cup-a'?'第一張桌面':'第二張桌面';});adjustWorld(world);store.install(world);
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:Date.now()+':'+crypto.randomUUID(),worldContext:world.contextId,mode:'openai',model:'gpt-6-luna',...body})}));
 await post({operation:'set-model-key',key:'fixture-key'});const method=target=>generic?{...proposal(target),content:'把桌面擦拭乾淨，保留表面些許水分',purpose:'清潔桌面'}:proposal(target);let decision=method('cup-a'),replacementReply,npc=0,adjudication=0;const inputs=[],requests=[];const original=global.fetch;
 global.fetch=async(_url,init)=>{const request=JSON.parse(init.body),input=JSON.parse(request.messages[1].content);inputs.push(input);requests.push(request);if(input.contractVersion==='world-adjudication.v1'){adjudication++;const reply=approval();if(generic){reply.routine.operation='wipe-table';reply.routine.subject='桌面';reply.routine.timings=[{operation:'wipe-table',minutes:15}];reply.routine.programs[0].operation='wipe-table';reply.routine.programs[0].methods=[{content:'擦桌面',purpose:'清潔桌面'}];}return response(replacementReply||adjustReply(reply));}npc++;return response(decision);};
 return {post,read:async()=>(await(await GET()).json()).world,choose:value=>{decision=value;},method,inputs,requests,reply:value=>{replacementReply=value;},counts:()=>({npc,adjudication}),restore:()=>{global.fetch=original;}};
}
test('a newly confirmed table-wiping method reuses its original long proposal without a legacy verb or another adjudication',async()=>{
 const s=await scenario({generic:true});try{
  let r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());let w=await s.read();
  assert.equal(w.objects.find(o=>o.id==='cup-a').state.茶漬,'無');assert.equal(w.routineRules[0].version,3);
  assert.ok(w.routineRules[0].programs[0].methods.some(method=>method.content===s.method('cup-a').content));
  s.choose(s.method('cup-b'));r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());w=await s.read();
  assert.equal(w.objects.find(o=>o.id==='cup-b').state.茶漬,'無');assert.equal(w.objects.find(o=>o.id==='cup-b').kind,'furniture');assert.deepEqual(s.counts(),{npc:2,adjudication:1});assert.deepEqual(store.snapshot().objects,w.objects);
 }finally{s.restore();}
});
test('model-confirmed generic routine changes rebind a new current cup for free without fixed wash effects',async()=>{
 const s=await scenario();try{
  let r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());let w=await s.read();
  assert.equal(nonPhoneObjects(w).find(o=>o.id==='cup-a').state.茶漬,'無');assert.equal(nonPhoneObjects(w).find(o=>o.id==='cup-a').state.濕潤,'是');assert.equal(nonPhoneObjects(w).find(o=>o.id==='cup-a').state.contents,'empty');assert.equal(nonPhoneObjects(w).length,2);assert.equal(w.routineRules[0].version,3);
  s.choose(proposal('cup-b'));const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};r=await s.post(op);assert.equal(r.status,200,await r.clone().text());w=await s.read();
  assert.equal(nonPhoneObjects(w).find(o=>o.id==='cup-b').state.茶漬,'無');assert.equal(nonPhoneObjects(w).find(o=>o.id==='cup-b').state.濕潤,'是');assert.deepEqual(s.counts(),{npc:2,adjudication:1});assert.deepEqual(store.snapshot().objects,w.objects);
  assert.equal((await s.post(op)).status,200);assert.deepEqual((await s.read()).objects,w.objects);assert.deepEqual(s.counts(),{npc:2,adjudication:1});
 }finally{s.restore();}
});
module.exports={approval,proposal,cup,scenario};
test('confirmed background material forms a new traced serving while keeping the current vessel identity',async()=>{
 const s=await scenario();const reply=approval(),program=reply.routine.programs[0];reply.routine.operation=program.operation='prepare-infusion';reply.routine.subject='茶';reply.routine.timings=[{operation:'prepare-infusion',minutes:15}];program.methods=[{content:'用普通背景沖泡淡茶',purpose:'飲用'}];
 program.bindings=[{role:'vessel',type:'object',select:'target',kind:'utensil',label:null,state:[{key:'contents',value:'empty'}],access:'authorized',link:null,background:null,quantity:null,sourceRole:null,sourceSubject:null},{role:'raw',type:'supply',select:'local',kind:'food',label:null,state:[],access:'authorized',link:null,quantity:null,sourceRole:'material',sourceSubject:'茶葉',background:{label:'普通茶葉',kind:'food',consumable:false,quantity:{amount:1,unit:'item'},initialState:[{key:'private-batch',value:'observer-only',exposure:'hidden'}]}}];
 program.stages=[{afterMinutes:15,preconditions:[],effects:[{kind:'materialize',supplyId:'$raw',expectedRemaining:0},{kind:'change-state',version:1,access:'authorized',exposure:'public',target:{type:'object',id:'$vessel'},expectedRevision:0,changes:[{key:'contents',from:'empty',value:'tea'}],reason:'本次以茶葉製成茶飲。'},{kind:'form',version:1,access:'authorized',operation:'transform',inputs:[{objectId:'$raw-object',expectedRevision:0,quantity:{amount:1,unit:'item'},disposition:'consumed'}],outputs:[{id:'$serving',label:'一份淡茶',kind:'drink',consumable:true,quantity:{amount:1,unit:'serving'},state:[{key:'vessel',value:'$vessel',exposure:'public'},{key:'beverage',value:'tea',exposure:'public'}]}],reason:'茶葉是飲品的真實來源，杯子繼續存在。'}]}];
 const original=global.fetch;global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);return response(input.contractVersion==='world-adjudication.v1'?reply:{...proposal('cup-a'),content:'用普通背景沖泡淡茶',purpose:'飲用'});};
 try{const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());const w=await s.read(),cup=w.objects.find(o=>o.id==='cup-a'),drink=w.objects.find(o=>o.kind==='drink');assert.equal(cup.state.contents,'tea');assert.equal(cup.source,'fixture-source');assert.equal(drink.state.vessel,cup.id);assert.equal(drink.sources.length,1);const raw=w.objects.find(o=>o.id===drink.sources[0].id);assert.equal(raw.lifecycle,'consumed');assert.equal(raw.stateExposure['private-batch'],'hidden');assert.equal(w.supplies.find(s=>s.id===raw.source).stateExposure['private-batch'],'hidden');assert.deepEqual(store.snapshot().objects,w.objects);}finally{global.fetch=original;s.restore();}
});
test('all eight confirmed method aliases survive while the original long phrase is also saved for free reuse',async()=>{
 const aliases=Array.from({length:8},(_,index)=>({content:`桌面擦法${index+1}`,purpose:'清潔桌面'}));
 const s=await scenario({generic:true,objects:['cup-a','cup-b','cup-c'].map(cup),adjustReply:reply=>{reply.routine.programs[0].methods=structuredClone(aliases);return reply;}});
 try{
  const advance=async()=>{const response=await s.post({operation:'advance',minutes:15});assert.equal(response.status,200,await response.clone().text());return s.read();};
  let w=await advance();assert.ok(w.routineRules[0].programs[0].methods.some(method=>method.content===aliases[7].content));assert.equal(w.routineRules[0].programs[0].methods.length,9);
  s.choose({...s.method('cup-b'),...aliases[7]});w=await advance();assert.equal(w.objects[1].state.茶漬,'無');
  s.choose(s.method('cup-c'));w=await advance();assert.equal(w.objects[2].state.茶漬,'無');assert.deepEqual(s.counts(),{npc:3,adjudication:1});
 }finally{s.restore();}
});
test('generic timber formation respects the last finite source even when a background declaration changes its label',async()=>{
 for(const remaining of [1,0]){
  const s=await scenario();const base=store.snapshot();base.supplies=[{id:'last-timber',label:'最後一份木料',kind:'timber',region:'cafe-front',owner:'owner',knownTo:['owner'],allowedTo:['owner'],remaining,initialState:{},quantity:{amount:1,unit:'piece'},consumable:false}];store.replaceCommittedWorld(base);
  const reply=approval(),program=reply.routine.programs[0];reply.routine.operation=program.operation='shape-timber';reply.routine.subject='木製零件';reply.routine.timings=[{operation:'shape-timber',minutes:15}];program.methods=[{content:'把木料製成小零件',purpose:'製作零件'}];program.bindings=[{role:'stock',type:'supply',select:'local',kind:'timber',label:null,state:[],access:'authorized',link:null,quantity:{amount:1,unit:'piece'},sourceRole:'material',sourceSubject:'木料',background:{label:'換個稱呼的普通板材',kind:'timber',consumable:false,quantity:{amount:1,unit:'piece'},initialState:[]}}];
  program.stages=[{afterMinutes:15,preconditions:[],effects:[{kind:'materialize',supplyId:'$stock',expectedRemaining:0},{kind:'form',version:1,access:'authorized',operation:'transform',inputs:[{objectId:'$stock-object',expectedRevision:0,quantity:{amount:1,unit:'piece'},disposition:'consumed'}],outputs:[{id:'$component',label:'木製小零件',kind:'component',consumable:false,quantity:{amount:1,unit:'piece'},state:[]}],reason:'木料是零件的實際來源。'}]}];
  const original=global.fetch;global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);return response(input.contractVersion==='world-adjudication.v1'?reply:{...proposal('cafe'),content:'把木料製成小零件',purpose:'製作零件'});};
  try{const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());const w=await s.read();assert.equal(w.objects.some(object=>object.kind==='component'),remaining===1);assert.equal(w.supplies.length,1);assert.equal(w.supplies[0].remaining,0);assert.equal(w.supplies[0].id,'last-timber');if(!remaining){assert.match(w.characters[0].activity,/沒有新增成果/);assert.match(w.routineAudit.at(-1).reason,/有限材料|背景不會補回/);}}finally{global.fetch=original;s.restore();}
 }
});
test('one v3 cafe confirmation completes drink wash and same-cup brewing with fresh sources and no duplicate serving',async()=>{
 const fixture=require('./routine-world-programs-fixture.cjs'),reply=fixture.approval(fixture.cafePrograms(),'tea','茶');
 const s=await scenario({objects:[{...cup('same-cup'),state:{contents:'empty',clean:'yes'}}],adjustWorld:w=>{delete w.characters[0].routineCapabilities;},adjustReply:()=>reply});
 const advance=async()=>{const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());return s.read();};
 try{
  s.choose({...proposal('same-cup'),content:'用這個杯子替自己泡一杯茶',purpose:'飲用'});let w=await advance();assert.equal(w.objects.find(o=>o.id==='same-cup').state.contents,'water');w=await advance();const first=w.objects.find(o=>o.kind==='drink');assert.equal(first.state.vessel,'same-cup');assert.equal(w.routineRules[0].programs.length,6);
  s.choose({...proposal('same-cup'),content:'喝茶',purpose:'飲用'});w=await advance();assert.equal(w.objects.find(o=>o.id===first.id).lifecycle,'consumed');assert.equal(w.objects.find(o=>o.id==='same-cup').state.contents,'empty');assert.equal(w.objects.find(o=>o.id==='same-cup').state.茶漬,'有');
  s.choose({...proposal('same-cup'),content:'清洗杯子',purpose:'清洗'});w=await advance();assert.equal(w.objects.find(o=>o.id==='same-cup').state.茶漬,'無');assert.equal(w.objects.find(o=>o.id==='same-cup').state.濕潤,'是');
  s.choose({...proposal('same-cup'),content:'用這個杯子替自己泡一杯茶',purpose:'飲用'});await advance();w=await advance();const active=w.objects.filter(o=>o.kind==='drink'&&o.lifecycle==='active');assert.equal(active.length,1);assert.notEqual(active[0].id,first.id);assert.equal(active[0].state.vessel,'same-cup');assert.notEqual(active[0].sources[0].id,first.sources[0].id);assert.equal(w.objects.filter(o=>o.kind==='utensil').length,1);assert.deepEqual(s.counts(),{npc:4,adjudication:1});assert.deepEqual(store.snapshot().objects,w.objects);
 }finally{s.restore();}
});
test('hidden-only changes do not leak authority revisions or add and remove known routine methods in NPC prompts',async()=>{
 const s=await scenario({generic:true});const advance=async()=>{const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());return s.read();};
 try{
  await advance();s.choose({...s.method('cup-b'),content:'保留一個不可知的內部標記',purpose:'外在處理'});s.reply({status:'accepted',completionMinutes:15,stages:[],branches:null,check:null,routine:null,effects:[{kind:'change-state',version:1,access:'authorized',target:{type:'object',id:'cup-b'},expectedRevision:1,exposure:'hidden',changes:[{key:'內部標記',from:null,value:'secret-v3-condition'}],reason:'observer-only private reason'}]});
  let w=await advance();assert.equal(w.objects[1].revision,2);assert.equal(w.objects[1].state.內部標記,'secret-v3-condition');
  s.choose({type:'rest',target:'',content:'休息',purpose:'',mood:'平靜',durationMinutes:15,intents:[]});await advance();
  const prompts=s.inputs.filter(input=>input.contractVersion==='npc-decision.v2'),before=prompts[1],after=prompts[2];assert.ok(before.knownMethods.some(method=>method.content===s.method('cup-a').content));assert.deepEqual(after.knownMethods,before.knownMethods);assert.deepEqual(after.objects.find(object=>object.id==='cup-b'),before.objects.find(object=>object.id==='cup-b'));assert.equal(Object.hasOwn(after.objects[1],'revision'),false);assert.equal(JSON.stringify(after).includes('secret-v3-condition'),false);assert.equal(JSON.stringify(after).includes('observer-only private reason'),false);
 }finally{s.restore();}
});
test('v3 wire rejects missing required binding fields, trusted metadata, historical identities and revisions before any world change',async()=>{
 for(const mutate of [reply=>{reply.routine.finiteSourceBindings=[{operation:'wash',roles:['vessel']}];},reply=>{delete reply.routine.programs[0].bindings[0].sourceSubject;},reply=>{delete reply.routine.programs[0].bindings[0].quantity;},reply=>{delete reply.routine.programs[0].bindings[0].sourceRole;},reply=>{reply.routine.programs[0].stages[0].routineBindings={objects:[],bodies:[]};},reply=>{reply.routine.programs[0].stages[0].effects[0].target.id='cup-a';},reply=>{reply.routine.programs[0].stages[0].effects[0].expectedRevision=1;},reply=>{reply.routine.timings[0].extra=true;}]){
  const s=await scenario({generic:true,adjustReply:reply=>{mutate(reply);return reply;}});try{const before=await s.read();const response=await s.post({operation:'advance',minutes:15});assert.equal(response.status,502);const saved=await s.read();assert.deepEqual(saved.objects,before.objects);assert.equal(saved.routineRules,undefined);assert.deepEqual(s.counts(),{npc:1,adjudication:1});}finally{s.restore();}
 }
});
test('a v3 method saves environment body and natural effects together and reuses only its confirmed relevant scope',async()=>{
 const f=require('./routine-world-programs-fixture.cjs');const program=f.program('wipe-area','擦拭桌面並休息手腕','清潔桌面',[f.binding('surface','environment','here',[{key:'污漬',value:'有'}]),f.binding('self','body','actor')],[f.phase(15,[f.change('surface','污漬','有','無',{target:{type:'environment',id:'$surface'},access:'physical'}),f.change('self','手腕',null,'輕微酸痛',{target:{type:'body',id:'$self'},access:'physical',exposure:'subject'}),{kind:'schedule-natural',version:1,delayMinutes:15,conditions:[{kind:'state-condition',version:1,target:{type:'environment',id:'$surface'},state:[{key:'濕潤',value:'濕'}]}],effects:[{target:{type:'environment',id:'$surface'},changes:[{key:'濕潤',from:'濕',value:'乾'}],exposure:'public'}],reason:'已留下的表面水分在原條件下自然乾燥。'}])]);
 const reply=f.approval([program],'wipe-area','桌面'),s=await scenario({adjustReply:()=>reply,adjustWorld:w=>{w.scene.external={'cafe-front':{revision:0,state:{污漬:'有',濕潤:'濕'},exposure:{污漬:'public',濕潤:'public'}}};}});const advance=async()=>{const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());return s.read();};
 try{
  s.choose({...proposal('cafe'),content:'擦拭桌面並休息手腕',purpose:'清潔桌面'});let w=await advance();assert.equal(w.scene.external['cafe-front'].state.污漬,'無');assert.equal(w.characters[0].physical.state.手腕,'輕微酸痛');assert.equal(w.characters[0].physical.exposure.手腕,'subject');assert.equal(w.naturalChanges.length,1);assert.equal(w.naturalChanges[0].status,'pending');
  s.choose({type:'rest',target:'',content:'休息',mood:'平靜',durationMinutes:15,intents:[]});w=await advance();assert.equal(w.scene.external['cafe-front'].state.濕潤,'乾');assert.equal(w.naturalChanges[0].status,'executed');assert.deepEqual(s.counts(),{npc:2,adjudication:1});assert.deepEqual(store.snapshot().naturalChanges,w.naturalChanges);
  s.reply({status:'denied',completionMinutes:null,stages:[],branches:null,effects:[],check:null,routine:null});s.choose({...proposal('cafe'),content:'擦拭桌面並休息手腕',purpose:'清潔桌面'});w=await advance();assert.deepEqual(s.counts(),{npc:3,adjudication:1},'the same confirmed environment now fails its saved prerequisite without another adjudication');assert.equal(w.routineRules.length,1);assert.equal(w.naturalChanges.length,1);
 }finally{s.restore();}
});
test('natural changes to unrelated state do not invalidate a v3 phase but related conditions retain earlier committed progress',async()=>{
 const f=require('./routine-world-programs-fixture.cjs');
 const program=f.program('clean-in-stages','分段整理桌面','清潔桌面',[f.binding('surface','environment','here',[{key:'進展',value:'未整理'}])],[f.phase(15,[f.change('surface','進展','未整理','整理中',{target:{type:'environment',id:'$surface'},access:'physical'}),{kind:'schedule-natural',version:1,delayMinutes:15,conditions:[{kind:'state-condition',version:1,target:{type:'environment',id:'$surface'},state:[{key:'濕潤',value:'濕'}]}],effects:[{target:{type:'environment',id:'$surface'},changes:[{key:'濕潤',from:'濕',value:'乾'}],exposure:'public'}],reason:'水分自然散去，不改變整理進展。'}]),f.phase(30,[f.change('surface','進展','整理中','完成',{target:{type:'environment',id:'$surface'},access:'physical'})],[{kind:'state-condition',version:1,target:{type:'environment',id:'$surface'},state:[{key:'進展',value:'整理中'}]}])]);
 const s=await scenario({adjustReply:()=>f.approval([program],'clean-in-stages','桌面'),adjustWorld:w=>{w.scene.external={'cafe-front':{revision:0,state:{進展:'未整理',濕潤:'濕'},exposure:{進展:'public',濕潤:'public'}}};}});
 try{const step=async()=>{const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());return s.read();};s.choose({...proposal('cafe'),content:'分段整理桌面',purpose:'清潔桌面'});let w=await step();assert.equal(w.scene.external['cafe-front'].state.進展,'整理中');assert.ok(w.characters[0].plan);s.choose({type:'continue',target:'',content:'繼續',mood:'平靜',durationMinutes:15,intents:[]});w=await step();assert.equal(w.scene.external['cafe-front'].state.進展,'完成');assert.equal(w.scene.external['cafe-front'].state.濕潤,'乾');assert.equal(w.characters[0].plan,undefined);assert.equal(s.counts().adjudication,1);assert.deepEqual(store.snapshot().scene,w.scene);}finally{s.restore();}
});
test('v3 evidence retains full generic programs and the newly approved or reused rule after sixteen older rules',async()=>{
 const f=require('./routine-world-programs-fixture.cjs'),reply=f.approval(f.cafePrograms(),'tea','茶');const bytes=Buffer.byteLength(JSON.stringify(reply));assert.ok(bytes>8192&&bytes<=32768,`representative UTF8 bytes ${bytes}`);
 const s=await scenario({objects:[{...cup('same-cup'),state:{contents:'empty',clean:'yes'}}],adjustWorld:w=>{delete w.characters[0].routineCapabilities;w.routineRules=Array.from({length:17},(_,i)=>({id:'old-'+i,version:3,family:'cafe-service',origin:'elsewhere',knownTo:['owner'],operations:['old'],worldTimings:[{operation:'old',minutes:15}],programs:[]}));},adjustReply:()=>reply});
 try{s.choose({...proposal('same-cup'),content:'泡一杯茶',purpose:'飲用'});let response=await s.post({operation:'advance',minutes:15}),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));let evidence=body.operationEvidence;assert.equal(evidence.dispatches[1].candidate.status,'captured');assert.equal(evidence.dispatches[1].candidate.value.routine.programs[0].bindings[0].role,'vessel');assert.equal(evidence.dispatches[1].candidate.value.routine.programs[0].stages[1].effects[1].inputs[0].objectId,'$raw-object');let w=await s.read(),id=w.routineRules.at(-1).id;assert.equal(evidence.result.rules[0].id,id);assert.equal(evidence.result.rules[0].programs[0].methods[0].content,'泡一杯茶');assert.ok(Buffer.byteLength(JSON.stringify(evidence))<=65536);
 s.choose({type:'continue',target:'',content:'繼續',mood:'平靜',durationMinutes:15,intents:[]});await s.post({operation:'advance',minutes:15});s.choose({...proposal('same-cup'),content:'喝茶',purpose:'飲用'});response=await s.post({operation:'advance',minutes:15});body=await response.json();assert.equal(response.status,200,JSON.stringify(body));evidence=body.operationEvidence;assert.equal(evidence.counts.adjudication,0);assert.equal(evidence.result.rules[0].id,id);assert.equal(evidence.result.rules[0].programs[3].operation,'drink');
 }finally{s.restore();}
});
test('v3 saved rules, background sources and fresh formation identities are exactly once across save failures and original-ID replay',async()=>{
 const f=require('./routine-world-programs-fixture.cjs');for(const fault of ['throw-before','throw-after','conflict']){
 const s=await scenario({objects:[{...cup('same-cup'),state:{contents:'empty',clean:'yes'}}],adjustWorld:w=>{delete w.characters[0].routineCapabilities;},adjustReply:()=>f.approval(f.cafePrograms(),'tea','茶')});try{
 s.choose({...proposal('same-cup'),content:'泡一杯茶',purpose:'飲用'});const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};if(fault==='throw-before')store.throwBeforeNextSave();if(fault==='throw-after')store.throwAfterNextSave();if(fault==='conflict')store.conflictOnNextSave();let r=await s.post(op),body=await r.json();assert.equal(r.status,fault==='throw-after'?200:502,JSON.stringify(body));const saved=await s.read();assert.equal(saved.routineRules?.length||0,fault==='throw-after'?1:0);const counts=s.counts();r=await s.post(op);await r.json();assert.deepEqual(s.counts(),counts);assert.deepEqual((await s.read()).objects,saved.objects);assert.deepEqual((await s.read()).supplies,saved.supplies);assert.deepEqual(store.snapshot().routineRules,saved.routineRules);
 }finally{s.restore();}}
});
test('generic meal partition and later separation preserve original quantities identities and direct sources',async()=>{
 const f=require('./routine-world-programs-fixture.cjs'),item={...cup('meal'),label:'完整餐點',kind:'meal',consumable:true,quantity:{amount:1,unit:'meal'},state:{}};
 const partition={kind:'form',version:1,access:'authorized',operation:'partition',inputs:[{objectId:'$meal',expectedRevision:0,quantity:{amount:1,unit:'meal'},disposition:'consumed'}],outputs:[{id:'$pieces',label:'四塊餐點',kind:'meal',consumable:true,quantity:{amount:4,unit:'piece'},state:[]}],reason:'按重要差異形成一組餐塊，原完整餐點不再存在。'};
 const cut=f.program('partition-meal','把餐點分成四塊','用餐',[f.binding('meal','object','target',[],{kind:'meal'})],[f.phase(15,[partition])]);const sep=f.program('separate-meal','取出一塊餐點','用餐',[f.binding('meal','object','target',[],{kind:'meal',quantity:{amount:2,unit:'piece'}})],[f.phase(15,[{kind:'separate',version:1,access:'authorized',objectId:'$meal',expectedRevision:0,quantity:{amount:1,unit:'piece'},outputId:'$portion',reason:'需要獨立食用時才將一塊另立身份。'}])]);
 // A new generic approval intentionally covers one explicit method; later method gets its own bounded confirmation.
 const s=await scenario({objects:[item],adjustReply:()=>f.approval([cut],'partition-meal','餐點')});try{let r;s.choose({...proposal('meal'),content:'把餐點分成四塊',purpose:'用餐'});r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());let w=await s.read(),aggregate=nonPhoneObjects(w).find(o=>o.id!=='meal');assert.equal(nonPhoneObjects(w)[0].lifecycle,'consumed');assert.equal(aggregate.quantity.amount,4);assert.equal(aggregate.sources[0].id,'meal');s.reply(f.approval([sep],'separate-meal','餐點'));s.choose({...proposal(aggregate.id),content:'取出一塊餐點',purpose:'用餐'});r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());w=await s.read();const portion=nonPhoneObjects(w).find(o=>o.id!=='meal'&&o.id!==aggregate.id);assert.equal(nonPhoneObjects(w).find(o=>o.id===aggregate.id).quantity.amount,3);assert.equal(portion.quantity.amount,1);assert.equal(portion.sources[0].id,aggregate.id);s.choose({...proposal(aggregate.id),content:'取出一塊餐點',purpose:'用餐'});r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200);w=await s.read();assert.equal(nonPhoneObjects(w).filter(o=>o.lifecycle==='active').reduce((n,o)=>n+o.quantity.amount,0),4);assert.equal(nonPhoneObjects(w).filter(o=>o.lifecycle==='active').length,3);assert.deepEqual(s.counts(),{npc:3,adjudication:2});assert.deepEqual(store.snapshot().objects,w.objects);}finally{s.restore();}
});
test('all five generic outcome paths keep only confirmed full partial or failed-consumption results and never reroll on replay',async()=>{
 const f=require('./routine-world-programs-fixture.cjs'),outcomes=['critical-success','success','mixed','failure','critical-failure'];for(const [index,die] of [20,15,11,5,1].entries()){
 const p=f.program('prepare-material','處理材料','製作',[f.binding('raw','object','target',[],{kind:'food'})],[],{check:{difficulty:12,ability:'製作'},branches:outcomes.map((outcome,i)=>({outcomes:[outcome],effects:[],stages:[f.phase(15,i<3?[{kind:'form',version:1,access:'authorized',operation:'transform',inputs:[{objectId:'$raw',expectedRevision:0,quantity:{amount:1,unit:'item'},disposition:'consumed'}],outputs:[{id:'$result',label:i===2?'部分成果':'完整成果',kind:'meal',consumable:true,quantity:{amount:i===2?1:2,unit:'piece'},state:[]}],reason:'形成模型確認的實際成果。'}]:[{kind:'consume',objectId:'$raw',expectedRevision:0}])]}))});
 const s=await scenario({objects:[{...cup('raw'),kind:'food',state:{}}],adjustReply:()=>f.approval([p],'prepare-material','材料')}),prior=Math.random;let dice=0;Math.random=()=>{dice++;return (die-.5)/20;};try{s.choose({...proposal('raw'),content:'處理材料',purpose:'製作'});const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()},r=await s.post(op);assert.equal(r.status,200,await r.clone().text());let w=await s.read();assert.equal(w.events.findLast(e=>e.kind==='attempt').resolution.outcome,outcomes[index]);assert.equal(nonPhoneObjects(w)[0].lifecycle,'consumed');assert.equal(nonPhoneObjects(w).filter(o=>o.lifecycle==='active').reduce((sum,o)=>sum+o.quantity.amount,0),index<2?2:index===2?1:0);const saved=w.objects;await s.post(op);w=await s.read();assert.deepEqual(w.objects,saved);assert.equal(dice,1);assert.deepEqual(s.counts(),{npc:1,adjudication:1});}finally{Math.random=prior;s.restore();}}
});
test('an unchanged failed v3 method cannot reroll after unrelated hidden state changes or a new request ID',async()=>{
 const f=require('./routine-world-programs-fixture.cjs'),p=f.program('try-wipe','試著擦桌面','清潔桌面',[f.binding('surface','object','target',[{key:'茶漬',value:'有'}])],[],{check:{difficulty:12,ability:'清潔'},branches:[{outcomes:['critical-success','success'],effects:[],stages:[f.phase(15,[f.change('surface','茶漬','有','無')])]},{outcomes:['mixed','failure','critical-failure'],effects:[],stages:[f.phase(15,[])]}]});const s=await scenario({generic:true,adjustReply:()=>f.approval([p],'try-wipe','桌面')}),old=Math.random;let dice=0,value=.2;Math.random=()=>{dice++;return value;};
 try{const step=async()=>{const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());return s.read();};s.choose({...proposal('cup-a'),content:'試著擦桌面',purpose:'清潔桌面'});let w=await step();assert.equal(w.events.findLast(e=>e.kind==='attempt').resolution.outcome,'failure');s.reply({status:'accepted',completionMinutes:15,stages:[],branches:null,check:null,routine:null,effects:[{kind:'change-state',version:1,access:'authorized',target:{type:'object',id:'cup-a'},expectedRevision:1,exposure:'hidden',changes:[{key:'內部記號',from:null,value:'別的記號'}],reason:'與清潔結果無關的隱藏記號。'}]});s.choose({...proposal('cup-a'),content:'寫入內部記號',purpose:'外在處理'});await step();value=.99;s.choose({...proposal('cup-a'),content:'試著擦桌面',purpose:'清潔桌面'});w=await step();assert.equal(w.objects[0].state.茶漬,'有');assert.equal(dice,1);assert.deepEqual(s.counts(),{npc:3,adjudication:2});
 }finally{Math.random=old;s.restore();}
});
test('v3 refuses concrete holder and vessel identities in guards, changes and formed result state',async()=>{
 const f=require('./routine-world-programs-fixture.cjs');for(const mutate of [p=>{p.stages[0].preconditions[0].guard={region:'cafe-front',holder:{check:true,value:'owner'}};},p=>{p.stages[0].effects[0].changes=[{key:'vessel',from:null,value:'cup-a'}];},p=>{p.stages[0].effects=[{kind:'transfer',objectId:'$vessel',expectedRevision:0,toRegion:'$here',toHolder:'owner'}];},p=>{p.bindings[0].state=[{key:'vessel',value:'cup-a'}];},p=>{p.stages[0].effects=[f.form('成果','meal',[{key:'vessel',value:'cup-a',exposure:'public'}],'vessel')];}]){
 const s=await scenario({generic:true,adjustReply:reply=>{mutate(reply.routine.programs[0]);return reply;}});try{const before=await s.read(),r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,502);assert.deepEqual((await s.read()).objects,before.objects);assert.equal((await s.read()).routineRules,undefined);}finally{s.restore();}}
});
test('the same method can retain two separately confirmed subsets and freely select whichever matches the current object',async()=>{
 const s=await scenario({generic:true,objects:['cup-a','cup-b','cup-c','cup-d'].map((id,i)=>({...cup(id),state:{茶漬:i%2?'深':'有'}}))});try{const step=async()=>{const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());return s.read();};await step();const second=approval();second.routine.operation='wipe-table';second.routine.subject='桌面';second.routine.timings=[{operation:'wipe-table',minutes:15}];const p=second.routine.programs[0];p.operation='wipe-table';p.methods=[{content:'擦桌面',purpose:'清潔桌面'}];p.bindings[0].state[0].value='深';p.stages[0].preconditions[0].state[0].value='深';p.stages[0].effects[0].changes[0].from='深';s.reply(second);s.choose(s.method('cup-b'));let w=await step();assert.equal(w.routineRules.length,2);s.choose(s.method('cup-c'));w=await step();assert.equal(w.objects[2].state.茶漬,'無');s.choose(s.method('cup-d'));w=await step();assert.equal(w.objects[3].state.茶漬,'無');assert.equal(w.routineRules.length,2);assert.deepEqual(s.counts(),{npc:4,adjudication:2});}finally{s.restore();}
});
test('only a server-offered routine adjudication receives the larger output cap while NPC output stays bounded',async()=>{
 const s=await scenario({generic:true});try{const r=await s.post({operation:'advance',minutes:15,maxOutputTokens:999999});assert.equal(r.status,200);assert.equal(s.requests[0].max_completion_tokens,2048);assert.equal(s.requests[1].max_completion_tokens,12000);assert.equal(s.requests.length,2);assert.deepEqual(s.counts(),{npc:1,adjudication:1});}finally{s.restore();}
});
test('generic routine interruption and loss of physical premises preserve committed first-stage work and discard future effects',async()=>{
 const f=require('./routine-world-programs-fixture.cjs');for(const mode of ['interrupt','moved','rights']){
 const p=f.program('wipe-in-stages','慢慢清潔桌面','清潔桌面',[f.binding('surface','object','target',[{key:'茶漬',value:'有'}])],[f.phase(15,[f.change('surface','茶漬','有','無')]),f.phase(30,[f.change('surface','完成',null,'是')],[{kind:'state-condition',version:1,target:{type:'object',id:'$surface'},state:[{key:'茶漬',value:'無'}]}])]);const s=await scenario({generic:true,adjustReply:()=>f.approval([p],'wipe-in-stages','桌面')});try{s.choose({...proposal('cup-a'),content:'慢慢清潔桌面',purpose:'清潔桌面'});let r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200);let w=await s.read();assert.equal(w.objects[0].state.茶漬,'無');assert.ok(w.characters[0].plan);if(mode==='interrupt'){await s.post({operation:'intervene',target:'owner',text:'有新情況，請自行決定是否繼續'});s.choose({type:'rest',target:'',content:'先休息',mood:'平靜',durationMinutes:15,intents:[]});}else{if(mode==='moved')w.objects[0].region='cafe-storeroom';else{w.objects[0].owner='cass';w.objects[0].allowedTo=[];}store.replaceCommittedWorld(w);}r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());w=await s.read();assert.equal(w.objects[0].state.茶漬,'無');assert.equal(w.objects[0].state.完成,undefined);assert.equal(w.characters[0].plan,undefined);assert.equal(s.counts().adjudication,1);assert.deepEqual(store.snapshot().objects,w.objects);}finally{s.restore();}}
});
test('an expired lease cannot save a generic rule, fresh results or branch dice and original-ID replay never redispatches',async()=>{
 const clock=Date.now;let now=clock();Date.now=()=>now;const s=await scenario({generic:true}),transport=global.fetch;global.fetch=async(url,init)=>{const result=await transport(url,init);if(JSON.parse(JSON.parse(init.body).messages[1].content).contractVersion==='world-adjudication.v1')now+=440000;return result;};try{const before=await s.read(),op={operation:'advance',minutes:15,operationId:now+':'+crypto.randomUUID()},r=await s.post(op);assert.equal(r.status,502);const saved=await s.read();assert.deepEqual(saved.objects,before.objects);assert.equal(saved.routineRules,undefined);assert.equal(saved.freeTrials,undefined);assert.equal(saved.aiUsage.totalCalls,2);assert.equal((await s.post(op)).status,502);assert.deepEqual(s.counts(),{npc:1,adjudication:1});assert.deepEqual((await s.read()).objects,before.objects);}finally{s.restore();Date.now=clock;}
});
test('new v3 material categories cannot bypass an explicit exhausted legacy food supply in the same confirmed cafe operation',async()=>{
 const f=require('./routine-world-programs-fixture.cjs'),s=await scenario({objects:[{...cup('same-cup'),state:{contents:'empty',clean:'yes'}}],adjustWorld:w=>{delete w.characters[0].routineCapabilities;w.supplies=[{id:'last-known-tea',label:'最後一份茶葉',kind:'food',region:'cafe-front',owner:'owner',knownTo:['owner'],allowedTo:['owner'],remaining:0,initialState:{material:'tea'},consumable:false}];},adjustReply:()=>f.approval(f.cafePrograms(),'tea','茶')});try{s.choose({...proposal('same-cup'),content:'泡一杯茶',purpose:'飲用'});const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());const w=await s.read();assert.equal(w.supplies.length,1);assert.equal(w.supplies[0].id,'last-known-tea');assert.equal(nonPhoneObjects(w).length,1);assert.equal(nonPhoneObjects(w)[0].state.contents,'empty');assert.equal(w.characters[0].plan,undefined);assert.match(w.characters[0].activity,/沒有新增成果/);assert.match(w.routineAudit.at(-1).reason,/有限材料|背景不會補回/);assert.deepEqual(s.counts(),{npc:1,adjudication:1});}finally{s.restore();}
});
test('an exhausted finite cake cannot be replenished by a renamed generic food background while tea and meals remain separate',async()=>{
 const f=require('./routine-world-programs-fixture.cjs');for(const [subject,finiteLabel,shouldForm] of [['蛋糕','最後一個蛋糕',false],['茶葉','最後一個蛋糕',true]]){
 const p=f.program('prepare-food','處理這份材料','製作',[f.binding('raw','supply','local',[],{kind:'food',sourceRole:'material',sourceSubject:subject,background:f.bg('普通'+subject,'food')})],[f.phase(15,[{kind:'materialize',supplyId:'$raw',expectedRemaining:0},f.form('已處理材料','meal')])]);const s=await scenario({adjustWorld:w=>{w.supplies=[{id:'last-cake',label:finiteLabel,kind:'food',region:'cafe-front',owner:'owner',knownTo:['owner'],allowedTo:['owner'],remaining:0,initialState:{}}];},adjustReply:()=>f.approval([p],'prepare-food',subject)});try{s.choose({...proposal('cafe'),content:'處理這份材料',purpose:'製作'});const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());const w=await s.read();assert.equal(w.objects.some(o=>o.kind==='meal'),shouldForm);assert.equal(w.supplies.find(o=>o.id==='last-cake').remaining,0);assert.equal(w.supplies.length,shouldForm?2:1);assert.deepEqual(s.counts(),{npc:1,adjudication:1});}finally{s.restore();}}
});

const reviewedStock=(id,label)=>({...cup(id),label,kind:'food',state:{},quantity:{amount:1,unit:'item'},consumable:false});
test('SPEC REVIEW: reuse must not substitute cake for the confirmed tea-leaf material role',async()=>{
 const fixture=require('./routine-world-programs-fixture.cjs');
 const program=fixture.program('dry-leaf-method','把茶葉製成茶飲','飲用',[fixture.binding('raw','object','local',[],{kind:'food',sourceRole:'material',sourceSubject:'茶葉'})],[fixture.phase(15,[fixture.form('茶飲','drink',[],'raw')])]);
 const reply=fixture.approval([program],'dry-leaf-method','茶飲');
 const s=await scenario({objects:[reviewedStock('leaf-a','一份茶葉')],adjustReply:()=>reply});
 try{
  const action={...proposal('cafe'),content:'把茶葉製成茶飲',purpose:'飲用'};
  s.choose(action);let r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());
  let w=await s.read();assert.equal(w.objects.find(o=>o.id==='leaf-a').lifecycle,'consumed');
  w.objects.push(reviewedStock('cake-a','最後一份蛋糕'));store.replaceCommittedWorld(w);
  s.choose(action);r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());
  w=await s.read();
  assert.equal(w.objects.find(o=>o.id==='cake-a').lifecycle,'active','Confirmed tea method unexpectedly consumed cake');
 }finally{s.restore();}
});

test('SPEC REVIEW: exhausted explicit concrete timber cannot be silently replenished by routine background',async()=>{
 const fixture=require('./routine-world-programs-fixture.cjs');
 const program=fixture.program('shape-stock','把最後木料製成零件','製作零件',[fixture.binding('raw','object','local',[],{kind:'timber',sourceRole:'material',sourceSubject:'木料',background:{label:'普通木料',kind:'timber',consumable:false,quantity:{amount:1,unit:'item'},initialState:[]}})],[fixture.phase(15,[{kind:'materialize',supplyId:'$raw-supply',expectedRemaining:0},fixture.form('木製零件','component',[],'raw')])]);
 const reply=fixture.approval([program],'shape-stock','木製零件');
 const s=await scenario({objects:[{...reviewedStock('last-timber','最後一份木料'),kind:'timber'}],adjustReply:()=>reply});
 try{
  const action={...proposal('cafe'),content:'把最後木料製成零件',purpose:'製作零件'};
  s.choose(action);let r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());
  let w=await s.read();assert.equal(w.objects.find(o=>o.id==='last-timber').lifecycle,'consumed');
  s.choose(action);r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());
  w=await s.read();
  assert.equal(w.objects.filter(o=>o.kind==='component').length,1,'Background replenished exhausted explicit timber');assert.equal(w.routineAudit.at(-1).result,'blocked');assert.match(w.routineAudit.at(-1).reason,/背景不會補回/);assert.deepEqual(s.counts(),{npc:2,adjudication:1});
 }finally{s.restore();}
});

test('a known finite source carried away and left behind cannot be replaced by ordinary background after returning',async()=>{
 for(const destination of ['cafe-storeroom','kris-home']){
  const f=require('./routine-world-programs-fixture.cjs'),p=f.program('shape-stock','把木料製成零件','製作零件',[f.binding('raw','object','local',[],{kind:'timber',sourceRole:'material',sourceSubject:'木料',background:f.bg('普通木料','timber')})],[f.phase(15,[{kind:'materialize',supplyId:'$raw-supply',expectedRemaining:0},f.form('木製零件','component',[],'raw')])]);
  const reply=f.approval([p],'shape-stock','零件'),s=await scenario({objects:[{...reviewedStock('finite-timber','這是現有木料'),kind:'timber',quantity:{amount:2,unit:'item'}}],adjustReply:()=>reply});
  try{
   const shape={...proposal('cafe'),content:'把木料製成零件',purpose:'製作零件'};
   let lastReceipt;const advance=async action=>{s.choose(action);const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());lastReceipt=(await r.clone().json()).operationEvidence;return s.read();};
   let w=await advance(shape);assert.deepEqual(lastReceipt.result.rules.find(rule=>rule.version===3).finiteSourceBindings,[{operation:'shape-stock',roles:['raw']}]);assert.equal(w.objects.find(o=>o.id==='finite-timber').quantity.amount,1);
   w=await advance({...proposal(destination),type:'move',content:'',purpose:undefined});
   const timber=w.objects.find(o=>o.id==='finite-timber');assert.notEqual(timber.region,'cafe-front');
   s.reply({status:'accepted',completionMinutes:15,effects:[{kind:'physical',version:1,operation:'place',objectId:timber.id,expectedRevision:timber.revision,reason:'把當前持有的木料留在此處。'}],check:null});
   await advance({...proposal(timber.id),content:'放下手上木料',purpose:'放下'});
   await advance({...proposal('cafe-front'),type:'move',content:'',purpose:undefined});s.reply(reply);
   w=await advance(shape);assert.deepEqual(lastReceipt.result.rules.find(rule=>rule.version===3).finiteSourceBindings,[{operation:'shape-stock',roles:['raw']}]);assert.equal(w.objects.filter(o=>o.kind==='component').length,1,'Known finite material was replaced after moving it away');assert.equal(w.supplies?.length||0,0);assert.equal(w.objects.find(o=>o.id===timber.id).holder,null);assert.deepEqual(store.snapshot().objects,w.objects);assert.equal(JSON.stringify(s.inputs.filter(input=>input.contractVersion!=='world-adjudication.v1')).includes('finiteSourceBindings'),false);
  }finally{s.restore();}
 }
});

test('the actual consume adjudication prompt and saved outcome honor explicit consumable for a new pastry kind',async()=>{
 const s=await scenario({objects:[{...reviewedStock('pastry','一份新糕點'),kind:'pastry',consumable:true}],adjustReply:()=>({status:'accepted',completionMinutes:15,effects:[{kind:'consume',objectId:'pastry',expectedRevision:1}],check:null})});
 try{s.choose({...proposal('pastry'),content:'品嘗這份糕點',purpose:'食用'});const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());const w=await s.read();assert.equal(w.objects[0].lifecycle,'consumed');const instruction=s.inputs.find(input=>input.contractVersion==='world-adjudication.v1').effectRules.find(rule=>rule.startsWith('consume：'));assert.match(instruction,/consumable/);assert.match(instruction,/缺.*food/);assert.doesNotMatch(instruction,/僅 food/);assert.deepEqual(store.snapshot().objects,w.objects);}finally{s.restore();}
});

test('a real new formed source restores a finite material method without background replenishment or another routine approval',async()=>{
 const f=require('./routine-world-programs-fixture.cjs'),p=f.program('shape-stock','把木料製成零件','製作零件',[f.binding('raw','object','local',[],{kind:'timber',sourceRole:'material',sourceSubject:'木料',background:f.bg('普通木料','timber')})],[f.phase(15,[{kind:'materialize',supplyId:'$raw-supply',expectedRemaining:0},f.form('木製零件','component',[],'raw')])]);
 const reply=f.approval([p],'shape-stock','零件'),s=await scenario({objects:[{...reviewedStock('last-timber','最後一份木料'),kind:'timber'},{...reviewedStock('new-branch','另一份樹枝'),kind:'branch'}],adjustReply:()=>reply});
 try{
  const shape={...proposal('cafe'),content:'把木料製成零件',purpose:'製作零件'},advance=async action=>{s.choose(action);const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());return s.read();};
  await advance(shape);let w=await advance(shape);assert.equal(w.objects.filter(o=>o.kind==='component').length,1);assert.deepEqual(s.counts(),{npc:2,adjudication:1});
  s.reply({status:'accepted',completionMinutes:15,check:null,effects:[{kind:'form',version:1,operation:'transform',access:'authorized',inputs:[{objectId:'new-branch',expectedRevision:1,quantity:{amount:1,unit:'item'},disposition:'consumed'}],outputs:[{id:'fresh-timber',label:'新取得木料',kind:'timber',consumable:false,quantity:{amount:1,unit:'item'},state:[]}],reason:'把確實存在的另一份樹枝鋸成木料。'}]});
  w=await advance({...proposal('new-branch'),content:'鋸開這份樹枝作木料',purpose:'準備材料'});assert.equal(w.objects.find(o=>o.id==='new-branch').lifecycle,'consumed');s.reply(reply);
  w=await advance(shape);assert.equal(w.objects.filter(o=>o.kind==='component').length,2);assert.equal(w.objects.find(o=>o.id==='fresh-timber').lifecycle,'consumed');assert.equal(w.supplies?.length||0,0);assert.deepEqual(s.counts(),{npc:4,adjudication:2});assert.ok(w.objects.find(o=>o.id==='fresh-timber').sources.some(source=>source.id==='new-branch'));assert.deepEqual(store.snapshot().objects,w.objects);
 }finally{s.restore();}
});

test('a destroyed finite source stays destroyed while unrelated stock at another place does not forbid confirmed local background',async()=>{
 const f=require('./routine-world-programs-fixture.cjs'),p=f.program('shape-stock','把木料製成零件','製作零件',[f.binding('raw','object','local',[],{kind:'timber',sourceRole:'material',sourceSubject:'木料',background:f.bg('普通木料','timber')})],[f.phase(15,[{kind:'materialize',supplyId:'$raw-supply',expectedRemaining:0},f.form('木製零件','component',[],'raw')])]);
 for(const mode of ['destroyed','other-place']){
  const stock={...reviewedStock('known-timber','一份已知木料'),kind:'timber',...(mode==='other-place'?{region:'kris-home-main',holder:null}:{quantity:{amount:2,unit:'item'}})},reply=f.approval([p],'shape-stock','零件'),s=await scenario({objects:[stock],adjustReply:()=>reply});
  try{
   const shape={...proposal('cafe'),content:'把木料製成零件',purpose:'製作零件'},advance=async action=>{s.choose(action);const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());return s.read();};
   let w=await advance(shape);assert.equal(w.objects.filter(o=>o.kind==='component').length,1);
   if(mode==='destroyed'){
    const timber=w.objects.find(o=>o.id==='known-timber');s.reply({status:'accepted',completionMinutes:15,effects:[{kind:'physical',version:1,operation:'destroy',objectId:timber.id,expectedRevision:timber.revision,reason:'這次外在活動損毀剩下的木料。'}],check:null});
    await advance({...proposal(timber.id),content:'損毀剩下木料',purpose:'破壞'});s.reply(reply);w=await advance(shape);assert.equal(w.objects.find(o=>o.id===timber.id).lifecycle,'destroyed');assert.equal(w.objects.filter(o=>o.kind==='component').length,1);assert.equal(w.supplies?.length||0,0);assert.deepEqual(s.counts(),{npc:3,adjudication:2});
   }else{assert.equal(w.objects.find(o=>o.id==='known-timber').lifecycle,'active');assert.equal(w.supplies.length,1);assert.deepEqual(s.counts(),{npc:1,adjudication:1});}
   assert.deepEqual(store.snapshot().objects,w.objects);
  }finally{s.restore();}
 }
});

test('an unrelated concrete cake does not block newly confirmed ordinary tea-leaf background',async()=>{
 const f=require('./routine-world-programs-fixture.cjs'),p=f.program('prepare-tea','用普通茶葉製成茶飲','飲用',[f.binding('raw','object','local',[],{kind:'food',sourceRole:'material',sourceSubject:'茶葉',background:f.bg('普通茶葉','food')})],[f.phase(15,[{kind:'materialize',supplyId:'$raw-supply',expectedRemaining:0},f.form('一份茶飲','drink',[],'raw')])]);
 const s=await scenario({objects:[reviewedStock('unrelated-cake','最後一份蛋糕')],adjustReply:()=>f.approval([p],'prepare-tea','茶葉')});try{s.choose({...proposal('cafe'),content:'用普通茶葉製成茶飲',purpose:'飲用'});const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());const w=await s.read();assert.equal(w.objects.filter(o=>o.kind==='drink').length,1);assert.equal(w.objects.find(o=>o.id==='unrelated-cake').lifecycle,'active');assert.deepEqual(s.counts(),{npc:1,adjudication:1});assert.deepEqual(store.snapshot().objects,w.objects);}finally{s.restore();}
});

test('physical material binding preserves finite supply ownership while normalizing symbolic remaining',async()=>{
 const f=require('./routine-world-programs-fixture.cjs'),forming=f.form('一份茶飲','drink');forming.access='physical';
 const p=f.program('physical-tea','擅用眼前茶葉製成茶飲','飲用',[f.binding('raw','supply','local',[],{kind:'food',access:'physical',sourceRole:'material',sourceSubject:'茶葉'})],[f.phase(15,[{kind:'physical',version:1,operation:'materialize',supplyId:'$raw',expectedRemaining:0,reason:'自行取用眼前茶葉，沒有取得物主許可。'},forming])]);
 const s=await scenario({objects:[],adjustWorld:w=>{w.supplies=[{id:'owned-leaf',label:'最後一份茶葉',kind:'food',region:'cafe-front',owner:'cass',knownTo:['owner'],allowedTo:['cass'],remaining:1,initialState:{},quantity:{amount:1,unit:'item'},consumable:false}];},adjustReply:()=>f.approval([p],'physical-tea','茶葉')});
 try{s.choose({...proposal('cafe'),content:'擅用眼前茶葉製成茶飲',purpose:'飲用'});const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());const w=await s.read();assert.equal(w.objects.filter(o=>o.kind==='drink').length,1);assert.equal(w.supplies[0].remaining,0);assert.deepEqual(w.supplies[0].allowedTo,['cass']);assert.equal(w.supplies.length,1);assert.equal(w.objects.find(o=>o.kind==='food').owner,'cass');assert.ok(w.objects.find(o=>o.kind==='food').unpermittedCount>0);assert.deepEqual(store.snapshot().objects,w.objects);}finally{s.restore();}
});

test('confirmed method alias pairs rebind current objects after SQLite reload without another adjudication',async()=>{
 const s=await scenario({objects:['cup-a','cup-b','cup-c'].map(cup),adjustReply:reply=>{reply.routine.programs[0].methods[0].aliases=[{content:'洗淨這個杯子',purpose:'清潔杯子'},{content:'清洗杯子',purpose:'清潔'}];return reply;}});
 try{
  const advance=async action=>{s.choose(action);const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());return s.read();};
  let w=await advance(proposal('cup-a'));
  w=await advance({...proposal('cup-b'),content:'洗淨這個杯子',purpose:'清潔杯子'});
  assert.equal(w.objects.find(o=>o.id==='cup-b').state.茶漬,'無');
  w=await advance({...proposal('cup-c'),purpose:'清潔'});
  assert.equal(w.objects.find(o=>o.id==='cup-c').state.茶漬,'無');
  assert.deepEqual(s.counts(),{npc:3,adjudication:1});
  const input=s.inputs.filter(x=>x.contractVersion==='npc-decision.v2').at(-1);
  assert.ok(input.knownMethods.some(method=>method.content==='洗淨這個杯子'&&method.purpose==='清潔杯子'));
  assert.equal(w.objects.find(o=>o.id==='cup-a').revision,2,'reusing another target must not replay the old effect');
 }finally{s.restore();}
});

test('same drink wording with confirmed 飲用 or 喝茶 purposes consumes the new target without another adjudication',async()=>{
 const f=require('./routine-world-programs-fixture.cjs'),p=f.cafePrograms().find(p=>p.operation==='drink');
 p.methods=[{content:'喝茶',purpose:'飲用',aliases:[{content:'喝茶',purpose:'喝茶'},{content:'飲用這杯茶',purpose:'解渴'}]}];
 const objects=['a','b','c'].flatMap(id=>[{...cup('cup-'+id),state:{contents:'tea'}},{id:'tea-'+id,label:'這杯茶',kind:'drink',consumable:true,source:'fixture-tea',revision:1,lifecycle:'active',region:'cafe-front',holder:'owner',owner:'owner',knownTo:['owner'],allowedTo:['owner'],state:{vessel:'cup-'+id,beverage:'tea'}}]);
 const s=await scenario({objects,adjustWorld:w=>{w.characters[0].routineCapabilities=['drink'];},adjustReply:()=>f.approval([p],'drink','茶')});
 try{
  const advance=async(target,purpose,content='喝茶')=>{s.choose({...proposal(target),content,purpose});const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());return s.read();};
  await advance('cup-a','飲用');let w=await advance('cup-b','喝茶');
  assert.equal(w.objects.find(o=>o.id==='tea-b').lifecycle,'consumed');assert.equal(w.objects.find(o=>o.id==='cup-b').state.contents,'empty');
  assert.deepEqual(s.counts(),{npc:2,adjudication:1});
  const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};
  s.choose({...proposal('cup-c'),content:'飲用這杯茶',purpose:'解渴'});assert.equal((await s.post(op)).status,200);const saved=await s.read();assert.equal(saved.objects.find(o=>o.id==='tea-c').lifecycle,'consumed');assert.equal((await s.post(op)).status,200);assert.deepEqual(s.counts(),{npc:3,adjudication:1});assert.deepEqual((await s.read()).objects,saved.objects);
  assert.equal(s.inputs.filter(x=>x.contractVersion==='npc-decision.v2').at(-1).objects.some(o=>o.id==='tea-a'),false);
 }finally{s.restore();}
});

test('alias purpose pairs do not cross-expand and old methods do not gain new scope on read',async()=>{
 for(const aliases of [undefined,[{content:'洗淨這個杯子',purpose:'清潔杯子'}]]){
  const s=await scenario({adjustReply:reply=>{if(aliases)reply.routine.programs[0].methods[0].aliases=aliases;return reply;}});
  try{
   const advance=async()=>{const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());return s.read();};
   await advance();s.choose({...proposal('cup-b'),purpose:aliases?'清潔杯子':'清潔'});s.reply({status:'denied',effects:[],check:null});
   const w=await advance();assert.equal(w.objects.find(o=>o.id==='cup-b').state.茶漬,'有');assert.deepEqual(s.counts(),{npc:2,adjudication:2});
   assert.equal(w.routineRules[0].programs[0].methods[0].aliases===undefined,!aliases);
   s.choose({...proposal('cup-b'),purpose:'泡茶'});const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};assert.equal((await s.post(op)).status,200);assert.equal((await s.read()).objects.find(o=>o.id==='cup-b').state.茶漬,'有');assert.deepEqual(s.counts(),{npc:3,adjudication:3});
   const detail=await(await GET(new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(op.operationId)))).json();
   assert.ok(detail.decisionTrace.steps.some(step=>step.kind==='rule-selection'&&step.data.check==='method'&&step.data.wording===true&&step.data.purpose===false),'contradictory purpose must retain a method mismatch in observer trace');
   assert.ok(s.inputs.filter(input=>input.contractVersion==='npc-decision.v2').every(input=>!JSON.stringify(input).includes('rule-selection')));
  }finally{s.restore();}
 }
});

test('invalid or oversized alias scopes roll back instead of broadening a known method',async()=>{
 for(const aliases of [[{content:'洗杯',purpose:''}],Array.from({length:5},()=>({content:'洗杯',purpose:'清洗'})),[{content:'洗杯',purpose:'清洗',target:'cup-b'}]]){
  const s=await scenario({adjustReply:reply=>{reply.routine.programs[0].methods[0].aliases=aliases;return reply;}});
  try{const before=await s.read(),r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,502);const w=await s.read();assert.deepEqual(w.objects,before.objects);assert.equal(w.routineRules,undefined);assert.deepEqual(s.counts(),{npc:1,adjudication:1});}finally{s.restore();}
 }
});
