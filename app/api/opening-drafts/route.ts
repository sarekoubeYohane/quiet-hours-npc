import { getGitHubUser } from '@/lib/auth';
import { openingInputSchema,readOpeningDraft,listOpeningDrafts,saveOpeningDraft } from '@/lib/opening-drafts';
import { SaveAccessError } from '@/lib/world-saves';
import { z } from 'zod';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const failure=(error:unknown)=>reply({error:error instanceof SaveAccessError?error.message:'未同步：暫時無法保存開局草稿，請保留輸入並恢復原操作。'},error instanceof SaveAccessError?error.status:503);
export async function GET(request:Request){try{const user=await getGitHubUser();if(!user)return reply({error:'請先登入。'},401);const id=new URL(request.url).searchParams.get('id');if(!id)return reply({operationScope:user.userId,drafts:await listOpeningDrafts(user.userId)});if(!z.string().uuid().safeParse(id).success)return reply({error:'草稿識別碼無效。'},400);return reply({operationScope:user.userId,...await readOpeningDraft(user.userId,id)});}catch(error){return failure(error);}}
export async function POST(request:Request){try{if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'請從本站編輯開局。'},403);const user=await getGitHubUser();if(!user)return reply({error:'請先登入。'},401);const raw=await request.text();if(raw.length>128000)return reply({error:'輸入過長。'},400);let value:unknown;try{value=JSON.parse(raw);}catch{return reply({error:'開局草稿格式無效，請保留輸入核對。'},400);}const input=openingInputSchema.safeParse(value);if(!input.success)return reply({error:'開局草稿格式無效，請保留輸入核對。'},400);return reply({operationScope:user.userId,...await saveOpeningDraft(user.userId,input.data)});}catch(error){return failure(error);}}
