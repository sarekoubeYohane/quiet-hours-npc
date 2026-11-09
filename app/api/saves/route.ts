import {saveManagementInput,copyWorldSave,deleteWorldSave,accountSavedUsage,readSaveOperation} from '@/lib/save-management';
import { z } from 'zod';
import { cityDraftSchema,prepareCity } from '@/lib/city-creation';
import { formCharacterAttributes } from '@/lib/character-attributes';
import { formFormalMentalEnergy } from '@/lib/formal-mental-enablement';
import { createWorldSave,readSaveCreation,SaveAccessError } from '@/lib/world-saves';
import { getGitHubUser } from '@/lib/auth';
import { listWorldSaves } from '@/lib/world-saves';
const saveInput=z.object({id:z.string().uuid(),name:z.string().trim().min(1).max(80),city:cityDraftSchema}).strict();
export const dynamic='force-dynamic';
export async function GET(request?:Request) {
  try {
    const user=await getGitHubUser();
    if(!user)return Response.json({error:'請先登入。'},{status:401});
    const operationId=request&&new URL(request.url).searchParams.get('operationId');
    if(operationId&&!z.string().uuid().safeParse(operationId).success)return Response.json({error:'操作識別碼無效。'},{status:400});
    return Response.json({saves:await listWorldSaves(user.userId),operationScope:user.userId,accountUsage:await accountSavedUsage(user.userId),...(operationId?{operation:await readSaveOperation(user.userId,operationId)??null}:{})},{headers:{'Cache-Control':'no-store'}});
  }catch{return Response.json({error:'暫時無法讀取存檔，請稍後重試。'},{status:503});}
}

/** Existing manual city contract; the five-step completed-card flow builds on this save boundary. */
export async function POST(request:Request) {
  try {
    const user=await getGitHubUser();
    if(!user)return Response.json({error:'請先登入。'},{status:401});
    if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'請從本站建立存檔。'},{status:403});
    const raw=await request.text();
    if(raw.length>128000)return Response.json({error:'輸入過長。'},{status:400});
    let input:unknown;
    try{input=JSON.parse(raw);}catch{return Response.json({error:'請提供有效的存檔內容。'},{status:400});}
    if(input&&typeof input==='object'&&'operation' in input){
      const management=saveManagementInput.safeParse(input);
      if(!management.success)return Response.json({error:'存檔操作無效。'},{status:400});
      if(management.data.operation==='delete')return Response.json(await deleteWorldSave(user.userId,management.data),{headers:{'Cache-Control':'no-store'}});
      const copied=await copyWorldSave(user.userId,management.data);
      return Response.json(copied.result,{status:copied.created?201:200,headers:{'Cache-Control':'no-store'}});
    }
    const accepted=saveInput.safeParse(input);
    if(!accepted.success)return Response.json({error:'請確認存檔名稱、操作識別碼及城市配置。'},{status:400});
    const value=accepted.data,creationRequest=JSON.stringify(value);
    const previous=await readSaveCreation(user.userId,value.id,creationRequest);
    if(previous)return Response.json(previous,{headers:{'Cache-Control':'no-store'}});
    const candidate=await prepareCity(user.userId,value.city,{minute:1260,turn:0,characters:[],events:[],lastMode:'demo'});
    if(!candidate.world)return Response.json({error:candidate.preview.issues.join(' '),preview:candidate.preview},{status:400});
    for(const actor of candidate.world.characters) {
      const selection=value.city.characters.find(person=>person.templateId===actor.profileSource?.id);
      if(!actor.attributes)formCharacterAttributes(actor,selection?.characterSetup??{},candidate.world.minute);
      formFormalMentalEnergy(actor,candidate.world.minute,selection?.mentalOpening??{});
    }
    candidate.world.timeContract='five-minute-v1';
    const saved=await createWorldSave(user.userId,{id:value.id,name:value.name,creationRequest,world:candidate.world});
    return Response.json(saved,{status:201,headers:{'Cache-Control':'no-store'}});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'無法確認存檔保存結果，請保留原操作重試。'},{status:error instanceof SaveAccessError?error.status:503});}
}
