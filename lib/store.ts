import { env } from 'cloudflare:workers';
import { type World } from './world';
export function database(){if(!env.DB)throw Error('儲存服務暫時無法使用');return env.DB;}
export async function loadWorld(owner:string){const db=database();const row=await db.prepare('SELECT state, version FROM worlds WHERE owner = ?').bind(owner).first<{state:string;version:number}>();if(!row)throw Error('無法讀取世界');return {world:JSON.parse(row.state) as World,version:row.version};}
