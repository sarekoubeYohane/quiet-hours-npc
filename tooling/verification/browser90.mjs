import assert from 'node:assert/strict';
import {url,server,requests} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
let browser;
try {
 browser=await launchBrowser();const page=await browser.newPage({reducedMotion:'reduce'});
 const instant=Date.parse('2026-10-15T16:00:00Z');await page.clock.install({time:instant});await page.clock.pauseAt(instant);
 await page.goto(url);await page.getByRole('button',{name:'下一回合',exact:true}).waitFor();
 const panel=page.getByRole('region',{name:'角色近況',exact:true});
 await page.getByRole('button',{name:/Vera，.*點選查看狀態/}).click();
 await panel.getByRole('button',{name:'人物檔案',exact:true}).click({timeout:1500});
 const profile=page.getByRole('region',{name:'人物檔案',exact:true});
 await profile.getByRole('heading',{name:'Vera',exact:true}).waitFor();
 const art=profile.getByRole('img',{name:'Vera 的人物圖',exact:true});await art.waitFor();
 assert.equal(await art.evaluate(img=>img.complete&&img.naturalWidth>0),true);
 assert.match(await profile.innerText(),/Vera 的房間/);
 await profile.getByRole('button',{name:'互動',exact:true}).click();
 await page.getByRole('combobox',{name:'事件知情對象'}).waitFor();
 await page.getByLabel('你想說的話或發生的事').fill('今晚想聽聽你的近況。');
 await page.getByRole('button',{name:'加入事件',exact:true}).click();
 await page.getByText('Vera 已收到', {exact:false}).waitFor();
 const world=(await (await page.request.get(url+'/api/world')).json()).world;
 const event=world.events.find(e=>e.text.includes('今晚想聽聽你的近況'));assert.deepEqual(event.audience,['vera']);
 assert.equal(requests.filter(r=>r.operation==='intervene').at(-1).target,'vera');
 await panel.getByRole('button',{name:'人物檔案',exact:true}).click();
 await profile.getByRole('button',{name:'查看角色分析',exact:true}).click();
 await page.getByRole('heading',{name:'角色狀態',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Vera',exact:true}).last().getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'返回人物檔案',exact:true}).click();await profile.getByRole('heading',{name:'Vera',exact:true}).waitFor();
 await profile.getByRole('button',{name:'返回觀察',exact:true}).click();await panel.waitFor();
 await panel.getByRole('button',{name:'Cass',exact:true}).click();await panel.getByRole('button',{name:'人物檔案',exact:true}).click();
 await profile.getByRole('heading',{name:'Cass',exact:true}).waitFor();assert.equal(await profile.getByRole('img',{name:'Vera 的人物圖'}).count(),0);
 await page.addStyleTag({content:'body{font-family:"Noto Sans TC",sans-serif}'});await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:outputPath('browser90-profile-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.addStyleTag({content:'body{font-family:"Noto Sans TC",sans-serif}'});await page.screenshot({path:outputPath('browser90-profile-narrow.png'),fullPage:true});
 // Shared automatic updates continue while the profile is open.
 const tick=async ms=>{await page.request.post(url+'/__fixture',{data:{advanceMs:ms}});await page.clock.runFor(ms);};
 const readWorld=async()=>(await (await page.request.get(url+'/api/world')).json()).world;
 const submit=async(name)=>{await tick(1000);const done=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='GET');await page.getByRole('button',{name,exact:true}).click();await done;};
 const before=(await readWorld()).turn;
 await page.getByRole('button',{name:'開始自動',exact:true}).click();await tick(30000);
 await page.getByText('回合已儲存',{exact:true}).waitFor();assert.equal((await readWorld()).turn,before+1);
 assert.match(await profile.innerText(),new RegExp((await readWorld()).characters.find(c=>c.id==='cass').mood));
 await page.getByRole('button',{name:'暫停自動',exact:true}).click();await tick(60000);assert.equal((await readWorld()).turn,before+1);
 // Images can fail without preventing status and interaction.
 await page.route('**/characters/vera/portrait.webp',route=>route.abort());
 await profile.getByRole('button',{name:'返回觀察',exact:true}).click();await panel.getByRole('button',{name:'Vera',exact:true}).click();await panel.getByRole('button',{name:'人物檔案',exact:true}).click();
 await profile.getByRole('img',{name:'Vera 的人物圖暫不可用',exact:true}).waitFor();await profile.getByRole('button',{name:'互動',exact:true}).click();await page.getByLabel('你想說的話或發生的事').waitFor();
 // The owner keeps its distinct direct-control lifecycle.
 await panel.getByRole('button',{name:'店主',exact:true}).click();await panel.getByRole('button',{name:'人物檔案',exact:true}).click();await profile.getByRole('button',{name:'互動',exact:true}).click();
 await submit('單次指定下一行動');assert.equal((await readWorld()).characters.find(c=>c.id==='owner').control.pending.type,'rest');
 await submit('下一回合');assert.equal((await readWorld()).characters.find(c=>c.id==='owner').control.active,true);
 await submit('暫時接管店主');assert.equal((await readWorld()).characters.find(c=>c.id==='owner').control.mode,'taken-over');
 await submit('單次指定下一行動');for(let i=0;i<5;i++)await submit('下一回合');
 const waiting=(await readWorld()).characters.find(c=>c.id==='owner');assert.equal(waiting.control.mode,'taken-over');assert.equal(waiting.control.active,undefined);assert.match(waiting.activity,/待命/);
 await submit('交還控制權');assert.equal((await readWorld()).characters.find(c=>c.id==='owner').control.mode,'autonomous');
 // Dynamic characters have a usable fallback; no world reset or generated biography.
 const dynamic=await readWorld();dynamic.characters.push({id:'guest',name:'訪客',color:'#cccccc',location:'cafe',mood:'平靜',activity:'坐在咖啡館。',goal:'休息',personality:'測試世界的訪客。',relationships:{},memories:[],intents:[]});
 await page.request.post(url+'/__fixture',{data:{world:dynamic}});await page.reload();await page.getByRole('button',{name:'下一回合',exact:true}).waitFor();
 await panel.getByRole('button',{name:'訪客',exact:true}).click();await panel.getByRole('button',{name:'人物檔案',exact:true}).click();
 await profile.getByRole('img',{name:'訪客 的人物圖暫不可用',exact:true}).waitFor();await profile.getByRole('button',{name:'互動',exact:true}).click();
 assert.equal((await readWorld()).turn,dynamic.turn);
 console.log('PASS #90 live profile shares one dispatch and pause; image failure + dynamic fallback; owner single → takeover → active → waiting → return verified by world API');
 console.log('PASS #90 map → live profile → intervention API readback → same-character analysis → back; recognizable artwork and narrow view');
}finally{await browser?.close();server.close();}
