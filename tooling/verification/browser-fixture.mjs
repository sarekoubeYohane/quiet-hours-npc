import { createRequire } from 'node:module';
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import http from 'node:http';
const repo=resolve(process.env.FIXTURE_REPO||process.cwd());
process.chdir(repo);
const require=createRequire(join(repo,'package.json'));
const ts=require('typescript');
const esbuild=require(require.resolve('esbuild',{paths:[require.resolve('vite')]}));
const directory=await mkdtemp(join(tmpdir(),'quiet-browser-'));
const sources=(await readdir('lib')).filter(x=>x.endsWith('.ts')).map(x=>[`lib/${x}`,x.slice(0,-3)]);
sources.push(['app/api/world/route.ts','route']);
for (const [source,output] of sources) {
 const result=ts.transpileModule(await readFile(source,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.CommonJS}});
 const code=result.outputText.replace(/require\("(?:@\/lib\/|\.\/)([^"/]+)"\)/g,'require("./$1.cjs")').replace('require("cloudflare:workers")','require("./cloudflare-workers.cjs")');
 await writeFile(join(directory,`${output}.cjs`),code);
}
  // Test fixtures are generated only in a temporary directory, never included in the Worker.
  // Worker bindings and vars are a mutable stub so tests can set APP_ENV and GIT_COMMIT.
  await writeFile(join(directory, 'cloudflare-workers.cjs'), 'exports.env = { APP_ENV: "local", AUTH_ORIGIN: "https://test.invalid", MODEL_KEY_ENCRYPTION_SECRET: "ab".repeat(32) };');
  await writeFile(join(directory, 'auth.cjs'), 'let userId = "test-owner"; exports.setUserId = id => { userId = id; }; exports.getGitHubUser = async () => ({ userId });');
  await writeFile(join(directory, 'store.cjs'), `
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(':memory:');
    db.exec(${JSON.stringify((await Promise.all((await readdir('drizzle')).filter(file=>file.endsWith('.sql')).sort().map(file=>readFile(join('drizzle',file),'utf8')))).join('\n'))});
    let conflict, uncertain, failBefore, failRead, budgetHook;
    exports.onNextBudgetReservation = hook => { budgetHook = hook; };
    exports.install = value => {
      db.exec('DELETE FROM worlds; DELETE FROM account_model_keys; DELETE FROM recall_dispatch_usage; DELETE FROM recall_index_entries'); conflict = undefined; uncertain = false; failBefore = false; failRead = false;
      db.prepare('INSERT INTO worlds (owner,state,version,locked_until) VALUES (?, ?, 0, 0)').run('test-owner', JSON.stringify(value));
    };
    exports.conflictOnNextSave = (replacement, options = {}) => { conflict = { replacement, ...options }; };
    exports.failNextOperationRead = () => { failRead = true; };
    exports.throwBeforeNextSave = () => { failBefore = true; };
    exports.throwAfterNextSave = () => { uncertain = true; };
    exports.installForOwner = (owner,value) => db.prepare('INSERT OR REPLACE INTO worlds (owner,state,version,locked_until,operations) VALUES (?, ?, 0, 0, ?)').run(owner, JSON.stringify(value), '{"floor":0,"results":{}}');
    exports.replaceCommittedWorld = value => db.prepare('UPDATE worlds SET state = ?, version = version + 1, locked_until = 0 WHERE owner = ?').run(JSON.stringify(value), 'test-owner');
    exports.snapshot = () => JSON.parse(db.prepare('SELECT state FROM worlds WHERE owner = ?').get('test-owner').state);
    exports.loadWorld = async owner => {
      const row = db.prepare('SELECT state, version FROM worlds WHERE owner = ?').get(owner);
      return { world: JSON.parse(row.state), version: row.version };
    };
    exports.database = () => ({ prepare(sql) { return { bind(...values) { return { async all() { return { results: db.prepare(sql).all(...values) }; }, async first() { if(failRead && sql.startsWith('SELECT operations')) { failRead = false; throw Error('D1 unavailable'); } return db.prepare(sql).get(...values) ?? null; }, async run() {
      if(sql.startsWith('INSERT OR IGNORE INTO recall_dispatch_usage') && budgetHook){const hook=budgetHook;budgetHook=undefined;await hook();}
      const finalSave = sql.startsWith('UPDATE worlds SET state = ?');
      if (finalSave && failBefore) { failBefore = false; throw Error('Unknown commit outcome'); }
      if (finalSave && conflict) {
        const { replacement, version = 10, lockedUntil = 0, owner = 'test-owner' } = conflict; conflict = undefined;
        if (replacement) {
          db.prepare('DELETE FROM worlds WHERE owner = ?').run('test-owner');
          db.prepare('INSERT INTO worlds (owner,state,version,locked_until) VALUES (?, ?, ?, ?)').run(owner, JSON.stringify(replacement), version, lockedUntil);
        }
        return { meta: { changes: 0 } };
      }
      const result = db.prepare(sql).run(...values);
      if (finalSave && uncertain) { uncertain = false; throw Error('Unknown commit outcome'); }
      return { meta: { changes: Number(result.changes) } };
    } }; } }; } });
  `);

const load=name=>require(join(directory,`${name}.cjs`));
const store=load('store'); store.install(load('world').seedWorld());
const {GET,POST}=load('route');
let now=Date.parse('2026-10-15T16:00:00Z'); Date.now=()=>now;
let modelCalls=0, modelFault=null; const requests=[];
globalThis.fetch=async(url,init)=>{
 if(!/^https:\/\/(api.openai.com|openrouter.ai)\//.test(String(url)))throw Error(`fixture blocked external network: ${url}`);
 modelCalls++; if(modelFault)return new Response('{}',{status:modelFault});
 const request=JSON.parse(init.body);
 return Response.json({model:request.model,usage:{prompt_tokens:1000,completion_tokens:200},choices:[{message:{content:JSON.stringify({type:'rest',target:'',content:'',mood:'平靜',durationMinutes:90,intents:[]})},finish_reason:'stop'}]});
};
const entry=join(directory,'entry.jsx');
await writeFile(entry,`import React from ${JSON.stringify(require.resolve('react'))};import {createRoot} from ${JSON.stringify(require.resolve('react-dom/client'))};import WorldApp from ${JSON.stringify(join(repo,'components/world-app.tsx'))};createRoot(document.getElementById('root')).render(<WorldApp signInPath="/login" displayName="browser fixture" environment={{caption:'local fixture',builtAtLabel:'fixed clock'}}/>);`);
const bundle=await esbuild.build({entryPoints:[entry],bundle:true,write:false,platform:'browser',format:'esm',jsx:'automatic',alias:{'@':repo},nodePaths:[join(repo,'node_modules')],define:{'process.env.NODE_ENV':'"development"'},loader:{'.png':'dataurl'}});
const js=bundle.outputFiles[0].text;
const postcss=require(require.resolve('postcss',{paths:[require.resolve('@tailwindcss/postcss')]}));
const compiled=await postcss([require('@tailwindcss/postcss')({base:repo})]).process(await readFile(join(repo,'app/globals.css'),'utf8'),{from:join(repo,'app/globals.css')});
let css=compiled.css;
const fontDirectory=process.env.BROWSER_FONT_DIR;
if(fontDirectory)css=(await readFile(join(fontDirectory,'index.css'),'utf8')).replaceAll('./files/','/__font/')+'\n'+css;
const server=http.createServer(async(req,res)=>{
 try {
 const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks).toString();
 const origin=`http://127.0.0.1:${server.address().port}`;const url=new URL(req.url,origin);
 if(url.pathname==='/__fixture'){
  const data=body?JSON.parse(body):{};
  if(data.advanceMs)now+=data.advanceMs;
  if('modelFault' in data)modelFault=data.modelFault;
  if(data.world)store.replaceCommittedWorld(data.world);
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({now,modelCalls,requests,world:store.snapshot()}));return;
 }
 if(url.pathname==='/api/world'){
  if(req.method==='POST')requests.push(JSON.parse(body));
  const request=new Request(url,{method:req.method,headers:{origin,...req.headers},...(req.method==='POST'?{body}:{})});
  const response=await (req.method==='POST'?POST(request):GET(request));
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 if(url.pathname.startsWith('/__font/')&&fontDirectory){const file=url.pathname.slice('/__font/'.length);if(!/^[a-zA-Z0-9_.-]+$/.test(file))throw Error('invalid font path');res.setHeader('Content-Type','font/woff2');res.end(await readFile(join(fontDirectory,'files',file)));return;}
 const publicFile=resolve(repo,'public',`.${url.pathname}`);
 if(publicFile.startsWith(join(repo,'public')+'/')){try{const asset=await readFile(publicFile);res.setHeader('Content-Type',url.pathname.endsWith('.png')?'image/png':url.pathname.endsWith('.svg')?'image/svg+xml':'application/octet-stream');res.end(asset);return;}catch{ /* fall through for SPA */ }}
 if(url.pathname==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(js);return;}
 if(url.pathname==='/app.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
 }catch(error){console.error(error);res.writeHead(500);res.end(String(error));}
});
await new Promise(resolve=>server.listen(Number(process.env.FIXTURE_PORT||0),'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`; console.log(`BROWSER_FIXTURE_URL=${url}`);
export {url,server,store,load,requests};
process.on('SIGTERM',()=>server.close());
