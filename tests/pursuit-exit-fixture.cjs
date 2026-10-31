/* eslint-disable @typescript-eslint/no-require-imports -- Native decision authoring at the provider boundary. */
const {decision,upsert,scenario}=require('./pursuit-graph-fixture.cjs');
const find=(input,id)=>input.self.intents.find(node=>node.id===id);
const edit=(input,id,changes={})=>{const old=find(input,id);const {content,intensity,importance,urgency,context,kind,scope,satisfaction}=old;return upsert(id,old.parents.map(({id,version})=>({id,version})),{content,intensity,importance,urgency,context,kind,scope,satisfaction,...changes},old.version);};
const drop=(input,id)=>({operation:'drop',id,version:find(input,id).version,node:null,references:[],reason:'我現在不想再承接這個方向'});
const assess=(input,id,status='active',progress='waiting',version=find(input,id)?.version??0)=>({operation:'assess',id,version,node:{status,progress,basis:{kind:'subjective',text:'依我現在自己的理解取捨'}},references:[],reason:'這是我當下的判斷'});
const ownerOnly=world=>{world.characters=world.characters.filter(c=>c.id==='owner');world.characters[0].control.mode='autonomous';};
const workWorld=world=>{ownerOnly(world);world.objects=[{id:'work',source:'fixture',label:'同一份工作',region:'cafe-front',holder:null,owner:'owner',revision:1,state:{progress:'raw'},lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner'],stateTransitions:{progress:['raw','partial','complete']}}];};
const judgment=()=>({status:'accepted',resumable:true,completionMinutes:60,effects:[],stages:[{afterMinutes:15,preconditions:[],effects:[{kind:'state',objectId:'work',expectedRevision:1,key:'progress',value:'partial'}]},{afterMinutes:60,preconditions:[],effects:[{kind:'state',objectId:'work',expectedRevision:2,key:'progress',value:'complete'}]}],check:null,branches:null,routine:null});
const startWork=input=>{const value=decision(input,{updates:[upsert('owner:work',[],{scope:'為原本的理由完成這份工作'})],focus:'owner:work',type:'propose',target:'work',content:'處理這份原有工作',duration:60});value.action.purpose='完成原本的工作';value.timeIntent={kind:'completion',maxMinutes:null};return value;};
module.exports={decision,upsert,scenario,find,edit,drop,assess,ownerOnly,workWorld,judgment,startWork};
