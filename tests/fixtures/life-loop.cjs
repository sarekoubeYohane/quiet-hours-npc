/* eslint-disable @typescript-eslint/no-require-imports */
const {fixturePursuitDecision}=require('../pursuit-fixture.cjs');
const assert=require('node:assert/strict');
const choose=(type,overrides={})=>({type,target:'',content:'按自己的想法安排',mood:'平靜',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null},intents:[],...overrides});
const refs=input=>input.self.shortTerm.map(({id,version})=>({id,version}));
function initialWorld(seedWorld,secondActor=false){
 const w=seedWorld();w.minute=480;w.turn=0;w.events=[];w.contextId='life-integration-181';w.adjudication={provider:'openai',model:'fixture-world'};w.playerBudget={calls:300,tokens:200000};
 const owner=w.characters.find(c=>c.id==='owner');owner.memories=[{time:480,text:'我正準備安排今天的生活。'}];delete owner.shortTerm;owner.needs={version:1,activatedAt:480,updatedAt:480,values:{hunger:39,thirst:39,fatigue:50,sleep:60},assessed:{hunger:0,thirst:0,fatigue:1,sleep:1},history:[],dropped:0};
 w.characters=[owner,...(secondActor?[w.characters.find(c=>c.id==='cass')]:[])];if(secondActor){const c=w.characters[1];c.memories=[{time:480,text:'我先在住處安靜整理自己的想法。'}];delete c.shortTerm;}
 const object=(id,label,kind,state,consumable=false)=>({id,label,kind,source:'initial-fixture',revision:1,region:'cafe-front',holder:'owner',owner:'owner',knownTo:['owner'],allowedTo:['owner'],lifecycle:'active',state,consumable,quantity:{amount:1,unit:'serving'}});
 w.objects=[object('workpiece','木製裝飾托盤','utensil',{progress:'raw'}),object('material','製作材料','timber',{},false),object('meal','本人餐點','food',{},true),object('water','本人飲水','drink',{},true)];w.objects[0].stateTransitions={progress:['raw','prepared','finished','unfinished']};return w;
}
const work=choose('propose',{target:'workpiece',content:'慢慢完成這份木製裝飾',purpose:'完成手作',durationMinutes:30});
const ingest=choose('propose',{target:'meal',content:'吃餐點並喝本人飲水',purpose:'實際進食飲水'});
const sleep=choose('propose',{target:'cafe',content:'在安全角落真正睡一覺',purpose:'睡眠恢復',durationMinutes:480});
const rest=minutes=>choose('rest',{content:'坐下清醒休息',durationMinutes:minutes,timeIntent:{kind:'open-ended',maxMinutes:null}});
const reflect=minutes=>choose('reflect',{content:'依自己的安排留一段安靜時間',durationMinutes:minutes,timeIntent:{kind:'open-ended',maxMinutes:null}});
function judge(input){
 const common={status:'accepted',completionMinutes:15,routine:null,effects:[],stages:[],check:null};
 if(input.action.target==='workpiece'){const candidate={...common,resumable:true,activityIdentity:{version:1,key:'dough-ornament',label:'製作木製裝飾'},bodyActivity:{version:1,kind:'exertion',fatiguePerHour:6,sleepPerHour:0},completionMinutes:240,stages:[{afterMinutes:15,preconditions:[],effects:[{kind:'form',version:1,access:'authorized',operation:'transform',inputs:[{objectId:'material',expectedRevision:1,quantity:{amount:1,unit:'serving'},disposition:'consumed'}],outputs:[{id:'prepared-material',label:'已成形的裝飾底料',kind:'component',consumable:false,quantity:{amount:1,unit:'serving'},state:[]}],reason:'實際投入材料製成底料，後續仍需手工作業。'},{kind:'state',objectId:'workpiece',expectedRevision:1,key:'progress',value:'prepared'}]},{afterMinutes:240,preconditions:[{objectId:'workpiece',revision:2,region:'cafe-front',holder:'owner',state:[{key:'progress',value:'prepared'}]}],effects:[{kind:'state',objectId:'workpiece',expectedRevision:2,key:'progress',value:'finished'}]}]};const failed=structuredClone(candidate.stages);failed[1].effects[0].value='unfinished';return {...candidate,check:{difficulty:12,ability:'手作'},stages:[],branches:[{outcomes:['critical-success','success'],effects:[],stages:candidate.stages},{outcomes:['mixed','failure','critical-failure'],effects:[],stages:failed}]};}
 if(input.action.target==='meal')return {...common,activityIdentity:{version:1,key:'eat-and-drink',label:'進食飲水'},completionMinutes:15,effects:[{kind:'ingest',version:1,objectId:'meal',expectedRevision:1,hungerRelief:25,thirstRelief:0},{kind:'ingest',version:1,objectId:'water',expectedRevision:1,hungerRelief:0,thirstRelief:25}]};
 return {...common,bodyActivity:{version:1,kind:'sleep',fatiguePerHour:-6,sleepPerHour:-14},completionMinutes:480};
}
function model(){
 let current=work,laterFailure=false,npc=0,adjudication=0,judgeReply=judge;const inputs=[];
 return {judge:value=>{judgeReply=value;},choose:value=>{current=value;},failLater:value=>{laterFailure=value;},counts:()=>({npc,adjudication}),inputs,
 respond:request=>{const input=JSON.parse(request.messages[1].content);inputs.push(input);let value;
  if(input.contractVersion==='world-adjudication.v1'){adjudication++;value=judgeReply(input);}else{npc++;assert.equal(input.self.needs,undefined);assert.equal(input.self.habitEvidence,undefined);assert.ok(input.self.bodyFeelings);value=input.self.id==='owner'?(typeof current==='function'?current(input):current):laterFailure?{type:'invalid-later-actor'}:reflect(15);}
  return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(fixturePursuitDecision(JSON.parse(request.messages[1].content),value))}}]});
 }};
}
module.exports={initialWorld,model,choose,work,ingest,sleep,rest,reflect,refs};
