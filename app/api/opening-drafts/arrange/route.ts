import {reconcileOpeningStarts,sameExceptOpeningStarts} from '@/lib/opening-starts';
import {z} from 'zod';
import {getGitHubUser} from '@/lib/auth';
import {openingRoadNetwork,withOpeningRoads} from '@/lib/opening-road-network';
import {readOpeningDraft,adoptOpeningArrangement,type OpeningDraft} from '@/lib/opening-drafts';
import {readArrangement,reserveArrangement,settleArrangement,arrangementForClient,editArrangement,actionableArrangement,storedArrangementResult,arrangementHasReceipt} from '@/lib/opening-arrangement-store';
import {applySelectedRoomItems,itemKey} from '@/lib/opening-room-items';
import {cityDraftSchema} from '@/lib/city-creation';
import { acceptHostOperation } from '@/lib/host-operations';
import { accountWorkspaceBinding, SaveAccessError } from '@/lib/world-saves';
import {saveUuidPattern} from '@/lib/save-identities';
export const dynamic='force-dynamic';
const reply=(body:object,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const common={operationScope:z.string().min(1).max(128),id:z.string().regex(saveUuidPattern),version:z.number().int().nonnegative(),operationId:z.string().regex(/^\d{13}:[0-9a-f-]{36}$/)};
const inputSchema=z.union([z.object({...common,worldContext:z.string().optional(),supplyRooms:z.boolean().optional(),recommendRoads:z.boolean().optional()}).strict(),z.object({...common,action:z.enum(['adopt','adoptRoads','edit']),proposalVersion:z.number().int().nonnegative(),city:cityDraftSchema}).strict(),
 z.object({...common,action:z.enum(['selectItems','adoptItems']),proposalVersion:z.number().int().nonnegative(),excludedItems:z.array(z.string().max(100)).max(640)}).strict()]);
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
   if(input.action!=='edit'&&arrangementHasReceipt(row,adoption))return reply({operationScope:owner,...loaded,arrangement:arrangementForClient(row)});
   if((await actionableArrangement(owner,input.id))?.operationId!==input.operationId)return reply({error:'已有較新的整理操作，請查看最新建議。'},409);
   if('excludedItems' in input){
    if(!row.result)throw new SaveAccessError('請先取得逐房配物建議。',409);
    const proposal=storedArrangementResult(row);
    if(row.state!=='complete'||!proposal.roomItems||proposal.receipts?.items)throw new SaveAccessError('物品建議已採納或未啟用。',409);
    if(input.version!==loaded.draft.version)throw new SaveAccessError('開局草稿版本已變更，請重新核對。',409);
    const known=new Set(proposal.roomItems.rooms.flatMap(room=>room.suggestedIds.map(id=>itemKey(room.placeId,id))));
    if(input.excludedItems.some(key=>!known.has(key)))throw new SaveAccessError('請重新核對本輪建議的物品。',409);
    const roomItems={...proposal.roomItems,excludedItems:[...new Set(input.excludedItems)]};
    if(input.action==='selectItems'){
     const updated=await editArrangement(owner,row,input.proposalVersion,proposal.city,input.version,{roomItems});
     return reply({operationScope:owner,...loaded,arrangement:arrangementForClient(updated)});
    }
    if(input.proposalVersion!==row.revision)throw new SaveAccessError('建議已變更，請重新核對所選物品。',409);
    const city=applySelectedRoomItems(loaded.draft,proposal.city,roomItems);
    if(!cityDraftSchema.safeParse(city).success)throw new SaveAccessError('採納後的物件數量超過開局上限，請減少所選物品。',422);
    const result=await adoptOpeningArrangement(owner,{operationScope:owner,id:input.id,version:input.version,body:{...loaded.draft.body,city}},row,adoption,{...proposal,roomItems,receipts:{...proposal.receipts,items:adoption}});
    return reply({operationScope:owner,...result});
   }
   if(input.version!==loaded.draft.version)return reply({error:'開局草稿版本已變更，原輸入已保留。'},409);
   const originalDraft=JSON.parse(row.snapshot) as OpeningDraft;
   const saved=storedArrangementResult(row), recommendRoads=arrangementForClient(row).recommendRoads;
   const expectedCity=saved.receipts?.roads?withOpeningRoads(originalDraft.body.city,saved.city):originalDraft.body.city;
   if(!sameExceptOpeningStarts(cityDraftSchema.parse(expectedCity),cityDraftSchema.parse(loaded.draft.body.city))||originalDraft.body.description!==loaded.draft.body.description)return reply({error:'整理依據的開局內容已變更，原輸入已保留；請核對或手動完成。'},409);
   if(input.action==='edit'){const edited=await editArrangement(owner,row,input.proposalVersion,input.city,input.version);return reply({operationScope:owner,...loaded,arrangement:arrangementForClient(edited)});}
   if(row.adoption_request&&row.adoption_request!==adoption)return reply({error:'原建議已採納，後續修改請使用手動配置。'},409);
   if(input.proposalVersion!==row.revision||!row.result||JSON.stringify(JSON.parse(row.result).city)!==JSON.stringify(input.city))return reply({error:'建議已變更，請先保存修改並核對原版本。'},409);
   if(input.action==='adoptRoads'&&!recommendRoads)return reply({error:'本輪未要求道路建議。'},422);
   if(recommendRoads&&!saved.receipts?.roads){
    const {problems}=openingRoadNetwork(input.city);
    if(problems.length)return reply({error:problems.join(' ')},422);
   }
   if(input.action==='adoptRoads'){
    if(saved.receipts?.roads)return reply({operationScope:owner,...loaded,arrangement:arrangementForClient(row)});
    const city=withOpeningRoads(loaded.draft.body.city,input.city);
    const partial={...saved,receipts:{...saved.receipts,roads:adoption}};
    const result=await adoptOpeningArrangement(owner,{operationScope:owner,id:input.id,version:input.version,body:{...loaded.draft.body,city}},row,adoption,partial);
    return reply({operationScope:owner,...result});
   }
   if(!JSON.parse(row.result).world||JSON.parse(row.result).preview.issues.length)return reply({error:'建議仍有開局阻擋問題，請修改後再採納。',preview:JSON.parse(row.result).preview},422);
   const result=await adoptOpeningArrangement(owner,{operationScope:owner,id:input.id,version:input.version,body:{...loaded.draft.body,city:reconcileOpeningStarts(input.city,loaded.draft.body.city)}},row,adoption);
   return reply({operationScope:owner,...result,arrangement:arrangementForClient((await readArrangement(owner,input.id,input.operationId))!)});
  }
  if(row){if(input.worldContext!==undefined&&JSON.parse(row.request).worldContext!==input.worldContext)return reply({error:'原整理操作來源不符。'},409);if(row.input_version!==input.version)return reply({error:'原整理操作版本不符。'},409);if(row.state!=='pending')return reply({operationScope:owner,...loaded,arrangement:arrangementForClient(row)});}
  else{
   if(loaded.draft.version!==input.version||!input.worldContext)return reply({error:'草稿版本已變更或缺少原操作來源，請先核對。'},409);
   if(!loaded.draft.body.city.characters.length||!loaded.draft.body.city.places.length||loaded.draft.sources.cards.length!==loaded.draft.body.city.characters.length)return reply({error:'請先選定完成人物卡與可用場景。'},400);
   row=await reserveArrangement(owner,input,loaded.draft);
  }
  const original=JSON.parse(row.request) as {worldContext:string};
  const response=await acceptHostOperation({accountId:owner,binding:accountWorkspaceBinding(owner),body:{operation:'arrange-opening',mode:'demo',target:input.id,operationId:input.operationId,operationScope:'account-operations:'+owner,worldContext:original.worldContext}});
  const result=response.body as {error?:string;retryable?:boolean;operationUncertain?:boolean;operationSettled?:boolean;modelSettingsRequired?:boolean;scopeMismatch?:boolean;contextMismatch?:boolean};
  if(response.status===200)await settleArrangement(owner,input.id,input.operationId,'complete');
  else if(!result.retryable&&!result.operationUncertain&&(result.operationSettled||result.scopeMismatch||result.contextMismatch||[400,401,403,404,422,429].includes(response.status)))await settleArrangement(owner,input.id,input.operationId,'failed',result.error||'AI整理未完成，原設定已保留。');
  const stored=(await readArrangement(owner,input.id,input.operationId))!;
  return reply({...(response.status<200||response.status>299?result:{}),operationScope:owner,...await readOpeningDraft(owner,input.id),arrangement:arrangementForClient(stored)},response.status);
 }catch(error){return reply({error:error instanceof SaveAccessError?error.message:'整理結果尚未確認，原設定已保留；請恢復原操作，勿另建請求。',...(error instanceof SaveAccessError?{}:{operationUncertain:true})},error instanceof SaveAccessError?error.status:503);}
}
