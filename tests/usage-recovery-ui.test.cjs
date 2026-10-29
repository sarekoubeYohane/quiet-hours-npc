/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {writeFile}=require('node:fs/promises');
test('cost and analysis entries preserve interrupted usage uncertainty after reload',async()=>{
 const {Window}=await import('happy-dom'),window=new Window({url:'https://test.invalid'});
 for(const name of ['window','document','navigator','HTMLElement','HTMLFormElement','Element','Node','DocumentFragment','MutationObserver','ResizeObserver','getComputedStyle','sessionStorage','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,name,{configurable:true,value:typeof window[name]==='function'&&['getComputedStyle','requestAnimationFrame','cancelAnimationFrame'].includes(name)?window[name].bind(window):window[name]});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const React=require('react'),{createRoot}=require('react-dom/client'),esbuild=require(require.resolve('esbuild',{paths:[require.resolve('vite')]}));
 const output=path.join(process.env.QUIET_HOURS_TEST_BUILD,'usage-recovery-app.cjs');
 const bundle=await esbuild.build({entryPoints:['components/world-app.tsx'],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',alias:{'@':process.cwd()},external:['react','react/*','react-dom','react-dom/*']});
 await writeFile(output,bundle.outputFiles[0].text.replace(/require\("(react(?:-dom)?(?:\/[^" ]+)?)"\)/g,(_,name)=>`require(${JSON.stringify(require.resolve(name))})`));
 const WorldApp=require(output).default,load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
 load('store').install(load('world').seedWorld());const {GET}=load('route');
 const nativeFetch=global.fetch;let detailStatus='accounted';
 const id=Date.now()+':00000000-0000-4000-8000-000000000092';
 global.fetch=async url=>{
  const result=await GET(new Request(new URL(url,'https://test.invalid'))),body=await result.json();
  body.unresolvedUsageRecovery=true;
  body.decisionTraces={records:[{operationId:id,outcome:'unknown',lastKnownStage:'candidate-received',createdAt:Date.now(),bytes:0}],retention:{count:1,bytes:0,evicted:0}};
  if(String(url).includes('operationId=')){
   body.usageRecovery={status:detailStatus,knownCalls:1,unknownRange:true};
   body.operation={state:'uncertain',status:502,evidence:null};body.decisionTrace=null;
  }
  return Response.json(body);
 };
 let root;
 const settle=async()=>{await React.act(async()=>{await new Promise(r=>setTimeout(r,50));});};
 const mount=async()=>{root=createRoot(document.body.appendChild(document.createElement('div')));await React.act(async()=>root.render(React.createElement(WorldApp,{signInPath:'/login',displayName:'fixture',environment:{caption:'fixture',builtAtLabel:'unknown'}})));await settle();};
 const click=async label=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===label);assert.ok(b,label);await React.act(async()=>b.click());await settle();};
 try{
  await mount();
  assert.match(document.querySelector('.compact-cost').textContent,/中斷操作.*待核對|用量.*待核對/);
  await click('分析');
  assert.match(document.querySelector('[aria-label="已發生費用估算"]').textContent,/未確認範圍.*不能視為零|不能視為零.*未確認範圍/);
  assert.match(document.querySelector('[aria-label="決策追溯"]').textContent,/已保存的正常用量已入帳/);
  assert.match(document.querySelector('[aria-label="決策追溯"]').textContent,/未保存.*未知|未確認範圍/);
  await React.act(async()=>root.unmount());
  detailStatus='unavailable';await mount();await click('分析');
  assert.match(document.querySelector('[aria-label="決策追溯"]').textContent,/儲存.*不可讀|暫時無法核對/);
  assert.doesNotMatch(document.querySelector('[aria-label="決策追溯"]').textContent,/已保存的正常用量已入帳/);
 }finally{if(root)await React.act(async()=>root.unmount());global.fetch=nativeFetch;await window.happyDOM.close();}
});
