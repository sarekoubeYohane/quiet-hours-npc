/* eslint-disable @typescript-eslint/no-require-imports */
const {fixtureDecision}=require('./pursuit-fixture.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { writeFile } = require('node:fs/promises');
const build = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, `${name}.cjs`));

test('reload recovers after lease timeout, committed lost response and HTML outage', async () => {
 const { Window } = await import('happy-dom');
 const window = new Window({url:'https://test.invalid'});
 for(const name of [...Object.getOwnPropertyNames(window).filter(name=>/^(HTML|SVG|Event|CustomEvent|ShadowRoot)/.test(name)), 'window','document','navigator','HTMLElement','Element','Node','DocumentFragment','MutationObserver','ResizeObserver','getComputedStyle','sessionStorage','requestAnimationFrame','cancelAnimationFrame']){
  Object.defineProperty(globalThis,name,{configurable:true,value:typeof window[name]==='function'&&['getComputedStyle','requestAnimationFrame','cancelAnimationFrame'].includes(name)?window[name].bind(window):window[name]});
 }
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const React=require('react'),{createRoot}=require('react-dom/client');
 const esbuild=require(require.resolve('esbuild',{paths:[require.resolve('vite')]}));
 const output=path.join(process.env.QUIET_HOURS_TEST_BUILD,'world-app.cjs');
 const result=await esbuild.build({entryPoints:['components/world-app.tsx'],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',alias:{'@':process.cwd()},external:['react','react/*','react-dom','react-dom/*']});
 // Resolve the real React singleton from the repository, including the JSX runtime.
 const code=result.outputFiles[0].text.replace(/require\("(react(?:-dom)?(?:\/[^" ]+)?)"\)/g,(_,name)=>`require(${JSON.stringify(require.resolve(name))})`);
 await writeFile(output,code);
 const WorldApp=require(output).default;
 const {POST,GET}=build('route'),store=build('store');
 store.install(require('./fixtures/ai-world.cjs')(build('world').seedWorld)());
 const historyTurns=Number(process.env.RECOVERY_HISTORY_TURNS || 0);
 const send=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:`${Date.now()}:${crypto.randomUUID()}`,mode:'demo',...body})}));
 for(let turn=0;turn<historyTurns;turn++){
  if(turn===17)assert.equal((await send({operation:'intervene',target:'all',text:'所有人收到咖啡館通知：下午兩點有自由參加的手作交流，沒有任何人必須出席。'})).status,200);
  assert.equal((await send({operation:'advance',minutes:15})).status,200);
 }

 let waiting=true,fault=null,committed=false;
 const payloads=[];
 const originalFetch=global.fetch,clock=Date.now,timer=global.setTimeout,signalTimeout=AbortSignal.timeout;
 const requestedTimeouts=[];AbortSignal.timeout=ms=>{requestedTimeouts.push(ms);return signalTimeout(ms);};
 let instant=clock();Date.now=()=>instant;
 // Accelerate transport waits and visual playback; only injected waits advance wall time.
 global.setTimeout=(fn,ms,...args)=>timer(fn,ms<=3000||(process.env.RECOVERY_AUTOMATIC&&ms===30000)?0:ms,...args);
 global.fetch=async(_url,options)=>{
  if(fault){instant+=1000;return new Response(fault.body,{status:fault.status,headers:{'Content-Type':fault.type}});}
  if(!options?.method)return GET(new Request(new URL(_url,'https://test.invalid')));
  assert.equal(options.headers['X-World-Time-Policy'],'round-v1');
  payloads.push(options.body);
  if(waiting){instant+=1000;return Response.json({retryable:true,error:'世界正處理另一個回合，正在等待後重試。'},{status:409});}
  const response=await POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{...options.headers,origin:'https://test.invalid'},body:options.body}));
  if(!committed){committed=true;waiting=true;throw Error('response lost');}
  return response;
 };
 const root=createRoot(document.body.appendChild(document.createElement('div')));
 const button=name=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===name);
 const settle=async()=>{
  const deadline=performance.now()+5000;
  do{
   await React.act(async()=>{await new Promise(resolve=>timer(resolve,5));});
   if(document.querySelector('.advance-button')?.textContent.trim()==='下一回合')return;
  }while(performance.now()<deadline);
  assert.fail('world UI did not finish the request/playback within 5 seconds');
 };
 const click=async name=>{assert.ok(button(name),`button ${name}`);await React.act(async()=>{button(name).click();});await settle();};
 try{
  await React.act(async()=>root.render(React.createElement(WorldApp,{signInPath:'/login',displayName:'fixture',environment:{caption:'fixture',builtAtLabel:'unknown'}})));
  await settle();await click(process.env.RECOVERY_AUTOMATIC?'開始自動':'下一回合');
  assert.match(document.querySelector('[role=alert]').textContent,/等待逾時/);
  waiting=false;await click('重試未完成操作');
  assert.match(document.querySelector('[role=alert]').textContent,/等待逾時/);
  assert.equal((await (await GET()).json()).world.turn,historyTurns+1);
  for(const injected of [
   {body:'<!DOCTYPE html><title>Service unavailable</title>',status:503,type:'text/html'},
   {body:'',status:502,type:'application/json'},
   {body:'{broken',status:200,type:'application/json'},
   {body:'null',status:200,type:'application/json'},
   {body:'{}',status:200,type:'application/json'},
  ]){
   fault=injected;await click('重新載入');
   const message=document.querySelector('[role=alert]').textContent;
   assert.doesNotMatch(message,/Unexpected token|not valid JSON/);
   assert.match(message,new RegExp(`HTTP ${injected.status}`));
   assert.equal(button('下一回合').disabled,true);
   assert.ok(sessionStorage.getItem('quiet-hours:pending:test-owner'));
  }
  fault=null;waiting=false;await click('重新載入');
  assert.equal(!!button('重試未完成操作'),false,'reload must reconcile the saved operation');
  assert.equal(button('下一回合').disabled,false);
  assert.equal(new Set(payloads).size,1);
  assert.ok(requestedTimeouts.includes(445000),'new client waits for the complete bounded round');assert.equal(requestedTimeouts.includes(125000),false);
  assert.equal((await (await GET()).json()).world.turn,historyTurns+1);
  // A reload/foreground read must not submit a saved request the server never accepted.
  const unknown=JSON.stringify({operation:'advance',minutes:15,mode:'demo',operationScope:'test-owner',operationId:`${instant}:${crypto.randomUUID()}`});
  sessionStorage.setItem('quiet-hours:pending:test-owner',unknown);
  const sent=payloads.length;
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
  await React.act(async()=>document.dispatchEvent(new window.Event('visibilitychange')));await settle();
  assert.ok(button('重試未完成操作'));assert.equal(button('下一回合').disabled,true);
  assert.equal(payloads.length,sent);assert.equal(sessionStorage.getItem('quiet-hours:pending:test-owner'),unknown);
  // An HTTP rejection carrying HTML is not a confirmed application rejection.
  for(const body of ['<!DOCTYPE html><title>Proxy error</title>','{}']){
   fault={body,status:400,type:body==='{}'?'application/json':'text/html'};
   await click('重試未完成操作');
   assert.ok(sessionStorage.getItem('quiet-hours:pending:test-owner'),'malformed 4xx must retain pending');
  }
  fault=null;
  instant+=86400001;
  await React.act(async()=>document.dispatchEvent(new window.Event('visibilitychange')));await settle();
  assert.match(document.querySelector('[role=alert]').textContent,/結果仍無法確認/);
  assert.equal(sessionStorage.getItem('quiet-hours:pending:test-owner'),unknown);
  await click('重試未完成操作');
  assert.equal(sessionStorage.getItem('quiet-hours:pending:test-owner'),unknown);
  assert.equal((await (await GET()).json()).world.turn,historyTurns+1);
  // A durably recorded failure unlocks controls and retains its diagnostic cause.
  instant++;
  const failed={operation:'takeover',mode:'demo',operationId:`${instant}:${crypto.randomUUID()}`};
  store.throwBeforeNextSave();
  assert.equal((await send(failed)).status,502);
  sessionStorage.setItem('quiet-hours:pending:test-owner',JSON.stringify(failed));
  await React.act(async()=>document.dispatchEvent(new window.Event('visibilitychange')));await settle();
  assert.equal(!!button('重試未完成操作'),false);
  assert.equal(button('下一回合').disabled,false);
  assert.match(document.querySelector('[role=alert]').textContent,/Unknown commit outcome/);
  // A durable uncertain tombstone does not unlock or re-dispatch the paid request.
  await send({operation:'set-model-key',mode:'openai',key:'test-key'});
  instant++;
  const uncertain={operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15,operationId:`${instant}:${crypto.randomUUID()}`};
  let release,entered,modelCalls=0;
  const gate=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>entered=resolve);
  const transport=global.fetch;
  global.fetch=async(input,options)=>{
   if(String(input).startsWith('https://api.openai.com/')){modelCalls++;entered();await gate;throw Error('provider unavailable');}
   return transport(input,options);
  };
  const running=send(uncertain);
  try{
   await ready;instant+=440000;
   const expired=await send(uncertain);
   assert.equal((await expired.json()).operationUncertain,true);
   const saved=JSON.stringify(uncertain);sessionStorage.setItem('quiet-hours:pending:test-owner',saved);
   await React.act(async()=>document.dispatchEvent(new window.Event('visibilitychange')));await settle();
   assert.equal(sessionStorage.getItem('quiet-hours:pending:test-owner'),saved);
   assert.equal(button('下一回合').disabled,true);
   await click('重試未完成操作');
   assert.equal(sessionStorage.getItem('quiet-hours:pending:test-owner'),saved);assert.equal(modelCalls,1);
   release();await running;
   assert.equal((await (await GET()).json()).world.aiUsage.totalCalls,1);
   assert.equal((await (await GET()).json()).world.turn,historyTurns+1);
  }finally{release();await running;global.fetch=transport;}
  // A rejected candidate remains inspectable after a fresh UI read without
  // replaying a paid action or inserting technical details in story events.
  const scene=await build('acceptance-scene').enterAcceptanceScene(build('world').seedWorld());
  scene.adjudication={provider:'openai',model:'gpt-6.1-sol'};
  scene.characters.forEach(c=>{if(c.id!=='owner')c.control={mode:'taken-over'};});
  // A live UI rejects older versions; preserve monotonic versions when the
  // fixture switches to its next isolated scene.
  store.replaceCommittedWorld(scene);sessionStorage.clear();
  await send({operation:'set-model-key',mode:'openai',key:'test-key',worldContext:scene.contextId});
  const routeTransport=global.fetch;let rejectedCalls=0;
  global.fetch=async(input,options)=>{
   if(!String(input).startsWith('https://api.openai.com/'))return routeTransport(input,options);
   rejectedCalls++;
   const task=JSON.parse(JSON.parse(options.body).messages[1].content);
   const value=task.contractVersion==='world-adjudication.v1'
    ?{status:'accepted',completionMinutes:15,effects:[{kind:'consume',objectId:'acceptance-cup',expectedRevision:1}],check:null,stages:[]}
    :{type:'propose',target:'acceptance-cup',content:'喝點茶',purpose:'休息',mood:'平靜',durationMinutes:15,intents:[]};
   return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(options.body).messages[1].content),value))}}]});
  };
  try{
   const rejected=await send({operation:'advance',minutes:15,mode:'openai',model:'gpt-6.1-sol',worldContext:scene.contextId});assert.equal(rejected.status,502);const rejectedBody=await rejected.json();assert.ok(rejectedBody.adjudicationFailure,JSON.stringify(rejectedBody));
   await click('重新載入');
   const details=document.querySelector('[data-adjudication-failure]');
   assert.ok(details,'reload exposes the saved candidate diagnosis');
   assert.match(details.textContent,/裁定候選不合法|本回合未提交/);
   assert.match(details.textContent,/owner|acceptance-cup|not_consumable/);
   assert.doesNotMatch(details.textContent,/test-key/);
   assert.equal(rejectedCalls,2);assert.equal((await (await GET()).json()).world.turn,0);
  }finally{global.fetch=routeTransport;}
 }finally{await React.act(async()=>root.unmount());global.fetch=originalFetch;Date.now=clock;global.setTimeout=timer;AbortSignal.timeout=signalTimeout;await window.happyDOM.close();}
});
