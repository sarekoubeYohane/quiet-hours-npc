// Local acceptance harness: real vinext App Router/pages/API handlers and SQL.
// Only identity, D1 hosting and the model HTTP boundary are replaced. No world
// fixture, test product route, source mutation or external model traffic.
import {createRequire} from 'node:module';
import {mkdtemp, readFile, writeFile, readdir, rm, chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import './no-network.mjs';
import http from 'node:http';

export async function startApp({root=process.cwd(), port=0, databasePath, modelResponder}={}) {
  root=resolve(root);
  if(!port){const probe=http.createServer();await new Promise(done=>probe.listen(0,'127.0.0.1',done));port=probe.address().port;await new Promise(done=>probe.close(done));}
  const require=createRequire(join(root,'package.json'));
  const {createServer}=await import(pathToFileURL(require.resolve('vite')).href);
  const {default:vinext}=await import(pathToFileURL(join(root,'node_modules/vinext/dist/index.js')).href);
  const directory=await mkdtemp(join(tmpdir(),'quiet-real-routes-'));
  await chmod(directory,0o700);
  const cacheDir=join(root,'node_modules','.vite-'+basename(directory));
  const sqlitePath=databasePath || join(directory,'acceptance.sqlite');
  const db=new DatabaseSync(sqlitePath);
  await chmod(sqlitePath,0o600);
  db.exec('CREATE TABLE IF NOT EXISTS acceptance_migrations (name TEXT PRIMARY KEY)');
  for(const file of (await readdir(join(root,'drizzle'))).filter(x=>x.endsWith('.sql')).sort()) {
    if(db.prepare('SELECT name FROM acceptance_migrations WHERE name=?').get(file))continue;
    db.exec(await readFile(join(root,'drizzle',file),'utf8'));
    db.prepare('INSERT INTO acceptance_migrations VALUES (?)').run(file);
  }
  db.close();
  const modelRequests=[], requests=[];
  const relay=http.createServer(async(req,res)=>{
    try {
      if(req.method!=='POST'||req.url!=='/model'){res.writeHead(404);res.end();return;}
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const body=Buffer.concat(chunks).toString();
      const request=JSON.parse(body);modelRequests.push(request);
      if(!modelResponder)throw Error('Controlled model response was not configured; external dispatch is forbidden');
      const reply=await modelResponder(request,modelRequests.length);
      const response=reply instanceof Response?reply:Response.json({model:request.model,usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify(reply)},finish_reason:'stop'}]});
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
    }catch(error){res.writeHead(503,{'Content-Type':'text/plain'});res.end(String(error));}
  });
  await new Promise(done=>relay.listen(0,'127.0.0.1',done));
  const modelUrl=`http://127.0.0.1:${relay.address().port}/model`;
  const bindings=join(directory,'bindings.mjs'), auth=join(directory,'auth.mjs');
  await writeFile(bindings,`import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync(${JSON.stringify(sqlitePath)});
export function closeDatabase(){db.close();}
function statement(sql,args=[]){return {bind(...values){return statement(sql,values)},
async all(){return {results:db.prepare(sql).all(...args)}},
async first(){return db.prepare(sql).get(...args)??null},
execute(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}}},
async run(){return this.execute()}};}
const DB={prepare:statement,async batch(statements){db.exec('BEGIN IMMEDIATE');try{const results=statements.map(value=>value.execute());db.exec('COMMIT');return results;}catch(error){db.exec('ROLLBACK');throw error;}}};
export const env={APP_ENV:'local',AUTH_ORIGIN:${JSON.stringify(`http://127.0.0.1:${port}`)},DB,MODEL_KEY_ENCRYPTION_SECRET:${JSON.stringify(createHash('sha256').update('local-acceptance-only:'+sqlitePath).digest('hex'))}};
`);
  await writeFile(auth,`import {headers} from 'next/headers';
export const githubSignInPath='/api/auth/github',githubCallbackPath='/api/auth/github/callback',githubSignOutPath='/api/auth/logout';
export async function getGitHubUser(){const h=await headers();const owner=(h.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('qh_local_owner='))?.slice(15);return owner&&/^[a-zA-Z0-9:_-]{1,80}$/.test(owner)?{userId:owner,displayName:'local acceptance identity'}:null;}
export async function startGitHubLogin(){return new Response('Local identity boundary: use qh_local_owner cookie',{status:503})}
export const finishGitHubLogin=startGitHubLogin,signOut=startGitHubLogin;
`);
  const commit=execFileSync('git',['rev-parse','--short','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const builtAt=new Date().toISOString();
  const boundary={
    name:'local-acceptance-boundaries',enforce:'pre',
    resolveId(source,importer){
      if(source==='cloudflare:workers')return bindings;
      if(source==='@/lib/auth'||source===join(root,'lib/auth.ts')||source===join(root,'lib/auth')||(source==='./auth'&&importer?.startsWith(join(root,'lib'))))return auth;
    },
    transform(source,id){
      if(id.split('?')[0]!==join(root,'lib/model-adapter.ts'))return;
      const expected='options.fetcher || fetch';
      if(!source.includes(expected))throw Error('Model boundary changed: update the acceptance harness before testing');
      return source.replace(expected,`((_url, init) => (options.fetcher || fetch)(${JSON.stringify(modelUrl)}, {...init, headers:{'Content-Type':'application/json'}}))`);
    },
    configureServer(server){server.middlewares.use((req,_res,next)=>{requests.push({method:req.method,url:req.url});next();});},
  };
  let server;
  try {
    server=await createServer({root,configFile:false,cacheDir,plugins:[boundary,vinext()],define:{__GIT_COMMIT__:JSON.stringify(commit),__BUILT_AT__:JSON.stringify(builtAt)},server:{host:'127.0.0.1',port,strictPort:port!==0,fs:{allow:[root,directory]}},clearScreen:false});
    await server.listen();
  }catch(error){await new Promise(done=>relay.close(done));await rm(cacheDir,{recursive:true,force:true});await rm(directory,{recursive:true,force:true});throw error;}
  const url=`http://127.0.0.1:${server.httpServer.address().port}`;
  return {url,commit,builtAt,sqlitePath,requests,modelRequests,
    async close(){await server.environments.rsc.runner.import(bindings).then(module=>module.closeDatabase());await server.close();await new Promise(done=>relay.close(done));await rm(cacheDir,{recursive:true,force:true});await rm(directory,{recursive:true,force:true});},
  };
}
