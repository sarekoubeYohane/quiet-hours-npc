import { getGitHubUser } from '@/lib/auth';
import { playerAccount,setPlayerAccount } from '@/lib/player-account-budget';
import { validBudgetLimits } from '@/lib/activities';
import { validPrice } from '@/lib/costs';
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export const dynamic='force-dynamic';
export async function GET(request?:Request){try{const user=await getGitHubUser();const expected=request&&new URL(request.url).searchParams.get('operationScope');if(user&&expected!==undefined&&expected!==null&&expected!==user.userId)return reply({error:'原帳號已變更，原設定未同步。',scopeMismatch:true},409);return user?reply(await playerAccount(user.userId)):reply({error:'請先登入。'},401);}catch{return reply({error:'暫時無法讀取帳號玩家預算。'},503);}}
export async function POST(request:Request){
 try{
  const user=await getGitHubUser();if(!user)return reply({error:'請先登入。'},401);
  if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'請從本站設定帳號預算。'},403);
  const raw=await request.text();if(raw.length>4000)return reply({error:'設定內容過長。'},400);
  let input:Record<string,unknown>;try{input=JSON.parse(raw);}catch{return reply({error:'請提供有效的設定JSON。'},400);}
  if(!input||typeof input!=='object'||Array.isArray(input))return reply({error:'請提供完整的帳號預算或單價設定。'},400);
  if(input.operationScope!==user.userId)return reply({error:'登入帳號已變更；原設定輸入仍保留，請重新登入並核對。',scopeMismatch:true},409);
  if(!Number.isSafeInteger(input.version)||Number(input.version)<0||Object.keys(input).some(key=>!['version','operationScope','limits','price'].includes(key))||!(validBudgetLimits(input.limits)&&input.price===undefined||validPrice(input.price)&&input.limits===undefined))return reply({error:'請核對完整的玩家預算或自訂單價。'},400);
  return reply(await setPlayerAccount(user.userId,input.limits?{limits:input.limits as {calls:number|null;tokens:number|null}}:{price:input.price as Parameters<typeof setPlayerAccount>[1]['price']},Number(input.version)));
 }catch(error){return reply({error:error instanceof Error?error.message:'未同步：帳號預算或價格尚未確認，輸入仍保留。'},typeof error==='object'&&error&&'status' in error?Number(error.status):503);}
}
