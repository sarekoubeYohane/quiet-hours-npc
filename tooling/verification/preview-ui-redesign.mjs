// Local-only preview: real pages, routes and isolated disk SQLite; no external traffic.
import http from 'node:http';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {startApp} from './real-route-runtime.mjs';
import {completeCharacterFields} from './opening-journey.mjs';
const port=Number(process.env.NPC_PREVIEW_PORT||5190);
const host=process.env.NPC_PREVIEW_HOST==='localhost'?'localhost':'127.0.0.1';
const directory=process.env.NPC_PREVIEW_DIRECTORY||'outputs/ui-redesign';
await mkdir(directory,{recursive:true});
const control={fault:undefined,modelFail:false};
const app=await startApp({port,databasePath:resolve(directory,'acceptance.sqlite'),
 onRequest(req,res){
  const fault=control.fault;
  if(fault&&req.method===fault.method&&req.url.split('?')[0]===fault.path){control.fault=undefined;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'模擬連線失敗：內容未寫入，請保留輸入並重試。'}));return true;}
 },
 modelResponder(request){
  if(control.modelFail){control.modelFail=false;return new Response('controlled unavailable',{status:503});}
  const input=JSON.parse(request.messages.at(-1).content);
  if(input.task==='character-card-assessment-v1')return {bonuses:[]};
  if(input.task==='opening-arrangement-v1'){
   return {characters:input.city.characters.map(actor=>{const place=input.city.places.find(p=>p.id===actor.placeId)||input.city.places[0];const scene=input.scenes.find(s=>s.id===place.templateId&&s.version===place.version);return {templateId:actor.templateId,placeId:place.id,roomId:actor.roomId||scene.rooms[0].id,homeId:null,homeRoomId:null,workplaceIds:[],ownedPlaceIds:[]};}),backgroundPeople:[],relationships:[],accessGrants:[],finalization:{spaces:[],walks:[]}};
  }
  // Character text completion returns only the fields requested by its schema.
  const schema=request.response_format?.json_schema?.schema;
  const fields=completeCharacterFields('林澄');
  if(schema?.properties&&Object.keys(schema.properties).every(key=>key in fields))return Object.fromEntries(Object.keys(schema.properties).map(key=>[key,fields[key]]));
  throw Error('Unsupported mock model task; external dispatch remains disabled');
 }
});
const entry=`http://${host}:${port+1}`;
const appUrl=app.url.replace('127.0.0.1',host);
const login=http.createServer(async(req,res)=>{
 const url=new URL(req.url,entry);
 if(url.pathname==='/start'){
  const account=url.searchParams.get('account')||'ui-redesign-demo';
  if(!/^[a-zA-Z0-9_-]{1,60}$/.test(account)){res.writeHead(400).end();return;}
  res.writeHead(303,{'Set-Cookie':`qh_local_owner=${account}; Path=/; HttpOnly; SameSite=Lax`,Location:appUrl}).end();return;
 }
 if(url.pathname==='/control'&&req.method==='POST'){
  let text='';for await(const chunk of req)text+=chunk;const input=JSON.parse(text);
  if(input.fault)control.fault=input.fault;if(input.modelFail)control.modelFail=true;
  res.writeHead(200,{'Content-Type':'application/json'}).end('{"ok":true}');return;
 }
 if(url.pathname==='/status'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({modelCalls:app.modelRequests.length,app:app.url,database:app.sqlitePath}));return;}
 res.writeHead(404).end();
});
await new Promise(resolve=>login.listen(port+1,'127.0.0.1',resolve));
console.log('LOCAL_UI_ENTRY='+entry+'/start');
console.log('LOCAL_UI_APP='+appUrl);
console.log('ISOLATED_DATABASE='+app.sqlitePath);
process.on('SIGINT',async()=>{await new Promise(resolve=>login.close(resolve));await app.close();process.exit(0);});
