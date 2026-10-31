/* eslint-disable @typescript-eslint/no-require-imports -- Preregistered controlled partner transport, never deployed. */
// Preregistered synthetic partner. Only normal NPC transport is controlled.
// Lexical offer/question recognition is public and finite; unknown wording is
// unrecognized, never replaced with a scripted focal-character commitment.
const {decision}=require('../../tests/pursuit-selection-fixture.cjs');
const initial={L1:'請問現在有什麼可以吃的？',L2:'我現在想吃一份普通簡餐，可以幫我準備嗎？',L3:'我有點餓，還沒決定要吃什麼。',L5:'我現在想吃一份普通簡餐，可以幫我準備嗎？'};
function createPartner(scenario,{runId,trial}={}){let started=false,answered=false,accepted=false,changed=false,committed=false,consented=false,confirmedCommitment=null;return {
 observe(world,{operationId,confirmation}={}){
  committed=false;
  if(scenario!=='L5'||!confirmation||confirmation.relatedMealCommitment!==true||confirmation.runId!==runId||confirmation.trial!==trial||!operationId||confirmation.operationId!==operationId||typeof confirmation.reference!=='string'||!confirmation.reference.trim()||confirmation.reference.length>500)return;
  const pursuit=world.characters.find(c=>c.id==='owner')?.intents?.find(node=>node.id===confirmation.pursuitId);
  if(!pursuit||pursuit.status!=='active'||pursuit.kind==='direction'||pursuit.version!==confirmation.version||pursuit.scope!==confirmation.scope)return;
  // Relatedness is the explicit observer's evidence assessment, never inferred
  // from a keyword, role or arbitrary active task, and never written to the NPC.
  committed=true;confirmedCommitment={operationId,pursuitId:pursuit.id,version:pursuit.version,scope:pursuit.scope,reference:confirmation.reference};
 },
 report(){return {scenario,syntheticPartner:true,initialStatementSent:started,questionAnswered:answered,recognizedOfferAccepted:accepted,recognizedConsent:consented,changedAfterCommitment:changed,confirmedCommitment,branch:scenario==='L3'&&!accepted||scenario==='L5'&&!changed?'not-reached':'requires-human-assessment'};},
 reply(input){const value=decision(input);let text='';
  if(!started){started=true;text=initial[scenario]||'';}
  else if(scenario==='L5'&&committed&&!changed){changed=true;text='我的情況改變了，我現在不需要餐點了。請依你自己的安排決定接下來做什麼。';}
  else {const heard=input.self.shortTerm.filter(m=>m.source?.person==='owner').map(m=>m.text).join('\n');
   const meal=input.objects.find(object=>object.kind==='meal'||object.kind==='food'&&object.holder==='owner');
   if(!consented&&/同意|接收/.test(heard)&&meal){consented=true;value.action={type:'propose',target:meal.id,content:'我同意接收這份餐點',purpose:'接收餐點'};value.timeIntent={kind:'completion',maxMinutes:null};value.methodAssessment.selectedAction={type:'propose',target:meal.id};return value;}
   if(!answered&&/[？?]|想吃什麼|什麼樣/.test(heard)){answered=true;text='一份普通的簡餐就可以，不需要特別香料。';}
   else if(!accepted&&/幫你|替你|為你|願意.*準備/.test(heard)){accepted=true;text='好，謝謝，一份普通的就可以。';}
  }
  if(text){value.action={type:'say',target:'owner',content:text,purpose:''};value.methodAssessment.selectedAction={type:'say',target:'owner'};}
  return value;
 },
};}
module.exports={createPartner};
