import '../../tooling/verification/no-network.mjs';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),esbuild=require(require.resolve('esbuild',{paths:[require.resolve('vite')]}));
const paths={openings:'/api/opening-drafts',drafts:'/api/character-drafts',form:'/api/character-drafts/form',cards:'/api/character-cards',settings:'/api/model-settings',world:'/api/world',people:'/api/character-templates',scenes:'/api/scene-templates',saves:'/api/saves',fromTemplate:'/api/character-drafts/from-template',generation:'/api/character-drafts/generate'};
/** Real product routes/SQLite; only hosting, auth, dice and requested fault seams. */
export async function characterApiFixture(names=Object.keys(paths)){
 const db=new DatabaseSync(':memory:');for(const name of (await readdir('drizzle')).filter(name=>name.endsWith('.sql')).sort())db.exec(await readFile('drizzle/'+name,'utf8'));
 const context={owner:'a',fault:null,dice:0,random:()=>{context.dice++;return .5;}};
 function prepare(sql,values=[]){return {
  bind(...args){return prepare(sql,args);},async all(){return {results:db.prepare(sql).all(...values)};},
  async first(){const formed=sql.startsWith('UPDATE character_drafts')&&typeof values[0]==='string'&&JSON.parse(values[0]).formation;const fault=formed&&context.formFault||sql.includes('RETURNING')&&context.fault;if(formed&&context.formFault)context.formFault=null;else if(fault)context.fault=null;if(fault==='before')throw Error('before');const result=db.prepare(sql).get(...values)??null;if(fault==='after')throw Error('after');return result;},
  execute(){const fault=sql.startsWith('INSERT INTO opening_drafts')&&context.draftFault;if(fault)context.draftFault=null;if(fault==='before')throw Error('before draft');const result={meta:{changes:Number(db.prepare(sql).run(...values).changes)}};if(fault==='after')throw Error('after draft');return result;},async run(){return this.execute();},
 };}
 context.env={APP_ENV:'local',AUTH_ORIGIN:'https://test.invalid',MODEL_KEY_ENCRYPTION_SECRET:'ab'.repeat(32),DB:{prepare,async batch(statements){const fault=context.batchFault;context.batchFault=null;if(context.beforeBatch){const before=context.beforeBatch;context.beforeBatch=null;await before();}if(fault==='before')throw Error('before batch');db.exec('BEGIN IMMEDIATE');try{const result=statements.map(statement=>statement.execute());db.exec('COMMIT');if(fault==='after')throw Error('after batch');return result;}catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}}}};
 const built=await esbuild.build({entryPoints:names.map(name=>'app'+paths[name]+'/route.ts'),outdir:'/tmp/character-api-test',bundle:true,write:false,platform:'node',format:'cjs',alias:{'@':process.cwd()},plugins:[{name:'hosting-boundaries',setup(build){
  build.onLoad({filter:/character-formation\.ts$/},async args=>({contents:(await readFile(args.path,'utf8')).replaceAll('Math.random','context.random'),loader:'ts'}));
  build.onResolve({filter:/^(cloudflare:workers|@\/lib\/auth)$/},args=>({path:args.path,namespace:'boundary'}));
  build.onLoad({filter:/.*/,namespace:'boundary'},args=>({contents:args.path==='cloudflare:workers'?'export const env = context.env;':'export const getGitHubUser = async () => context.owner ? {userId:context.owner} : null;'}));
 }}]});
 const routes=Object.fromEntries(built.outputFiles.map((file,index)=>{const compiled={exports:{}};new Function('module','exports','require','context',file.text)(compiled,compiled.exports,require,context);return [names[index],compiled.exports];}));
 const read=async(route,path)=>{const response=await route.GET(new Request('https://test.invalid'+path));return {status:response.status,body:await response.json()};};
 const post=async(route,payload,path)=>{if([routes.drafts,routes.people,routes.scenes,routes.settings].includes(route))payload={accountScope:'account-operations:'+context.owner,...payload};if(route===routes.openings||route===routes.saves)payload={operationScope:context.owner,...payload};const response=await route.POST(new Request('https://test.invalid'+path,{method:'POST',headers:{Origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify(payload)}));return {status:response.status,body:await response.json()};};
 const request=(body,save)=>body===undefined?read(routes.settings,paths.settings+(save?'?save='+save:'')):post(routes.settings,body,paths.settings+(save?'?save='+save:''));
 const worldRequest=async(payload,save)=>{const path=paths.world+(save?'?save='+save:'?workspace=account'),current=await read(routes.world,path);return payload===undefined?current:post(routes.world,{operationId:Date.now()+':'+crypto.randomUUID(),mode:'demo',operationScope:current.body.operationScope,worldContext:current.body.world.contextId,...payload},path);};
 return {db,context,routes,post,read,request,worldRequest};
}
