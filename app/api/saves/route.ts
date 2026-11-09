import {saveManagementInput,copyWorldSave,deleteWorldSave,accountSavedUsage,readSaveOperation} from '@/lib/save-management';
import { z } from 'zod';
import { confirmOpening,confirmOpeningSchema } from '@/lib/opening-drafts';
import { SaveAccessError } from '@/lib/world-saves';
import { getGitHubUser } from '@/lib/auth';
import { listWorldSaves } from '@/lib/world-saves';
export const dynamic='force-dynamic';
export async function GET(request?:Request) {
  try {
    const user=await getGitHubUser();
    if(!user)return Response.json({error:'請先登入。'},{status:401});
    const expectedScope=request&&new URL(request.url).searchParams.get('operationScope');if(expectedScope!==undefined&&expectedScope!==null&&expectedScope!==user.userId)return Response.json({error:'原帳號已變更，請重新選檔。',scopeMismatch:true},{status:409});
    const operationId=request&&new URL(request.url).searchParams.get('operationId');
    if(operationId&&new URL(request!.url).searchParams.get('operationScope')!==user.userId)return Response.json({error:'原帳號已變更或缺少原帳號識別；請回到原帳號恢復。',scopeMismatch:true},{status:409});
    if(operationId&&!z.string().uuid().safeParse(operationId).success)return Response.json({error:'操作識別碼無效。'},{status:400});
    return Response.json({saves:await listWorldSaves(user.userId),operationScope:user.userId,accountUsage:await accountSavedUsage(user.userId),...(operationId?{operation:await readSaveOperation(user.userId,operationId)??null}:{})},{headers:{'Cache-Control':'no-store'}});
  }catch{return Response.json({error:'暫時無法讀取存檔，請稍後重試。'},{status:503});}
}

/** Only a confirmed, account-scoped opening draft may create a new world. */
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
      if(!('operationScope' in input)||input.operationScope!==user.userId)return Response.json({error:'原帳號已變更或缺少原帳號識別；請回到原帳號恢復存檔操作。',scopeMismatch:true},{status:409});
      const management=saveManagementInput.safeParse(input);
      if(!management.success)return Response.json({error:'存檔操作無效。'},{status:400});
      if(management.data.operation==='delete')return Response.json({...await deleteWorldSave(user.userId,management.data),operationScope:user.userId},{headers:{'Cache-Control':'no-store'}});
      const copied=await copyWorldSave(user.userId,management.data);
      return Response.json({...copied.result,operationScope:user.userId},{status:copied.created?201:200,headers:{'Cache-Control':'no-store'}});
    }
    const accepted=confirmOpeningSchema.safeParse(input);
    if(!accepted.success)return Response.json({error:'請由五步開局確認已保存的完成人物卡與世界配置。'},{status:400});
    const result=await confirmOpening(user.userId,accepted.data);
    return Response.json(result.saved,{status:result.created?201:200,headers:{'Cache-Control':'no-store'}});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'無法確認存檔保存結果，請保留原操作重試。'},{status:error instanceof SaveAccessError?error.status:503});}
}
