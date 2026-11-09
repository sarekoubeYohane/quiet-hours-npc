import {z} from 'zod';
import {getGitHubUser} from '@/lib/auth';
import {readOpeningDraft,adoptOpeningArrangement} from '@/lib/opening-drafts';
import {readArrangement,reserveArrangement,settleArrangement,arrangementForClient,editArrangement,actionableArrangement} from '@/lib/opening-arrangement-store';
import {cityDraftSchema} from '@/lib/city-creation';
import {SaveAccessError} from '@/lib/world-saves';
import {POST as worldOperation} from '@/app/api/world/route';
import {roundTimePolicy,timePolicyHeader} from '@/lib/round-time-policy';
import {saveUuidPattern} from '@/lib/save-identities';
export const dynamic='force-dynamic';
const reply=(body:object,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const common={operationScope:z.string().min(1).max(128),id:z.string().regex(saveUuidPattern),version:z.number().int().nonnegative(),operationId:z.string().regex(/^\d{13}:[0-9a-f-]{36}$/)};
const inputSchema=z.union([z.object({...common,worldContext:z.string().optional()}).strict(),z.object({...common,action:z.enum(['adopt','edit']),proposalVersion:z.number().int().nonnegative(),city:cityDraftSchema}).strict()]);
export async function POST(request:Request){
 const origin=new URL(request.url).origin;if(request.headers.get('origin')!==origin)return reply({error:'請從開局流程操作。'},403);
 try{
  const user=await getGitHubUser();if(!user)return reply({error:'請先登入。'},401);
  const raw=await request.text();if(raw.length>128000)return reply({error:'整理內容過長，原輸入已保留。'},400);
  let value:unknown;try{value=JSON.parse(raw);}catch{return reply({error:'請提供有效的整理操作。'},400);}
  const parsed=inputSchema.safeParse(value);if(!parsed.success)return reply({error:'整理操作格式無效，原輸入已保留。'},400);
  const input=parsed.data,owner=user.userId;if(input.operationScope!==owner)return reply({error:'原帳號已變更，請回到原帳號恢復開局整理。',scopeMismatch:true},409);
  const loaded=await readOpeningDraft(owner,input.id);if(loaded.draft.finalizedSaveId)return reply({error:'這份開局已建立世界，不能重新整理。'},409);
  let row=await readArrangement(owner,input.id,input.operationId);
  if('action' in input){
   if(!row||!['complete','adopted'].includes(row.state))return reply({error:'請先恢復並查看原整理建議。'},409);
   const adoption=JSON.stringify(input);
   if(input.action==='adopt'&&row.state==='adopted'&&row.adoption_request===adoption)return reply({operationScope:owner,...loaded,arrangement:arrangementForClient(row)});
   if((await actionableArrangement(owner,input.id))?.operationId!==input.operationId)return reply({error:'已有較新的整理操作，請查看最新建議。'},409);
   if(input.version!==loaded.draft.version)return reply({error:'開局草稿版本已變更，原輸入已保留。'},409);
   const originalDraft=JSON.parse(row.snapshot) as {body:{city:unknown;description:string}};
   if(JSON.stringify(originalDraft.body.city)!==JSON.stringify(loaded.draft.body.city)||originalDraft.body.description!==loaded.draft.body.description)return reply({error:'整理依據的開局內容已變更，原輸入已保留；請核對或手動完成。'},409);
   if(input.action==='edit'){const edited=await editArrangement(owner,row,input.proposalVersion,input.city,input.version);return reply({operationScope:owner,...loaded,arrangement:arrangementForClient(edited)});}
   if(row.adoption_request&&row.adoption_request!==adoption)return reply({error:'原建議已採納，後續修改請使用手動配置。'},409);
   if(input.proposalVersion!==row.revision||!row.result||JSON.stringify(JSON.parse(row.result).city)!==JSON.stringify(input.city))return reply({error:'建議已變更，請先保存修改並核對原版本。'},409);
   if(!JSON.parse(row.result).world||JSON.parse(row.result).preview.issues.length)return reply({error:'建議仍有開局阻擋問題，請修改後再採納。',preview:JSON.parse(row.result).preview},422);
   const result=await adoptOpeningArrangement(owner,{operationScope:owner,id:input.id,version:input.version,body:{...loaded.draft.body,city:input.city}},row,adoption);
   return reply({operationScope:owner,...result,arrangement:arrangementForClient((await readArrangement(owner,input.id,input.operationId))!)});
  }
  if(row){if(input.worldContext!==undefined&&JSON.parse(row.request).worldContext!==input.worldContext)return reply({error:'原整理操作來源不符。'},409);if(row.input_version!==input.version)return reply({error:'原整理操作版本不符。'},409);if(row.state!=='pending')return reply({operationScope:owner,...loaded,arrangement:arrangementForClient(row)});}
  else{
   if(loaded.draft.version!==input.version||!input.worldContext)return reply({error:'草稿版本已變更或缺少原操作來源，請先核對。'},409);
   if(!loaded.draft.body.city.characters.length||!loaded.draft.body.city.places.length||loaded.draft.sources.cards.length!==loaded.draft.body.city.characters.length)return reply({error:'請先選定完成人物卡與可用場景。'},400);
   row=await reserveArrangement(owner,input,loaded.draft);
  }
  const original=JSON.parse(row.request) as {worldContext:string};
  const response=await worldOperation(new Request(origin+'/api/world?workspace=account',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',[timePolicyHeader]:roundTimePolicy.version},body:JSON.stringify({operation:'arrange-opening',mode:'demo',target:input.id,operationId:input.operationId,operationScope:'account-operations:'+owner,worldContext:original.worldContext})}));
  const result=await response.json() as {error?:string;retryable?:boolean;operationUncertain?:boolean;operationSettled?:boolean;modelSettingsRequired?:boolean;scopeMismatch?:boolean;contextMismatch?:boolean};
  if(response.status===200)await settleArrangement(owner,input.id,input.operationId,'complete');
  else if(!result.retryable&&!result.operationUncertain&&(result.operationSettled||result.scopeMismatch||result.contextMismatch||[400,401,403,404,422,429].includes(response.status)))await settleArrangement(owner,input.id,input.operationId,'failed',result.error||'AI整理未完成，原設定已保留。');
  const stored=(await readArrangement(owner,input.id,input.operationId))!;
  return reply({...(!response.ok?result:{}),operationScope:owner,...await readOpeningDraft(owner,input.id),arrangement:arrangementForClient(stored)},response.status);
 }catch(error){return reply({error:error instanceof SaveAccessError?error.message:'整理結果尚未確認，原設定已保留；請恢復原操作，勿另建請求。',...(error instanceof SaveAccessError?{}:{operationUncertain:true})},error instanceof SaveAccessError?error.status:503);}
}
