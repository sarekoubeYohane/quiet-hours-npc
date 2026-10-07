import { env } from 'cloudflare:workers';
import { seedWorld, type World } from './world';
export function database(){if(!env.DB)throw Error('儲存服務暫時無法使用');return env.DB;}
export async function loadWorld(owner:string){const db=database();await db.prepare('INSERT OR IGNORE INTO worlds (owner, state, version, locked_until) VALUES (?, ?, 0, 0)').bind(owner,JSON.stringify(seedWorld())).run();const row=await db.prepare('SELECT state, version FROM worlds WHERE owner = ?').bind(owner).first<{state:string;version:number}>();if(!row)throw Error('無法讀取世界');return {world:JSON.parse(row.state) as World,version:row.version};}
