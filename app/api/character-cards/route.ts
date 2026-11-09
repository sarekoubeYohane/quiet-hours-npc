import { getGitHubUser } from '@/lib/auth';
import { listCharacterCards, completeCharacterCard } from '@/lib/character-card-store';
import { loadCharacterDraft } from '@/lib/character-draft-store';
import { characterDraftForClient } from '@/lib/character-drafts';
export const dynamic='force-dynamic';
const reply=(body:object,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(){try{const user=await getGitHubUser();return user?reply({cards:await listCharacterCards(user.userId)}):reply({error:'請先登入。'},401);}catch{return reply({error:'暫時無法讀取完成人物卡。'},503);}}
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'請從人物頁操作。'},403);
 try{
  const user=await getGitHubUser();if(!user)return reply({error:'請先登入。'},401);
  const input=await request.json() as {id?:string;version?:number};
  if(Object.keys(input).sort().join(',')!=='id,version'||typeof input.id!=='string'||!Number.isSafeInteger(input.version)||input.version!<0)return reply({error:'完成人物卡保存身分無效。'},400);
  const card=await completeCharacterCard(user.userId,input.id,input.version!);if(!card)return reply({error:'草稿尚未形成、配點不合法或版本已變更；原輸入已保留。'},409);
  const draft=await loadCharacterDraft(user.userId,input.id);return reply({card,...(draft?{draft:characterDraftForClient(draft)}:{})});
 }catch{return reply({error:'完成人物卡保存結果尚未確認，請用原草稿恢復保存。'},503);}
}
