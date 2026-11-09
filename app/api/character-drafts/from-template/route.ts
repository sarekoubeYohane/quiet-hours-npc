import { getGitHubUser } from '@/lib/auth';
import { listCharacterTemplates,characterPresets } from '@/lib/character-template-store';
import { loadCharacterDraft,writeCharacterDraft } from '@/lib/character-draft-store';
import { characterDraftFieldNames,characterDraftForClient,type TextProvenance } from '@/lib/character-drafts';
export const dynamic='force-dynamic';
const reply=(body:object,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'請從人物頁操作。'},403);
 try{
  const user=await getGitHubUser();if(!user)return reply({error:'請先登入。'},401);
  const raw=await request.text();if(raw.length>3000)return reply({error:'操作內容過長。'},400);
  let parsed:unknown;try{parsed=JSON.parse(raw);}catch{return reply({error:'請提供有效的操作內容。'},400);}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return reply({error:'操作格式無效。'},400);
  const input=parsed as {id?:string;templateId?:string;templateVersion?:number;operationScope?:string};
  if(Object.keys(input).sort().join(',')!=='id,operationScope,templateId,templateVersion'||typeof input.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.id)||typeof input.templateId!=='string'||!Number.isSafeInteger(input.templateVersion))return reply({error:'請指定文字範本及新草稿身分。'},400);
  if(input.operationScope!=='account-operations:'+user.userId)return reply({error:'原帳號已變更，請先恢復原帳號的操作。'},409);
  const existing=await loadCharacterDraft(user.userId,input.id);
  if(existing)return existing.sourceTemplate?.id===input.templateId&&existing.sourceTemplate.version===input.templateVersion?reply({draft:characterDraftForClient(existing,user.userId)}):reply({error:'此草稿身分已使用，原內容未覆寫。'},409);
  const source=[...characterPresets(),...await listCharacterTemplates(user.userId)].find(value=>value.id===input.templateId&&value.version===input.templateVersion);
  if(!source)return reply({error:'找不到原版本的文字範本，請重新選擇；既有草稿不會改寫。'},409);
  const fields={...source.fields,startLocation:''};
  const provenance=Object.fromEntries(characterDraftFieldNames.map(field=>[field,{kind:fields[field].trim()?'unknown':'empty',sourceText:fields[field],materiallyEdited:false} satisfies TextProvenance]));
  const draft=await writeCharacterDraft(user.userId,{id:input.id,version:0,concept:'',fields,provenance,sourceTemplate:{id:source.id,version:source.version}});
  return draft?reply({draft:characterDraftForClient(draft,user.userId)}):reply({error:'草稿版本衝突，請恢復原草稿。'},409);
 }catch{return reply({error:'建立草稿結果尚未確認，請使用原操作恢復。'},503);}
}
