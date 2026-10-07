import { getChatGPTUser } from '@/app/chatgpt-auth';
import { loadWorld, database } from '@/lib/store';
import { demoDecision, resolve, record } from '@/lib/world';
import { aiDecision, directModels } from '@/lib/models';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const owner=async()=> (await getChatGPTUser())?.userId;
export async function GET(request:Request){const id=await owner();if(!id)return reply({error:'網站登入尚未完成，請按「用 ChatGPT 重新登入」。',signInRequired:true},401);try{return reply(await loadWorld(id));}catch{return reply({error:'暫時無法讀取世界，請稍後重試。'},503);}}
export async function POST(request:Request){const id=await owner();if(!id)return reply({error:'網站登入已失效，請重新登入。',signInRequired:true},401);if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'請從觀察室操作。'},403);let locked=false,lease=0;
try{const raw=await request.text();if(raw.length>16000)return reply({error:'輸入過長。'},400);const b=JSON.parse(raw) as {operation?:string;minutes?:number;mode?:string;key?:string;model?:string;text?:string;target?:string};
if(!['advance','intervene'].includes(b.operation||''))return reply({error:'無效操作。'},400);if(b.operation==='advance'&&![15,30].includes(b.minutes||0))return reply({error:'請選擇 15 或 30 分鐘。'},400);if(!['ai','openai','demo'].includes(b.mode||''))return reply({error:'模式無效。'},400);if(b.operation==='advance'&&b.mode!=='demo'&&(!b.key?.trim()||!b.model?.trim()))return reply({error:'請填入 API Key 與模型 ID。'},400);
if(b.mode==='openai'&&!directModels.includes(b.model||''))return reply({error:'請選擇網站支援的 OpenAI 模型。'},400);
const {world,version}=await loadWorld(id);if(b.operation==='intervene'&&(typeof b.text!=='string'||!b.text.trim()||b.text.length>500||(!world.characters.some(c=>c.id===b.target)&&b.target!=='all')))return reply({error:'請填入 1–500 字的事件，並選擇對象。'},400);
const db=database();lease=Date.now()+120000;const acquired=await db.prepare('UPDATE worlds SET locked_until = ? WHERE owner = ? AND locked_until < ? AND version = ?').bind(lease,id,Date.now(),version).run();if(!acquired.meta.changes)return reply({error:'世界正處理另一個回合，請稍候再試。'},409);locked=true;
if(b.operation==='intervene'){const targets=b.target==='all'?world.characters.map(c=>c.id):[b.target!];const name=world.characters.find(c=>c.id===b.target)?.name;record(world,'observer',b.target==='all'?`共同事件：${b.text!.trim()}`:`觀察者對 ${name} 說：「${b.text!.trim()}」`,'intervention',targets);}
else{world.minute+=b.minutes!;world.lastMode=b.mode!;const offset=world.turn%world.characters.length;const ordered=[...world.characters.slice(offset),...world.characters.slice(0,offset)];for(const c of ordered){const action=b.mode!=='demo'?await aiDecision(world,c,b.key!.trim(),b.model!.trim(),b.mode==='openai'?'openai':'openrouter'):demoDecision(world,c);try{resolve(world,c,action);}catch{record(world,c.id,`${c.name} 的行動未通過規則檢查，這段時間留在原地。`,'blocked',[c.id]);}}world.turn++;}
const saved=await db.prepare('UPDATE worlds SET state = ?, version = version + 1, locked_until = 0 WHERE owner = ? AND version = ? AND locked_until = ?').bind(JSON.stringify(world),id,version,lease).run();if(!saved.meta.changes)throw Error('儲存衝突，請重新載入再試。');return reply({world,version:version+1});
}catch(e){return reply({error:e instanceof Error&&e.name==='TimeoutError'?'模型回應逾時，本回合沒有儲存。':e instanceof Error?e.message:'操作失敗，請稍後再試。'},502);}finally{if(locked)await database().prepare('UPDATE worlds SET locked_until = 0 WHERE owner = ? AND locked_until = ?').bind(id,lease).run();}}
