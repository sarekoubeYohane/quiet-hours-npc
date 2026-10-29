/* eslint-disable @typescript-eslint/no-require-imports -- Public API transport fixture. */
const {fixtureDecision}=require('./pursuit-fixture.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const build=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,`${n}.cjs`));
const {seedWorld}=build('world'),{GET,POST}=build('route'),store=build('store');
const req=body=>new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:`${Date.now()}:${crypto.randomUUID()}`,mode:'demo',...body})});
const read=async()=>(await(await GET()).json()).world;
async function withModel(choose,run){const old=global.fetch,inputs=[];global.fetch=async(_u,init)=>{const body=JSON.parse(init.body),input=JSON.parse(body.messages[1].content);if(input.contractVersion==='world-adjudication.v1'){inputs.push(input);return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(init.body).messages[1].content),{status:'accepted',effects:[],stages:[],check:null,routine:null,completionMinutes:480,bodyActivity:{version:1,kind:'sleep',fatiguePerHour:-6,sleepPerHour:-14}}))}}]});}inputs.push(input);return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(init.body).messages[1].content),{type:'rest',target:'',content:'',mood:'平靜',durationMinutes:15,intents:[],attentionConditions:[],memorySelections:[],cognitiveUpdates:[],interpretation:'',...choose(input)}))}}]});};try{await POST(req({operation:'set-model-key',mode:'openai',key:'test-key'}));await POST(req({operation:'set-budget',limits:{calls:100,tokens:1000000}}));await run(inputs,b=>POST(req({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15,...b})));}finally{global.fetch=old;}}
const op=(input,p)=>({type:'phone',target:input.phones.find(d=>d.owner===input.self.id)?.objectId,content:JSON.stringify(fixtureDecision(input,{collection:'calendar',...p}))});
test('正常手機行動完整建立、列出、閱讀、修改及刪除行事曆，原文與真正讀者SQLite重讀一致',async()=>{
 const w=seedWorld();w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'gpt-6-luna'};store.install(w);let stage=0;
 const commands=[{operation:'create',id:'appointment',version:0,text:'稍後考慮談茶，還沒有答應。'},{operation:'list'},{operation:'read',id:'appointment',version:1},{operation:'update',id:'appointment',version:1,text:'明天再考慮談茶。'},{operation:'delete',id:'appointment',version:2}];
 await withModel(input=>op(input,commands[stage]),async(inputs,advance)=>{
  for(stage=0;stage<5;stage++){assert.equal((await advance()).status,200);const saved=await read(),d=saved.phones.devices[0];assert.equal(d.calendar.length,stage===4?0:1);if(stage===2)assert.equal(d.calendar[0].readers[0].actorId,'owner');assert.deepEqual(saved.characters[0].intents.filter(node=>node.kind!=='direction'),[]);assert.equal(saved.characters[0].arrangements,undefined);}
  assert.equal(inputs.length,5);
 });
});
test('行事曆可不設提醒；設定／延期／取消提醒有版本，通知不閱讀正文或完成安排',async()=>{
 const w=seedWorld();w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'gpt-6-luna'};store.install(w);let stage=0;const old=Math.random;Math.random=()=>0.8;
 try{await withModel(input=>stage===0?op(input,{operation:'create',id:'timed',version:0,text:'PRIVATE_CALENDAR_TEXT',condition:{kind:'time',minute:0}}):stage===1?op(input,{operation:'reminder',id:'timed',version:1,condition:{kind:'time',minute:w.minute+45}}):stage===3?op(input,{operation:'reminder',id:'timed',version:2,condition:{kind:'time',minute:w.minute+75}}):stage===5?op(input,{operation:'reminder',id:'timed',version:3,condition:null}):{},async(inputs,advance)=>{
  for(stage=0;stage<7;stage++){
   assert.equal((await advance()).status,200);const saved=await read(),device=saved.phones.devices[0],record=device.calendar[0];assert.equal(record.readers.length,0);assert.deepEqual(saved.characters[0].intents.filter(node=>node.kind!=='direction'),[]);assert.equal(saved.characters[0].arrangements,undefined);
   if(stage===0)assert.equal(device.notifications,undefined);
   if(stage===2||stage===3)assert.equal(device.notifications.length,1);
   if(stage>=4)assert.equal(device.notifications.length,2);
   if(stage>=5){assert.equal(record.reminder.enabled,false);assert.ok(device.notifications.every(n=>n.cancelledAt!==undefined));}
   assert.ok(saved.events.filter(e=>e.kind==='phone-notification').every(e=>!JSON.stringify(e).includes('PRIVATE_CALENDAR_TEXT')));
  }
  assert.equal(inputs.length,7);assert.equal(inputs[2].self.noticeOpportunities.length,1);assert.equal(inputs[4].self.noticeOpportunities.length,1);
 });}finally{Math.random=old;}
});
test('文字改寫不重響同提醒；真正讀取才取得外部條件與未讀正文',async()=>{
 const w=seedWorld();w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'gpt-6-luna'};store.install(w);let stage=0;const old=Math.random;Math.random=()=>0.8;
 try{await withModel(input=>stage===0?op(input,{operation:'create',id:'same',version:0,text:'OLD_CALENDAR_ORIGINAL',condition:{kind:'time',minute:0},reminder:true}):stage===2?op(input,{operation:'update',id:'same',version:1,text:'NEW_CALENDAR_ORIGINAL'}):stage===4?op(input,{operation:'read',id:'same',version:2}):{},async(inputs,advance)=>{
  for(stage=0;stage<6;stage++)assert.equal((await advance()).status,200);const saved=await read(),d=saved.phones.devices[0];assert.equal(d.notifications.length,1);assert.equal(d.calendar[0].text,'NEW_CALENDAR_ORIGINAL');assert.equal(d.calendar[0].readers[0].version,2);assert.ok(inputs[5].self.shortTerm.some(m=>m.text.includes('NEW_CALENDAR_ORIGINAL')));assert.ok(inputs[5].self.shortTerm.some(m=>m.text.includes('行事曆條件')));assert.equal(saved.events.filter(e=>e.kind==='phone-notification').length,1);
 });}finally{Math.random=old;}
});
test('行事曆可連結本次真正可見安排；取消提醒與刪外部紀錄不放下或刪內在安排',async()=>{
 const w=seedWorld();w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'gpt-6-luna'};store.install(w);let stage=0;
 await withModel(input=>stage===0?{arrangementUpdates:[{operation:'upsert',id:'my-plan',version:0,text:'以後想談茶',condition:{kind:'time',minute:w.minute+300},references:[{kind:'short',id:input.self.shortTerm[0].id,version:input.self.shortTerm[0].version}],reason:'我自己的未來打算'}]}:op(input,[null,{operation:'create',id:'linked',version:0,text:'外部精確安排',arrangement:{id:'my-plan',version:1},condition:{kind:'time',minute:w.minute+300},reminder:true},{operation:'reminder',id:'linked',version:1,condition:null},{operation:'delete',id:'linked',version:2}][stage]),async(inputs,advance)=>{
  for(stage=0;stage<4;stage++)assert.equal((await advance()).status,200);const saved=await read();assert.equal(saved.phones.devices[0].calendar.length,0);assert.equal(saved.characters[0].arrangements.items[0].status,'active');assert.deepEqual(saved.characters[0].intents.filter(node=>node.kind!=='direction'),[]);
 });
});
test('遺忘內在原文後，手機提醒不補正文；主動列表與閱讀才重新取得精確外部紀錄',async()=>{
 const w=seedWorld();w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'gpt-6-luna'};store.install(w);let stage=0;
 await withModel(input=>stage===0?op(input,{operation:'create',id:'external',version:0,text:'PRECISE_EXTERNAL_AFTER_FORGET',condition:{kind:'time',minute:0},reminder:true}):stage===2?op(input,{operation:'list'}):stage===3?op(input,{operation:'read',id:'external',version:1}):{},async(inputs,advance)=>{
  assert.equal((await advance()).status,200);for(let i=0;i<82;i++)assert.equal((await POST(req({operation:'intervene',target:'owner',text:`後來收到的本人經歷 ${i}`}))).status,200);
  for(stage=1;stage<5;stage++)assert.equal((await advance()).status,200);
  assert.equal(JSON.stringify(inputs[1]).includes('PRECISE_EXTERNAL_AFTER_FORGET'),false);assert.equal(JSON.stringify(inputs[2]).includes('PRECISE_EXTERNAL_AFTER_FORGET'),false);assert.equal(JSON.stringify(inputs[3]).includes('PRECISE_EXTERNAL_AFTER_FORGET'),false);assert.equal(JSON.stringify(inputs[4]).includes('PRECISE_EXTERNAL_AFTER_FORGET'),true);
  const d=(await read()).phones.devices[0];assert.equal(d.calendar[0].text,'PRECISE_EXTERNAL_AFTER_FORGET');assert.equal(d.calendar[0].readers.length,1);assert.equal(d.notifications.length,1);assert.equal(inputs.length,5);
 });
});
test('行事曆提醒與正文讀者遇較後角色／保存／CAS故障共同回復，原操作重放不派送不重響',async()=>{
 for(const fault of ['later','before','after','conflict']){
  const w=seedWorld();w.characters=fault==='later'?[w.characters.find(c=>c.id==='cass'),w.characters.find(c=>c.id==='owner')]:w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'gpt-6-luna'};store.install(w);let stage=0;const old=Math.random;Math.random=()=>0.8;
  try{await withModel(input=>input.self.id==='owner'?stage===0?op(input,{operation:'create',id:'atomic',version:0,text:'ATOMIC_CALENDAR_BODY',condition:{kind:'time',minute:w.minute+30},reminder:true}):op(input,{operation:'read',id:'atomic',version:1}):stage===1&&fault==='later'?{type:'invalid'}:{},async(inputs,advance)=>{
   assert.equal((await advance()).status,200);stage=1;const before=await read();if(fault==='before')store.throwBeforeNextSave();if(fault==='after')store.throwAfterNextSave();if(fault==='conflict')store.conflictOnNextSave();
   const operationId=`${Date.now()}:${crypto.randomUUID()}`,response=await advance({operationId}),result=await response.json(),after=await read(),count=inputs.length;
   if(fault==='after'){assert.equal(after.phones.devices[0].calendar[0].readers.length,1);assert.equal(after.phones.devices[0].notifications.length,1);}else{assert.deepEqual(after.characters,before.characters);assert.deepEqual(after.phones,before.phones);assert.equal(after.minute,before.minute);}
   assert.deepEqual(await(await advance({operationId})).json(),result);assert.equal(inputs.length,count);
  });}finally{Math.random=old;}
 }
});
test('過期／不存在安排引用不部分建立紀錄；32筆滿額保留所有外部原文',async()=>{
 const w=seedWorld();w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'gpt-6-luna'};store.install(w);let stage=-1;
 await withModel(input=>op(input,stage<0?{operation:'create',id:'bad-link',version:0,text:'不該部分寫入',arrangement:{id:'foreign-or-stale',version:1}}:{operation:'create',id:'record-'+stage,version:0,text:`原文 ${stage}`}),async(inputs,advance)=>{
  assert.equal((await advance()).status,502);assert.equal((await read()).phones,undefined);
  for(stage=0;stage<32;stage++)assert.equal((await advance()).status,200);
  const before=await read();assert.equal(before.phones.devices[0].calendar.length,32);assert.equal((await advance()).status,502);assert.deepEqual((await read()).phones,before.phones);
 });
});
test('離身手機依自身時間提醒，遠處所有者無感知；返回主動列表閱讀不重播舊聲響',async()=>{
 const w=seedWorld();w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'gpt-6-luna'};w.objects=[{id:'calendar-phone',source:'existing-device',label:'桌上手機',kind:'phone',region:'cafe-front',holder:null,owner:'owner',revision:1,state:{condition:'sound'},lifecycle:'active',knownTo:['owner'],allowedTo:['owner']}];store.install(w);let stage=0;
 await withModel(input=>stage===0?op(input,{operation:'create',id:'away',version:0,text:'離身後仍精確保存',condition:{kind:'time',minute:w.minute+45},reminder:true}):stage===1?{type:'move',target:'vera-home'}:stage===3?{type:'move',target:'cafe'}:stage===4?op(input,{operation:'list'}):stage===5?op(input,{operation:'read',id:'away',version:1}):{},async(inputs,advance)=>{
  for(stage=0;stage<7;stage++){assert.equal((await advance()).status,200);const saved=await read(),d=saved.phones.devices[0];if(stage===2){assert.equal(d.notifications.length,1);assert.equal(d.notifications[0].exposures[0].status,'no-opportunity');assert.equal(d.calendar[0].readers.length,0);assert.equal(inputs[2].self.noticeOpportunities.length,0);}}
  const saved=await read();assert.equal(saved.phones.devices[0].notifications.length,1);assert.equal(saved.objects.find(o=>o.id==='calendar-phone').region,'cafe-front');assert.equal(saved.phones.devices[0].calendar[0].readers[0].actorId,'owner');
 });
});
test('情境提醒沿本人可知位置改變重喚起；遠離裝置的所有者位置不成為手機全知訂閱',async()=>{
 for(const away of [false,true]){
  const w=seedWorld();w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'gpt-6-luna'};
  if(away)w.objects=[{id:'left-phone',source:'existing-device',label:'留在前台',kind:'phone',region:'cafe-front',holder:null,owner:'owner',revision:1,state:{condition:'sound'},lifecycle:'active',knownTo:['owner'],allowedTo:['owner']}];store.install(w);let stage=0;
  await withModel(input=>stage===0?op(input,{operation:'create',id:'context',version:0,text:'到儲藏室時再考慮',condition:{kind:'context',region:'cafe-storeroom'},reminder:true}):stage===1||stage===5?{type:'move',target:'cafe-storeroom'}:stage===3?{type:'move',target:'cafe-front'}:{},async(inputs,advance)=>{
   for(stage=0;stage<7;stage++)assert.equal((await advance()).status,200);const d=(await read()).phones.devices[0];assert.equal(d.notifications?.length||0,away?0:2);assert.equal(d.calendar[0].readers.length,0);
  });
 }
});
test('事件提醒只比對真正可知人物線索，隱藏私人活動不讓手機知道人物已到',async()=>{
 const w=seedWorld();w.characters=[w.characters.find(c=>c.id==='owner'),w.characters.find(c=>c.id==='cass')];w.adjudication={provider:'openai',model:'gpt-6-luna'};w.characters[1].location='cafe';w.characters[1].region='cafe-storeroom';w.scene.doors['cafe-door']='closed';store.install(w);let stage=0;const old=Math.random;Math.random=()=>0.8;
 try{await withModel(input=>input.self.id==='owner'?stage===0?op(input,{operation:'create',id:'event',version:0,text:'等真正看到Cass到了再考慮',condition:{kind:'event',clueKind:'person',source:'cass',region:'cafe-front'},reminder:true}):{}:stage===2?{type:'door',target:'cafe-door',content:'open'}:stage===3?{type:'move',target:'cafe-front'}:{type:'reflect',content:'隱藏私人活動不供手機訂閱'},async(inputs,advance)=>{
  for(stage=0;stage<6;stage++){assert.equal((await advance()).status,200);if(stage<2)assert.equal((await read()).phones.devices.find(d=>d.calendar?.length)?.notifications?.length||0,0);}
  const saved=await read(),d=saved.phones.devices.find(d=>d.calendar?.length);assert.equal(d.notifications.length,1);assert.ok(saved.characters.find(c=>c.id==='owner').observations.some(o=>o.kind==='person'&&o.source==='cass'&&o.region==='cafe-front'));assert.ok(inputs.filter(i=>i.self.id==='owner').every(i=>!JSON.stringify(i).includes('隱藏私人活動不供手機訂閱')));
 });}finally{Math.random=old;}
});

test('行事曆普通提醒在真正睡眠中響過仍不喚醒、不閱讀，沒有手機專用模型鏈',async()=>{
 const w=seedWorld();w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'gpt-6-luna'};const c=w.characters[0];c.needs={version:1,activatedAt:w.minute,updatedAt:w.minute,values:{hunger:20,thirst:20,fatigue:70,sleep:80},assessed:{hunger:0,thirst:0,fatigue:2,sleep:2},history:[],dropped:0};store.install(w);let stage=0;
 await withModel(input=>stage===0?op(input,{operation:'create',id:'sleep',version:0,text:'醒後才需要真正查看',condition:{kind:'time',minute:w.minute+45},reminder:true}):{type:'propose',target:'cafe',content:'在角落睡覺',purpose:'恢復睡眠',timeIntent:{kind:'completion',maxMinutes:null}},async(inputs,advance)=>{
  for(stage=0;stage<6;stage++)assert.equal((await advance()).status,200);const saved=await read(),device=saved.phones.devices[0];assert.equal(device.notifications.length,1);assert.equal(device.notifications[0].exposures[0].status,'no-opportunity');assert.equal(device.notifications[0].exposures[0].handledAt,undefined);assert.equal(device.calendar[0].readers.length,0);assert.equal(saved.characters[0].plan.bodyActivity.kind,'sleep');assert.equal(inputs.filter(i=>i.contractVersion==='npc-decision.v3').length,2);assert.equal(inputs.filter(i=>i.contractVersion==='world-adjudication.v1').length,1);
 });
});
test('到期前延期原子替換提醒版本，舊時間不響；取消後也不續響',async()=>{
 const w=seedWorld();w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'gpt-6-luna'};store.install(w);let stage=0;
 await withModel(input=>stage===0?op(input,{operation:'create',id:'future',version:0,text:'未到期先延期',condition:{kind:'time',minute:w.minute+60},reminder:true}):stage===1?op(input,{operation:'reminder',id:'future',version:1,condition:{kind:'time',minute:w.minute+105}}):stage===7?op(input,{operation:'reminder',id:'future',version:2,condition:null}):{},async(inputs,advance)=>{
  for(stage=0;stage<9;stage++){assert.equal((await advance()).status,200);const d=(await read()).phones.devices[0];if(stage<6)assert.equal(d.notifications?.length||0,0);else assert.equal(d.notifications.length,1);}
  const d=(await read()).phones.devices[0];assert.equal(d.calendar[0].reminder.enabled,false);assert.equal(d.notifications[0].recordVersion,2);assert.ok(d.notifications[0].cancelledAt);
 });
});
test('刪除後明示重新建立的同名外部紀錄可以新提醒，取消的舊通知不冒充新聲響',async()=>{
 const w=seedWorld();w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'gpt-6-luna'};store.install(w);let stage=0;
 await withModel(input=>stage===0||stage===3?op(input,{operation:'create',id:'recreated',version:0,text:stage===0?'原紀錄':'重新建立的新紀錄',condition:{kind:'time',minute:0},reminder:true}):stage===2?op(input,{operation:'delete',id:'recreated',version:1}):{},async(inputs,advance)=>{
  for(stage=0;stage<5;stage++)assert.equal((await advance()).status,200);const saved=await read(),d=saved.phones.devices[0];assert.equal(d.notifications.length,2);assert.equal(saved.events.filter(e=>e.kind==='phone-notification').length,2);assert.ok(d.notifications[0].cancelledAt);assert.equal(d.notifications[1].cancelledAt,undefined);
 });
});
