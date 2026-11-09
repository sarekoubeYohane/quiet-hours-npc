/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const load = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD,name+'.cjs'));
const route = load('route');
const characters = load('character-templates-route');
const scenes = load('scene-templates-route');
const store = load('store');
const { seedWorld } = load('world');
const { blankCharacterTemplateFields } = load('character-templates');
const { fixtureDecision } = require('./pursuit-fixture.cjs');

const origin = 'https://test.invalid';
const operationId = () => Date.now()+':'+crypto.randomUUID();
const post = (api,body) => api.POST(new Request(origin+'/api/world',{
  method:'POST',headers:{origin,'X-World-Time-Policy':'round-v1'},body:JSON.stringify(api === scenes ? {id:crypto.randomUUID(),version:0,...body} : body),
}));
async function response(result,status) {
  const data=await result.json();
  assert.equal(result.status,status,data.error);
  return data;
}
const read = async () => response(await route.GET(),200);
const complete = candidate => Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify(candidate)}}]});
const marker = '世界私有安全卡榫';
const reason = '權威檢查只可供觀察者';

async function verifyObservedResults() {
  const {Window}=await import('happy-dom');
  const window=new Window({url:origin});
  for(const name of [...Object.getOwnPropertyNames(window).filter(name=>/^(HTML|SVG|Event|CustomEvent|ShadowRoot)/.test(name)),
    'window','document','navigator','HTMLElement','Element','Node','DocumentFragment','MutationObserver','ResizeObserver','getComputedStyle','sessionStorage','requestAnimationFrame','cancelAnimationFrame']){
    Object.defineProperty(globalThis,name,{configurable:true,value:typeof window[name]==='function'&&['getComputedStyle','requestAnimationFrame','cancelAnimationFrame'].includes(name)?window[name].bind(window):window[name]});
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const React=require('react');
  const {createRoot}=require('react-dom/client');
  const esbuild=require(require.resolve('esbuild',{paths:[require.resolve('vite')]}));
  const {outputFiles}=await esbuild.build({entryPoints:['components/world-app.tsx'],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',alias:{'@':process.cwd()},external:['react','react/*','react-dom','react-dom/*']});
  const compiled={exports:{}};
  new Function('require','module','exports',outputFiles[0].text)(require,compiled,compiled.exports);
  const originalFetch=global.fetch;
  global.fetch=(url,options)=>{
    assert.equal(new URL(url,origin).pathname,'/api/world');
    return route.GET(new Request(new URL(url,origin),options));
  };
  const root=createRoot(document.body.appendChild(document.createElement('div')));
  try{
    await React.act(async()=>root.render(React.createElement(compiled.exports.default,{
      signInPath:'/login',displayName:'fixture',environment:{caption:'fixture',builtAtLabel:'unknown'},
    })));
    const map=document.querySelector('[aria-label="世界像素地圖"]');
    const picker=map.querySelector('[aria-label="觀看場所"]');
    async function select(place){
      await React.act(async()=>{
        Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set.call(picker,place);
        picker.dispatchEvent(new window.Event('change',{bubbles:true}));
      });
    }
    await select('place:clear');
    assert.match(map.textContent,/擺幅調節器.*已調整/);
    await select('place:blocked');
    assert.match(map.textContent,/擺幅調節器.*待調整/);
    assert.match(map.textContent,/小托盤.*共鳴底座/);
    assert.match(document.body.textContent,/這次方法沒有成功/);
  }finally{
    await React.act(async()=>root.unmount());
    global.fetch=originalFetch;
    await window.happyDOM.close();
  }
}

test('known city fixtures suggest optional methods without exposing hidden restrictions or limiting free proposals', async () => {
  const previous=seedWorld();
  previous.adjudication={provider:'openai',model:'gpt-6.1-sol'};
  store.install(previous);
  const create=async name=>(await response(await post(characters,{
    id:crypto.randomUUID(),version:0,fields:{...blankCharacterTemplateFields(),name},
  }),200)).template;
  const first=await create('澄');
  const second=await create('杉');
  const scene=(await response(await post(scenes,{
    name:'手作工坊',note:'',rooms:[{id:'workroom',name:'工坊'}],connections:[],
    objects:[
      {id:'regulator',name:'擺幅調節器',roomId:'workroom',state:{指示:'待調整'}},
      ...['工作墊','紙盒','夾具','木架','小刷'].map((name,index)=>({id:'prop-'+index,name,roomId:'workroom',state:{}})),
      {id:'tray',name:'小托盤',roomId:'workroom',state:{用途:'收納'}},
    ],
  }),201)).template;
  await response(await post(route,{operation:'set-model-key',mode:'openai',key:'fixture-activity-hint-key'}),200);
  const opening=await read();
  const city={
    places:['clear','blocked'].map((id,index)=>({id,templateId:scene.id,version:scene.version,name:['工坊甲','工坊乙'][index]})),
    characters:[
      {templateId:first.id,version:first.version,placeId:'clear',roomId:'workroom'},
      {templateId:second.id,version:second.version,placeId:'blocked',roomId:'workroom'},
    ],
    finalization:{walks:[],spaces:[{placeId:'blocked',rooms:[],connections:[],
      objects:[{id:'interlock',name:marker,roomId:'workroom',state:{卡榫:'已扣'},hidden:true}],
    }]},
  };
  const scope={operationScope:opening.operationScope,worldContext:opening.world.contextId,expectedVersion:opening.version};
  const preview=await response(await post(route,{...scope,operation:'preview-city',mode:'demo',city}),200);
  assert.deepEqual(preview.preview.issues,[]);
  const started=await response(await post(route,{...scope,operation:'start-city',operationId:operationId(),mode:'demo',city}),200);
  const {world}=started;

  const decisions=[],adjudications=[];
  let phase='hint';
  const originalFetch=global.fetch;
  global.fetch=async (_url,request)=>{
    const input=JSON.parse(JSON.parse(request.body).messages[1].content);
    if(input.contractVersion==='npc-decision.v3'){
      decisions.push(input);
      assert.doesNotMatch(JSON.stringify(input),new RegExp(marker+'|'+reason+'|allowedActorIds|entryPermission'));
      const timeIntent={kind:'completion',maxMinutes:null};
      let action={type:'rest',target:'',content:''};
      if(phase==='hint'){
        const hint=input.activityHints?.find(item=>item.target.endsWith(':object:regulator'));
        assert.ok(hint,'a known fixture has a suggestion');
        action={type:'propose',target:hint.target,content:hint.content,purpose:'調整眼前裝置',timeIntent};
      }else if(phase==='free'&&input.self.name==='杉'){
        const tray=input.objects.find(item=>item.label==='小托盤');
        assert.ok(tray);
        assert.ok(!input.activityHints.some(item=>item.target===tray.id));
        action={type:'propose',target:tray.id,content:'把托盤倒扣當成共鳴底座',purpose:'試作共鳴底座',timeIntent};
      }
      return complete(fixtureDecision(input,action));
    }
    assert.equal(input.contractVersion,'world-adjudication.v1');
    adjudications.push(input);
    const item=input.objects.find(object=>object.id===input.action.target);
    assert.ok(item);
    if(input.action.target.endsWith(':object:regulator')&&input.objects.some(object=>object.label===marker)){
      return complete({status:'denied',completionMinutes:null,effects:[],stages:[],check:null,routine:null,
        explanation:{summary:reason,facts:[]}});
    }
    const [key,value]=item.label==='小托盤'?['用途','共鳴底座']:['指示','已調整'];
    return complete({status:'accepted',completionMinutes:15,stages:[],check:null,effects:[{
      kind:'change-state',target:{type:'object',id:item.id},expectedRevision:item.revision,version:1,
      changes:[{key,from:item.state[key],value}],exposure:'public',access:'physical',reason:'本次活動確認的狀態變更',
    }]});
  };

  try {
    const step={operation:'advance',operationId:operationId(),worldContext:world.contextId,mode:'openai',model:'gpt-6.1-sol',minutes:5,timeContract:'five-minute-v1'};
    store.throwAfterNextSave();
    const result=await response(await post(route,step),200);
    const hints=decisions.slice(0,2).map(input=>input.activityHints.map(({kind,content})=>({kind,content})));
    assert.ok(hints[0].length);
    assert.deepEqual(hints[0],hints[1],'private feasibility does not change the suggestions');
    assert.equal(adjudications.length,2);
    const replay=await response(await post(route,step),200);
    assert.equal(replay.version,result.version);
    assert.equal(decisions.length,2);
    assert.equal((await read()).world.aiUsage.totalCalls,4);
    phase='wait';
    for(let part=0;part<3;part++)await response(await post(route,{...step,operationId:operationId()}),200);
    assert.equal((await read()).world.objects.find(item=>item.id==='place:clear:object:regulator').state.指示,'已調整');
    assert.equal((await read()).world.objects.find(item=>item.id==='place:blocked:object:regulator').state.指示,'待調整');

    phase='free';
    await response(await post(route,{operation:'intervene',operationId:operationId(),worldContext:world.contextId,mode:'openai',target:'npc:2',text:'可以重新考慮其他自由方法。'}),200);
    await response(await post(route,{...step,operationId:operationId()}),200);
    for(let part=0;part<3;part++)await response(await post(route,{...step,operationId:operationId()}),200);
    const after=(await read()).world;
    assert.equal(adjudications.length,3);
    assert.equal(adjudications[2].action.content,'把托盤倒扣當成共鳴底座');
    assert.equal(after.objects.find(item=>item.id==='place:blocked:object:tray').state.用途,'共鳴底座');
    assert.equal(after.aiUsage.totalCalls,8);
    assert.equal(after.aiUsage.totalInputTokens,80);
    assert.equal(after.aiUsage.totalOutputTokens,40);
    assert.equal(after.turn,8);
    assert.deepEqual(after.characters.map(actor=>actor.name),['澄','杉']);
    const actor=after.characters.find(person=>person.name==='杉');
    assert.ok(after.events.some(event=>event.actor===actor.id&&event.kind==='blocked'&&event.time===1265));
    assert.ok(after.events.some(event=>event.actor===actor.id&&event.kind==='work'&&event.time===1300));
    await verifyObservedResults();
  } finally {
    global.fetch=originalFetch;
  }
});
