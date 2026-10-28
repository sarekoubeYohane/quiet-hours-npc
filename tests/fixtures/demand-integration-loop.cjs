/* eslint-disable @typescript-eslint/no-require-imports -- Shared controlled transport, never an engine policy or deployed script. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto'),f=require('../routine-world-programs-fixture.cjs'),{wire}=require('../method-assessment-fixture.cjs'),{search}=require('../routine-discovery-fixture.cjs');
const words={ask:'這裡還有可以吃的餐點嗎？',confirm:'你想要什麼樣的餐點？',answer:'我想要一份簡單的餐點，不需要特別香料。',offer:'好，我願意幫你準備一份普通餐點。'};
const serving={id:'serve-request',content:'回應客人的這次餐點需要',context:'依對方實際回覆及目前可知來源選擇下一步',intensity:'medium',importance:'medium',urgency:'low'};
const stock=(id,label,kind,remaining,state,extra={})=>({id,label,kind,remaining,initialState:state,region:'cafe-front',owner:'owner',knownTo:['owner','cass'],allowedTo:['owner'],consumable:false,quantity:{amount:1,unit:'item'},...extra});
function preparation({route='explore',minutes=15}={}){
 if(route==='explore'){const program=f.cafePrograms().find(p=>p.operation==='food');program.stages[0].afterMinutes=minutes;return program;}
 return f.program('prepare-bread-meal','用現有麵包準備一份餐點','準備餐點',[f.binding('raw','supply','target',[],{kind:'food',sourceRole:'material',sourceSubject:'麵包'})],[f.phase(minutes,[{kind:'materialize',supplyId:'$raw',expectedRemaining:0},f.form('一份麵包餐','meal')])]);
}
function initialWorld(seedWorld,{hidden}={}){
 const w=seedWorld();w.contextId='demand-integration-v1';w.adjudication={provider:'openai',model:'gpt-6-luna'};w.characters=w.characters.filter(c=>c.id==='cass'||c.id==='owner').sort((a,b)=>Number(a.id==='owner')-Number(b.id==='owner'));
 for(const c of w.characters){c.location='cafe';c.region='cafe-front';}
 w.currentSensory={presence:Object.fromEntries(w.characters.map(c=>[c.id,{region:'cafe-front',clue:'initial:'+c.id+':cafe-front'}])),activities:{}};w.scene.doors['cafe-door']='closed';w.routinePlaces[0].confirmedOperations=['food'];
 w.supplies=[stock('old-finished-meal','已耗盡的舊餐點','food',0,{category:'既有成品'},{consumable:true}),stock('bread-stock','另有一份合法麵包','food',1,{material:'麵包'}),stock('special-stock','明確有限的珍稀香料','food',0,{material:'珍稀香料'})];
 w.objects=[{id:'old-finished-meal:1',source:'old-finished-meal',label:'已吃完的舊餐點',region:'cafe-front',holder:null,owner:'owner',revision:2,state:{category:'既有成品'},lifecycle:'consumed',kind:'food',knownTo:['owner','cass'],allowedTo:['owner','cass'],consumable:true,quantity:{amount:0,unit:'item'}}];
 const programs=[preparation(),preparation({route:'direct'})];w.routineRules=[{id:'known-meal-methods',version:3,family:'cafe-service',origin:'cafe',knownTo:['owner'],operations:programs.map(p=>p.operation),programs,worldTimings:programs.map(p=>({operation:p.operation,minutes:15}))}];
 if(hidden!==undefined)w.scene.external={'cafe-front':{revision:1,state:{'private-stock-note':hidden},exposure:{'private-stock-note':'hidden'}}};
 return w;
}
function snapshot(seedWorld,options){const world=initialWorld(seedWorld,options),json=JSON.stringify(world);return {version:'demand-integration.v1',world,json,sha256:createHash('sha256').update(json).digest('hex')};}
function action(type,target='',content='',purpose='',intents=[]){return {type,target,content,purpose,mood:'平靜',durationMinutes:15,timeIntent:{kind:['rest','reflect'].includes(type)?'open-ended':'completion',maxMinutes:null},intents};}
const heard=(input,text)=>input.self.shortTerm.some(memory=>memory.source.kind==='observation'&&memory.text.includes(text));
const meal=input=>{const found=input.objects.find(object=>object.kind==='meal');assert.ok(found,'No legitimately visible meal in this actual NPC request');return found;};
function decision(step,input,route){
 const owner=input.self.id==='owner';let a=action('rest','','稍坐一會兒'),choice='new';
 if(!owner){if(step==='inquire')a=action('say','owner',words.ask);if(step==='answer'){assert.ok(heard(input,words.confirm));a=action('say','owner',words.answer);}if(step==='consent'){const object=meal(input);assert.ok(heard(input,'同意'));a=action('propose',object.id,'我同意接收這份餐點','接收餐點');}}
 else{
  const intent=['inquire','answer','offer','search','prepare','grant','consent','deliver'].includes(step)?[serving]:[];
  if(step==='inquire'){assert.ok(heard(input,words.ask));a=action('say','cass',words.confirm,'',intent);}
  else if(step==='answer'){assert.equal(heard(input,words.answer),false);a=action('rest','','先等客人說明想要什麼','',intent);choice='wait';}
  else if(step==='offer'){assert.ok(heard(input,words.answer));a=action('say','cass',words.offer,'',intent);}
  else if(step==='search'){assert.ok(heard(input,words.answer));a=action('propose','cafe','查看這裡可用的普通備餐材料','確認可用材料',intent);}
  else if(step==='prepare'){assert.ok(heard(input,words.answer));const p=preparation({route});if(route==='explore')assert.ok(input.supplies.some(source=>source.kind==='cooking-ingredient'));a=action('propose',route==='direct'?'bread-stock':'cafe',p.methods[0].content,p.methods[0].purpose,intent);}
  else if(step==='grant')a=action('propose',meal(input).id,'同意讓 Cass 使用這份餐點','提供餐點',intent);
  else if(step==='consent'){a=action('rest','','讓客人自己決定是否接收','',intent);choice='wait';}
  else if(step==='deliver'){assert.ok(heard(input,'同意接收'));a=action('propose',meal(input).id,'將這份餐點交給 Cass','交付餐點',intent);}
  else a=action('reflect','','留意剛才實際發生的事情');
 }
 const known=input.self.shortTerm.filter(memory=>memory.source.kind==='observation'||memory.text.includes('行動回饋')).slice(-2).map(memory=>({kind:'short',id:memory.id,version:memory.version}));
 return wire(a,{purpose:owner&&a.intents.length?'回應客人的這次餐點需要':'依自己的情境安排生活',knownResults:known,choice,reason:'依本人目前真正收到的對話與行動結果選擇，沒有代替對方作決定。'});
}
function model({route='explore'}={}){let step='inquire',npc=0,judgments=0;const frames=[];return {frames,setStep:value=>{step=value;},counts:()=>({npc,judgments}),respond(request){const input=JSON.parse(request.messages[1].content);let value;
 if(input.contractVersion==='world-adjudication.v1'){
  judgments++;if(step==='search')value=f.approval([search()],'find-ingredient');else{const object=input.objects.find(o=>o.id===input.action.target);assert.ok(object,'Adjudication target must be in actual authority');const effect=step==='grant'?{kind:'grant',targetId:object.id,recipient:'cass'}:step==='consent'?{kind:'consent',objectId:object.id}:step==='deliver'?{kind:'transfer',objectId:object.id,expectedRevision:object.revision,toHolder:'cass',toRegion:'cafe-front'}:null;assert.ok(effect,'Unexpected new adjudication in '+step);value={status:'accepted',completionMinutes:15,effects:[effect],check:null};}
 }else{npc++;value=decision(step,input,route);}frames.push({step,request,input,value});return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});}};}
const steps=route=>['inquire','answer','offer',...(route==='direct'?[]:['search']),'prepare','grant','consent','deliver','reflect'];
module.exports={initialWorld,snapshot,preparation,model,steps,words,serving,action};
