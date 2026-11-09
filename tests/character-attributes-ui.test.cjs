/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {writeFile}=require('node:fs/promises');
test('existing WorldApp profile confirms a bounded character and shows the SQLite result after UI reload',async()=>{
 const {Window}=await import('happy-dom');const window=new Window({url:'https://test.invalid'});
 for(const name of [...Object.getOwnPropertyNames(window).filter(name=>/^(HTML|SVG|Event|CustomEvent|ShadowRoot)/.test(name)),'window','document','navigator','HTMLElement','Element','Node','DocumentFragment','MutationObserver','ResizeObserver','getComputedStyle','sessionStorage','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,name,{configurable:true,value:typeof window[name]==='function'&&['getComputedStyle','requestAnimationFrame','cancelAnimationFrame'].includes(name)?window[name].bind(window):window[name]});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const React=require('react'),{createRoot}=require('react-dom/client'),esbuild=require(require.resolve('esbuild',{paths:[require.resolve('vite')]}));
 const result=await esbuild.build({entryPoints:['components/world-app.tsx'],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',alias:{'@':process.cwd()},external:['react','react/*','react-dom','react-dom/*']});
 const code=result.outputFiles[0].text.replace(/require\("(react(?:-dom)?(?:\/[^" ]+)?)"\)/g,(_,name)=>`require(${JSON.stringify(require.resolve(name))})`);
 const output=path.join(process.env.QUIET_HOURS_TEST_BUILD,'attributes-ui.cjs');await writeFile(output,code);
 const WorldApp=require(output).default,load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs')),route=load('route'),store=load('store');
 const initial=load('world').seedWorld();initial.characters.find(c=>c.id==='cass').intents=[];store.install(initial);const fetch=global.fetch;let payload;
 global.fetch=async(url,options)=>{if(!options?.method)return route.GET(new Request(new URL(url,'https://test.invalid')));payload=JSON.parse(options.body);return route.POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{...options.headers,origin:'https://test.invalid'},body:options.body}));};
 let root=createRoot(document.body.appendChild(document.createElement('div')));
 const settle=async check=>{for(let i=0;i<100;i++){await React.act(async()=>{await new Promise(r=>setTimeout(r,5));});if(check())return;}assert.fail(document.body.textContent);};
 const button=name=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===name),click=async name=>{assert.ok(button(name),name);await React.act(async()=>button(name).click());};
 const render=async()=>{await React.act(async()=>root.render(React.createElement(WorldApp,{signInPath:'/login',displayName:'fixture',environment:{caption:'fixture',builtAtLabel:'unknown'}})));await settle(()=>button('人物檔案'));};
 try{
 await render();await click('人物檔案');await settle(()=>button('設定並導入基本屬性'));assert.match(document.body.textContent,/尚未導入基本屬性/);assert.doesNotMatch(document.body.textContent,/舊版平面意圖/);await click('設定並導入基本屬性');
 const field=document.querySelector('[aria-label="力量指定值"]');await React.act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(field,'2');field.dispatchEvent(new window.Event('input',{bubbles:true}));field.dispatchEvent(new window.Event('change',{bubbles:true}));});
 await click('確認背景並導入一次');await settle(()=>document.querySelector('[aria-label="人物基本屬性"] dl'));assert.equal(payload.operation,'adopt-character-attributes');assert.equal(payload.target,'cass');assert.equal(payload.characterSetup.attributes.strength.value,2);
 const committed=(await (await route.GET()).json()).world.characters.find(c=>c.id==='cass').attributes;assert.equal(committed.values.strength,2);assert.match(document.querySelector('[aria-label="人物基本屬性"]').textContent,/行動與感知尚沿既有判定/);
 await React.act(async()=>root.unmount());root=createRoot(document.body.appendChild(document.createElement('div')));await render();await click('人物檔案');await settle(()=>document.querySelector('[aria-label="人物基本屬性"] dl'));assert.deepEqual((await (await route.GET()).json()).world.characters.find(c=>c.id==='cass').attributes,committed);
 }finally{await React.act(async()=>root.unmount());global.fetch=fetch;window.happyDOM.abort();}
});
