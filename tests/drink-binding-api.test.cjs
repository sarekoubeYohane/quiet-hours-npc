/* eslint-disable @typescript-eslint/no-require-imports -- Explicit model and saved-world fixtures. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const f=require('./routine-world-programs-fixture.cjs');
const opid=()=>Date.now()+':'+crypto.randomUUID();
const item=(id,kind,state,lifecycle='active')=>({id,kind,state,lifecycle,label:kind==='drink'?'茶':'杯子',source:'fixture',region:'cafe-front',holder:'owner',owner:'owner',revision:1,consumable:kind==='drink',quantity:{amount:lifecycle==='active'?1:0,unit:'item'},knownTo:['owner'],allowedTo:['owner']});
function drinkProgram(target='tea',direction='from-role',minutes=15){
 const bindings=target==='tea'?[f.binding('drink','object','target',[{key:'beverage',value:'tea'}],{kind:'drink'}),f.binding('vessel','object','linked',[{key:'contents',value:'tea'}],{kind:'utensil',link:{role:'drink',key:'vessel',direction}})]:[f.binding('vessel','object','target',[{key:'contents',value:'tea'}],{kind:'utensil'}),f.binding('drink','object','linked',[{key:'beverage',value:'tea'}],{kind:'drink',link:{role:'vessel',key:'vessel',...(direction?{direction}:{})}})];
 return f.program('drink-serving','喝這杯茶','飲用',bindings,[f.phase(minutes,[{kind:'ingest',version:1,objectId:'$drink',expectedRevision:0,hungerRelief:0,thirstRelief:15},f.change('vessel','contents','tea','empty')])]);
}
async function scenario(program,prepare=()=>{}){
 const w=seedWorld();w.contextId='drink-binding-fixture';w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'fixture-judge'};w.objects=[item('old-cup','utensil',{contents:'empty'}),item('old-tea','drink',{vessel:'old-cup',beverage:'tea'},'consumed'),item('cup','utensil',{contents:'tea'}),item('tea','drink',{vessel:'cup',beverage:'tea'})];prepare(w);store.install(w);
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:opid(),worldContext:w.contextId,mode:'openai',model:'gpt-6-luna',...body})}));
 await post({operation:'set-model-key',key:'fixture-key'});const old=global.fetch,inputs=[],requests=[];let npc=0,judgments=0;let decision={type:'propose',target:program.bindings[0].role==='drink'?'tea':'cup',content:'喝這杯茶',purpose:'飲用',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'completion',maxMinutes:null}};
 global.fetch=async(_url,init)=>{const request=JSON.parse(init.body),input=JSON.parse(request.messages[1].content);requests.push(request);inputs.push(input);let value;if(input.contractVersion==='world-adjudication.v1'){judgments++;value=f.approval([program],'drink-serving','茶');}else{npc++;value=decision;}return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});};
 return{post,inputs,requests,read:async()=>(await(await GET()).json()).world,choose:v=>{decision=v;},counts:()=>({npc,judgments}),restore:()=>{global.fetch=old;}};
}
async function advance(s,extra={}){const r=await s.post({operation:'advance',minutes:15,...extra});assert.equal(r.status,200,await r.clone().text());return s.read();}
test('人工最小反例：從茶的 vessel 找真正杯子，完整攝取保存且下一次決策收到本人結果',async()=>{
 const s=await scenario(drinkProgram());try{const body={operationId:opid()};const w=await advance(s,body);assert.equal(w.objects.find(o=>o.id==='tea').lifecycle,'consumed');assert.equal(w.objects.find(o=>o.id==='cup').state.contents,'empty');assert.equal(w.objects.find(o=>o.id==='old-cup').revision,1);assert.equal(w.characters[0].needs.values.thirst,6.5);assert.deepEqual(store.snapshot().objects,w.objects);await advance(s,body);assert.deepEqual(s.counts(),{npc:1,judgments:1});s.choose({type:'reflect',target:'',content:'想想剛才',mood:'平靜',durationMinutes:15,intents:[]});await advance(s);assert.match(JSON.stringify(s.inputs.at(-1)),/喝這杯茶/);assert.equal((await s.read()).objects.filter(o=>o.kind==='utensil'&&o.lifecycle==='active').length,2);}finally{s.restore();}
});
module.exports={scenario,drinkProgram,advance,item};
test('舊方向與明示 to-role 均從杯子找茶，不因同名舊杯改動身份',async()=>{
 for(const direction of [null,'to-role']){const s=await scenario(drinkProgram('cup',direction));try{const w=await advance(s);assert.equal(w.objects.find(o=>o.id==='tea').lifecycle,'consumed');assert.equal(w.objects.find(o=>o.id==='cup').state.contents,'empty');assert.equal(w.objects.find(o=>o.id==='old-cup').revision,1);}finally{s.restore();}}
});
test('歧義杯中內容物不能以第一件物件執行，accepted 不等於攝取',async()=>{
 const s=await scenario(drinkProgram('cup','to-role'),w=>w.objects.push(item('second-tea','drink',{vessel:'cup',beverage:'tea'})));try{const w=await advance(s);assert.ok(w.objects.filter(o=>o.kind==='drink'&&o.id!=='old-tea').every(o=>o.lifecycle==='active'));assert.equal(w.characters[0].needs.values.thirst,21.5);assert.equal(w.objects.find(o=>o.id==='cup').state.contents,'tea');assert.equal(w.characters[0].plan,undefined);}finally{s.restore();}
});
test('人工未宣告角色：條件不能引用同階段稍後才形成的成果，格式錯誤共同回復',async()=>{
 const p=drinkProgram();p.stages[0]=f.phase(15,[{kind:'separate',version:1,access:'authorized',objectId:'$drink',expectedRevision:0,quantity:{amount:1,unit:'ml'},outputId:'$portion',reason:'fixture'}],[{kind:'state-condition',version:1,target:{type:'object',id:'$portion'},state:[{key:'beverage',value:'tea'}]}]);
 const s=await scenario(p,w=>{w.objects.find(o=>o.id==='tea').quantity={amount:100,unit:'ml'};});try{const before=await s.read(),body={operation:'advance',minutes:15,operationId:opid()},r=await s.post(body);assert.equal(r.status,502);const data=await r.json();assert.match(data.error,/日常條件引用未宣告角色/);assert.deepEqual((await s.read()).objects,before.objects);const calls=s.counts();await s.post(body);assert.deepEqual(s.counts(),calls);}finally{s.restore();}
});
test('整杯活動綁定後尚未完成不消耗，只有真正到期提交才恢復需求',async()=>{
 const s=await scenario(drinkProgram('tea','from-role',30));try{let w=await advance(s);assert.equal(w.objects.find(o=>o.id==='tea').lifecycle,'active');assert.equal(w.characters[0].needs.values.thirst,21.5);assert.ok(w.characters[0].plan);assert.match(JSON.stringify(s.requests[1].response_format),/from-role/);assert.match(JSON.stringify(s.requests[1].messages),/先前角色.state\[key\]/);w=await advance(s);assert.equal(w.objects.find(o=>o.id==='tea').lifecycle,'consumed');assert.equal(w.characters[0].needs.values.thirst,8);assert.deepEqual(s.counts(),{npc:1,judgments:1});}finally{s.restore();}
});
test('缺失或錯誤關聯及未獲許可不留下攝取或假恢復',async()=>{
 for(const mode of ['missing','wrong','permission']){const s=await scenario(drinkProgram(),w=>{if(mode==='missing')delete w.objects.find(o=>o.id==='tea').state.vessel;else if(mode==='wrong')w.objects.find(o=>o.id==='tea').state.vessel='old-cup';else{w.objects.find(o=>o.id==='cup').owner='cass';w.objects.find(o=>o.id==='cup').allowedTo=[];}});try{const w=await advance(s);assert.equal(w.objects.find(o=>o.id==='tea').lifecycle,'active');assert.equal(w.characters[0].needs.values.thirst,21.5);assert.equal(w.characters[0].plan,undefined);}finally{s.restore();}}
});
test('保存衝突或較後角色格式錯誤共同回復整杯攝取，原操作重送不派送',async()=>{
 for(const mode of ['conflict','later']){const s=await scenario(drinkProgram(),w=>{if(mode==='later')w.characters.push(seedWorld().characters.find(c=>c.id==='cass'));});try{if(mode==='conflict')store.conflictOnNextSave();else{const transport=global.fetch;global.fetch=async(url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);if(input.self?.id==='cass')return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:'{}'}}]});return transport(url,init);};}const before=await s.read(),body={operation:'advance',minutes:15,operationId:opid()},r=await s.post(body);assert.equal(r.status,502);let w=await s.read();assert.deepEqual(w.objects,before.objects);assert.equal(w.characters[0].needs,undefined);assert.equal(w.routineRules,undefined);const calls=s.counts();await s.post(body);w=await s.read();assert.deepEqual(w.objects,before.objects);assert.deepEqual(s.counts(),calls);}finally{s.restore();}}
});
test('綁定後的必要容器關聯改變，尚未發生的飲用不套用舊綁定',async()=>{
 const s=await scenario(drinkProgram('tea','from-role',30));try{await advance(s);const saved=store.snapshot();saved.objects.find(o=>o.id==='tea').state.vessel='old-cup';saved.objects.find(o=>o.id==='tea').revision++;store.replaceCommittedWorld(saved);const w=await advance(s);assert.equal(w.objects.find(o=>o.id==='tea').lifecycle,'active');assert.equal(w.objects.find(o=>o.id==='cup').state.contents,'tea');assert.equal(w.characters[0].needs.values.thirst,23);}finally{s.restore();}
});
