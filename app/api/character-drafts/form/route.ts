import { getGitHubUser } from '@/lib/auth';
import { characterDraftForClient } from '@/lib/character-drafts';
import { loadCharacterDraft, writeCharacterDraft } from '@/lib/character-draft-store';
import { characterFormationIssue, formCardValues } from '@/lib/character-formation';
import { readCardAssessment } from '@/lib/character-card-store';
import { validCardAllocation } from '@/lib/character-cards';
import { POST as worldOperation } from '@/app/api/world/route';
import { roundTimePolicy,timePolicyHeader } from '@/lib/round-time-policy';
export const dynamic='force-dynamic';
const reply=(body:object,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){
 const origin=new URL(request.url).origin;if(request.headers.get('origin')!==origin)return reply({error:'請從人物頁操作。'},403);
 try{
  const user=await getGitHubUser();if(!user)return reply({error:'請先登入。'},401);
  const raw=await request.text();if(raw.length>3000)return reply({error:'形成操作內容過長。'},400);
  const input=JSON.parse(raw) as {id?:string;version?:number;action?:string;values?:unknown;operationId?:string;operationScope?:string;worldContext?:string};
  if(typeof input.id!=='string'||!Number.isSafeInteger(input.version)||input.version!<0)return reply({error:'草稿身分或版本無效。'},400);
  let draft=await loadCharacterDraft(user.userId,input.id);if(!draft)return reply({error:'找不到本帳號的建角草稿。'},404);
  if(input.action==='allocate'){
   if(Object.keys(input).sort().join(',')!=='action,id,values,version'||!draft.formation||!validCardAllocation(input.values,draft.formation))return reply({error:'五項總分必須保持初次總分，且各項在合法上下限內；容量不可交換。'},400);
   if(draft.completedCard)return reply({error:'完成人物卡不可修改，請另建人物。'},409);
   if((draft.version===input.version||draft.version===input.version!+1)&&JSON.stringify(draft.formation.values)===JSON.stringify(input.values))return reply({draft:characterDraftForClient(draft)});
   if(draft.version!==input.version)return reply({error:'另一頁已修改配點，原輸入已保留，請重新核對。'},409);
   const saved=await writeCharacterDraft(user.userId,{...draft,formation:{...draft.formation,values:input.values}});
   return saved?reply({draft:characterDraftForClient(saved)}):reply({error:'配點版本衝突，原輸入已保留。'},409);
  }
  if(draft.formation)return reply({draft:characterDraftForClient(draft)});
  if(input.action!==undefined||Object.keys(input).some(key=>!['id','version','operationId','operationScope','worldContext'].includes(key))||typeof input.operationId!=='string'||!/^\d{13}:[0-9a-f-]{36}$/.test(input.operationId)||typeof input.operationScope!=='string'||input.worldContext!==undefined&&typeof input.worldContext!=='string')return reply({error:'形成操作身分無效。'},400);
  if(draft.pendingGeneration)return reply({error:'請先恢復原文字補完操作，再確認形成。'},409);
  if(!draft.pendingFormation){
   if(draft.version!==input.version)return reply({error:'另一頁已修改文字，形成前請重新核對。'},409);
   const issue=characterFormationIssue(draft);if(issue)return reply({error:issue},400);
   const claimed=await writeCharacterDraft(user.userId,{...draft,pendingFormation:{operationId:input.operationId,operationScope:input.operationScope,worldContext:input.worldContext,inputVersion:draft.version}});
   if(!claimed)return reply({error:'另一頁已先開始操作，請恢復原形成結果。'},409);draft=claimed;
  }
  const pending=draft.pendingFormation!;
  if(pending.operationId!==input.operationId||pending.inputVersion!==input.version)return reply({error:'已有形成操作，請先恢復原操作。',draft:characterDraftForClient(draft)},409);
  const response=await worldOperation(new Request(origin+'/api/world?workspace=account',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',[timePolicyHeader]:roundTimePolicy.version},body:JSON.stringify({operation:'assess-character-card',mode:'demo',operationId:pending.operationId,operationScope:pending.operationScope,worldContext:pending.worldContext,target:draft.id})}));
  const result=await response.json() as {error?:string;retryable?:boolean;operationUncertain?:boolean;operationSettled?:boolean;modelSettingsRequired?:boolean};
  if(!response.ok){
   if(!result.retryable&&!result.operationUncertain&&(result.operationSettled||[400,401,403,404,422].includes(response.status))){const next={...draft};delete next.pendingFormation;const cleared=await writeCharacterDraft(user.userId,next);return reply({...result,error:result.error||'尚未形成，原文字已保留。',...(cleared?{draft:characterDraftForClient(cleared)}:{})},response.status);}
   return reply({...result,error:result.error||'形成結果尚未確認，請恢復原操作。',draft:characterDraftForClient(draft)},response.status);
  }
  const assessment=await readCardAssessment(user.userId,draft.id,pending.operationId);if(!assessment)return reply({error:'已受理的判讀結果尚無法讀取，請恢復原操作；不會重新派送。',draft:characterDraftForClient(draft)},503);
  const formed=await writeCharacterDraft(user.userId,{...draft,pendingFormation:undefined,formation:{...formCardValues(assessment),operationId:pending.operationId,inputVersion:pending.inputVersion}});
  if(formed)return reply({draft:characterDraftForClient(formed)});
  const current=await loadCharacterDraft(user.userId,draft.id);if(current?.formation)return reply({draft:characterDraftForClient(current)});
  return reply({error:'形成提交版本衝突，原結果未覆寫；請恢復原操作。'},409);
 }catch{return reply({error:'形成保存結果尚未確認，原輸入已保留；請恢復原操作，勿另建請求。',operationUncertain:true},503);}
}
