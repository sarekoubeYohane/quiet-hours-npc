/* eslint-disable @typescript-eslint/no-require-imports -- T5 shared upsert+assess extension integration target, not yet in the T6 default test list. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {seedWorld}=load('world'),{GET,POST}=load('route'),store=load('store');
const {decision,candidate,adoption,choose}=require('./pursuit-selection-fixture.cjs');
const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:`${Date.now()}:${crypto.randomUUID()}`,mode:'openai',model:'gpt-6-luna',...body})}));
for(const reverse of [false,true])test(`new autonomous pursuit can be explicitly waiting and linked in one decision, ${reverse?'assess before upsert':'upsert before assess'}`,async()=>{
 const w=seedWorld();w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'fixture-judge'};store.install(w);await post({operation:'set-model-key',key:'fixture-key'});
 const original=global.fetch;let calls=0;
 global.fetch=async(_url,init)=>{calls++;const input=JSON.parse(JSON.parse(init.body).messages[1].content),v=decision(input);
  if(calls===1){const p=candidate('owner','tea','保留之後飲茶的方向');v.pursuitCandidates=[p];const create=adoption(input,p,'owner:tea'),assess={operation:'assess',id:'owner:tea',version:0,node:{status:'active',progress:'waiting',basis:{kind:'subjective',text:'我願意承接，但先等一等'}},references:[],reason:'這次明示先等待'};v.pursuitUpdates=reverse?[assess,create]:[create,assess];v.pursuitSelection.adoptions=[{candidateId:p.id,pursuitId:'owner:tea'}];choose(v,{kind:'candidate',id:p.id,version:0},'owner:tea');v.arrangementUpdates=[{operation:'upsert',id:'later-tea',version:0,text:'之後再考慮喝茶',condition:{kind:'time',minute:w.minute+60},references:[{kind:'short',id:input.self.shortTerm[0].id,version:input.self.shortTerm[0].version}],reason:'自己選擇稍後再想',pursuit:{id:'owner:tea',version:0}}];}
  else {const node=input.self.intents.find(n=>n.id==='owner:tea');assert.equal(node.progress,'waiting');assert.equal(node.version,2);assert.equal(input.self.arrangements.items[0].pursuit.version,2);choose(v,{kind:'existing',id:node.id,version:node.version});}
  return Response.json({usage:{prompt_tokens:30,completion_tokens:20},choices:[{message:{content:JSON.stringify(v)}}]});};
 try{const r=await post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());assert.equal((await post({operation:'advance',minutes:15})).status,200);const saved=(await(await GET()).json()).world.characters[0];assert.equal(saved.intents.find(n=>n.id==='owner:tea').progress,'waiting');assert.equal(saved.arrangements.items[0].pursuit.version,2);assert.equal(calls,2);}finally{global.fetch=original;}
});
