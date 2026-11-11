import '../tooling/verification/no-network.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Window} from 'happy-dom';
const require=createRequire(import.meta.url);
const window=new Window({url:'http://localhost/new'});
for(const name of ['window','document','navigator','HTMLElement','Element','Node','Event','MouseEvent','DocumentFragment','MutationObserver','history','sessionStorage','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,name,{configurable:true,value:['requestAnimationFrame','cancelAnimationFrame'].includes(name)?window[name].bind(window):window[name]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=await import('react');const {createRoot}=await import('react-dom/client');
const esbuild=require(require.resolve('esbuild',{paths:[require.resolve('vite')]}));
async function component(path){
 const directory=await mkdtemp(join(tmpdir(),'opening-ui-'));
 const result=await esbuild.build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',alias:{'@':process.cwd()},external:['react','react/*','react-dom','react-dom/*'],plugins:[{name:'navigation-boundary',setup(build){build.onResolve({filter:/^next\/(navigation|link)$/},args=>({path:args.path,namespace:'navigation-boundary'}));build.onLoad({filter:/.*/,namespace:'navigation-boundary'},args=>({contents:args.path.endsWith('link')?"import React from 'react';export default function Link(p){return React.createElement('a',p)}":"export function useRouter(){return {push(){}}} export function usePathname(){return '/new'}",loader:'js'}));}}]});
 const code=result.outputFiles[0].text.replace(/require\("(react(?:-dom)?(?:\/[^" ]+)?)"\)/g,(_,name)=>`require(${JSON.stringify(require.resolve(name))})`);
 const output=join(directory,'ui.cjs');await writeFile(output,code);return {Component:require(output).default,close:()=>rm(directory,{recursive:true,force:true})};
}
const settle=async check=>{for(let i=0;i<150;i++){await React.act(async()=>{await new Promise(r=>setTimeout(r,5));});if(check())return;}assert.fail(document.body.textContent);};
test('resuming world arrangement preserves the optional AI arrangement and recovery entry',async()=>{
 const {Component,close}=await component('components/opening-wizard.tsx');
 const id='65c3cbe5-e8ed-4d49-924b-d0c1f4c70c53';
 const draft={id,version:1,body:{name:'測試世界',description:'',step:3,city:{characters:[],places:[]}},sources:{cards:[],scenes:[]}};
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async url=>Response.json(String(url).includes('character-cards')?{accountScope:'account-operations:a',cards:[]}:String(url).includes('scene-templates')?{accountScope:'account-operations:a',templates:[]}:String(url).includes('id=')?{operationScope:'a',draft,preview:{issues:[]}}:{operationScope:'a',drafts:[]});
 const root=createRoot(document.body.appendChild(document.createElement('div')));
 try{await React.act(async()=>root.render(React.createElement(Component,{owner:'a',draftId:id})));await settle(()=>document.querySelector('[name="opening-name"]'));assert.ok(document.querySelector('[aria-label="AI整理世界配置"]'),'world arrangement must retain the existing AI panel');assert.ok([...document.querySelectorAll('button')].some(b=>b.textContent==='請AI整理本次開局'),'AI arrangement action is reachable');}
 finally{await React.act(async()=>root.unmount());globalThis.fetch=originalFetch;await close();await window.happyDOM.abort();}
});

const change=async(element,value)=>React.act(async()=>{
 const prototype=element.tagName==='SELECT'?window.HTMLSelectElement.prototype:window.HTMLInputElement.prototype;
 Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,value);
 element.dispatchEvent(new window.Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));
});
const click=async text=>React.act(async()=>{
 const button=[...document.querySelectorAll('button')].find(value=>value.textContent===text);assert.ok(button,text);button.click();
});
test('model setup saves models and key together; only the explicit continuation resumes, after partial failure recovery',async()=>{
 const {Component,close}=await component('components/model-settings-panel.tsx');const originalFetch=globalThis.fetch;
 const models={npc:{provider:'openai',model:'gpt-6-luna'},adjudication:{provider:'openai',model:'gpt-6.1-sol'}};
 let view={accountScope:'account-operations:a',version:0,preference:{mode:'custom',models},effective:models,accountVersion:0,accountModels:models,source:'missing',modelKeys:{openai:{configured:false},openrouter:{configured:false}},modelKeyStorageAvailable:true};
 let failKey=true,resumed=0;const calls=[];
 globalThis.fetch=async(url,options)=>{
  if(!options?.method)return Response.json(view);
  const body=JSON.parse(options.body);calls.push({url,body});
  if(String(url).includes('model-settings')){assert.equal(body.version,view.version);view={...view,version:view.version+1,effective:body.models,source:'account'};return Response.json(view);}
  if(failKey){failKey=false;return Response.json({error:'controlled key failure'},{status:503});}
  view={...view,modelKeys:{...view.modelKeys,openai:{configured:true,expiresAt:Date.now()+100000}}};
  return Response.json({operationScope:view.accountScope,modelKeys:view.modelKeys,modelKeyStorageAvailable:true});
 };
 const root=createRoot(document.body.appendChild(document.createElement('div')));
 try{
  await React.act(async()=>root.render(React.createElement(Component,{originalAccountScope:'account-operations:a',continuation:{label:'保存並繼續這次操作',run:async()=>{resumed++;}}})));
  await settle(()=>document.querySelector('[aria-label="OpenAI 服務 API Key"]'));
  await change(document.querySelector('[aria-label="OpenAI 服務 API Key"]'),'fake-local-key');
  await click('保存並繼續這次操作');await settle(()=>document.body.textContent.includes('controlled key failure'));
  assert.equal(resumed,0);assert.equal(document.querySelector('[aria-label="OpenAI 服務 API Key"]').value,'fake-local-key');
  await click('保存模型與 Key');await settle(()=>document.body.textContent.includes('模型與已填的 Key 已保存'));
  assert.equal(resumed,0);assert.equal(document.querySelector('[aria-label="OpenAI 服務 API Key"]').value,'');
  await click('保存並繼續這次操作');await settle(()=>resumed===1);
  assert.deepEqual(calls.map(value=>value.body.operation).filter(Boolean),['set-model-key','set-model-key']);
  assert.ok(calls.every(value=>value.body.accountScope==='account-operations:a'||value.body.operationScope==='account-operations:a'));
 }finally{await React.act(async()=>root.unmount());globalThis.fetch=originalFetch;await close();await window.happyDOM.abort();}
});

test('reroll asks before replacing allocation and resumes the same operation after reload',async()=>{
 const {Component,close}=await component('components/character-formation-controls.tsx');const old=globalThis.fetch;
 const id=crypto.randomUUID(),scope='account-operations:a',values={strength:12,endurance:12,dexterity:12,perception:12,appearance:12};
 let draft={id,version:3,accountScope:scope,fields:{},formation:{version:'character-card-v1',attributeVersion:2,values,initialTotal:60,minimums:{strength:3,endurance:3,dexterity:3,perception:3,appearance:3},capacity:70,needTraits:{hunger:1,thirst:1,sleep:1}}};
 const requests=[];let fail=true;
 globalThis.fetch=async(url,options)=>{
  if(!options?.method)return Response.json({accountScope:scope,drafts:[draft]});
  const body=JSON.parse(options.body);requests.push(body);
  if(fail){fail=false;return Response.json({error:'controlled unavailable'},{status:503});}
  draft={...draft,version:4,lastReroll:{operationId:body.operationId,inputVersion:3,count:1},formation:{...draft.formation,values:{...values,strength:15},initialTotal:63}};return Response.json({draft});
 };
 let root;
 const mount=async()=>{root=createRoot(document.body.appendChild(document.createElement('div')));await React.act(async()=>root.render(React.createElement(Component,{draft,onBusy(){},onModels(){},onSaved(value){draft=value;},onPrepare:async()=>draft})));};
 try{
  await mount();await click('重骰整組數值');assert.equal(requests.length,0);await click('取消重骰');assert.equal(requests.length,0);
  await click('重骰整組數值');await click('確認重骰');await settle(()=>document.body.textContent.includes('恢復原重骰操作'));
  assert.equal(requests.length,1);await React.act(async()=>root.unmount());await mount();
  await settle(()=>document.body.textContent.includes('恢復原重骰操作'));await click('恢復原重骰操作');await settle(()=>requests.length===2);
  assert.deepEqual(requests[1],requests[0]);assert.equal(draft.lastReroll.count,1);assert.equal(draft.formation.values.strength,15);
 }finally{await React.act(async()=>root?.unmount());globalThis.fetch=old;await close();await window.happyDOM.abort();}
});

test('rereading a committed reroll unlocks allocation in the same mounted editor',async()=>{
 const {Component,close}=await component('components/character-formation-controls.tsx'),old=globalThis.fetch;
 let sent,writes=0;const values={strength:12,endurance:12,dexterity:12,perception:12,appearance:12};
 const draft={id:crypto.randomUUID(),version:3,accountScope:'account-operations:a',fields:{},formation:{values,initialTotal:60,minimums:{strength:3,endurance:3,dexterity:3,perception:3,appearance:3},capacity:70,needTraits:{hunger:1,thirst:1,sleep:1}}};
 globalThis.fetch=async(_,options)=>{if(options?.method){sent=JSON.parse(options.body);writes++;return Response.json({error:'reply unavailable'},{status:503});}throw Error('read unavailable');};
 const root=createRoot(document.body.appendChild(document.createElement('div')));
 const render=async value=>React.act(async()=>root.render(React.createElement(Component,{draft:value,onBusy(){},onModels(){},onSaved(){},onPrepare:async()=>value})));
 try{
  await render(draft);await click('重骰整組數值');await click('確認重骰');await settle(()=>document.body.textContent.includes('原數值仍顯示'));
  const restored={...draft,version:4,lastReroll:{operationId:sent.operationId,inputVersion:3,count:1}};
  await render(restored);await settle(()=>!document.body.textContent.includes('恢復原重骰操作'));
  const complete=[...document.querySelectorAll('button')].find(value=>value.textContent==='保存為完成人物卡');assert.equal(complete.disabled,false);assert.equal(writes,1);
  assert.equal(sessionStorage.getItem('quiet-hours:character-reroll:'+draft.accountScope+':'+draft.id),null);
 }finally{await React.act(async()=>root.unmount());globalThis.fetch=old;await close();await window.happyDOM.abort();}
});
