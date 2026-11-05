import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {launchBrowser} from './browser-runtime.mjs';
process.env.FIXTURE_CITY_EDITORS='1';
const {url,server,store,load,setModelResponder}=await import('./browser-fixture.mjs');
const {fixtureDecision}=createRequire(import.meta.url)('../../tests/pursuit-fixture.cjs');
const directory=process.env.BROWSER_ARTIFACT_DIR || 'artifacts/issue253';
await mkdir(directory,{recursive:true});
const inputs=[],results=[],errors=[];
setModelResponder(request=>{
  const input=JSON.parse(request.messages[1].content);inputs.push(input);
  return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify(fixtureDecision(input,{type:'rest',target:'',content:''}))}}]});
});
let browser;
try {
  browser=await launchBrowser();
  const page=await browser.newPage({viewport:{width:1280,height:1000}});
  page.on('pageerror',error=>errors.push(String(error)));
  await page.route('**/*',r=>new URL(r.request().url()).origin===url?r.continue():r.abort());
  const clock=await (await page.request.get(url+'/__fixture')).json();
  await page.addInitScript(now=>{Date.now=()=>now;},clock.now);
  const button=name=>page.getByRole('button',{name,exact:true});
  const read=async(path='/api/world')=>{const r=await page.request.get(url+path);assert.equal(r.status(),200,await r.text());return r.json();};
  const send=async(path,data,status=200)=>{
    const r=await page.request.post(url+path,{headers:{origin:url,'X-World-Time-Policy':'round-v1'},data});
    const body=await r.json();assert.equal(r.status(),status,JSON.stringify(body));return body;
  };
  const submit=async(name,path,operation)=>{
    const pending=page.waitForResponse(r=>r.url()===url+path&&r.request().method()==='POST'&&(!operation||r.request().postDataJSON().operation===operation));
    await button(name).click();const response=await pending;assert.equal(response.status(),200,await response.text());return response.json();
  };
  const openCity=async()=>{
    const scene=(await read('/api/scene-templates')).templates[0];
    await page.goto(url);await button('建立城市').click();
    await page.getByLabel(scene.name+'數量',{exact:true}).selectOption('1');
    await page.getByLabel('場所 1 名稱',{exact:true}).fill('記憶測試屋');
    await page.getByLabel('選用孟澄',{exact:true}).check();
    await page.getByLabel('孟澄的起始場所',{exact:true}).selectOption({label:'記憶測試屋'});
    await page.getByLabel('孟澄的起始房間',{exact:true}).selectOption({label:scene.rooms[0].name});
  };
  for(const [label,value] of [['zh1365','憶'.repeat(1365)],['zh1366','憶'.repeat(1366)],['zh1500','憶'.repeat(1500)],['ascii2400','x'.repeat(2400)],['bytes4096','憶'.repeat(1365)+'a']]) {
    store.install(load('world').seedWorld());
    for(const table of ['character_templates','scene_templates','world_before_city'])await store.database().prepare('DELETE FROM '+table).bind().run();
    const initial=await read();const startInputs=inputs.length;
    await page.goto(url+'/character-templates');await button('新建人物').click();
    await page.locator('[name=name]').fill('孟澄');await page.locator('[name=initialMemories]').fill(value);
    const record={label,characters:value.length,bytes:Buffer.byteLength(value)};
    let accepted=value;
    if(Buffer.byteLength(value)>4096) {
      assert.equal(await button('保存人物範本').isDisabled(),true);
      assert.match(await page.getByRole('alert').innerText(),/初始記憶.*4096.*縮短/);
      const fields={...load('character-templates').blankCharacterTemplateFields(),name:'孟澄',initialMemories:value};
      const input={id:crypto.randomUUID(),version:0,fields};
      await send('/api/character-templates',input,400);
      assert.deepEqual((await read('/api/character-templates')).templates,[]);
      // Seed only the historical persisted template that the old API accepted.
      await store.database().prepare('INSERT INTO character_templates (owner,id,version,fields) VALUES (?,?,1,?)').bind('test-owner',input.id,JSON.stringify(fields)).run();
      await page.reload();await button('孟澄').click();
      assert.equal(await page.locator('[name=initialMemories]').inputValue(),value);
      assert.match(await page.getByRole('alert').innerText(),/初始記憶.*4096/);
      await page.screenshot({path:directory+'/'+label+'-editor.png',fullPage:true});
      await openCity();const preview=await submit('預覽城市','/api/world','preview-city');
      assert.match(preview.preview.issues.join(' '),/孟澄.*初始記憶.*縮短/);
      await page.getByRole('region',{name:'城市預覽',exact:true}).getByRole('alert').waitFor();
      assert.equal(await button('開始世界').isDisabled(),true);
      assert.deepEqual(await read(),initial);assert.equal(inputs.length,startInputs);
      assert.equal((await read('/api/character-templates')).templates[0].fields.initialMemories,value);
      await page.screenshot({path:directory+'/'+label+'-preview.png',fullPage:true});
      record.legacyPreview=preview;record.newSave=400;
      await page.goto(url+'/character-templates');await button('孟澄').click();
      accepted='憶'.repeat(1365);await page.locator('[name=initialMemories]').fill(accepted);
    }
    await submit('保存人物範本','/api/character-templates');
    await page.reload();await button('孟澄').click();
    assert.equal(await page.locator('[name=initialMemories]').inputValue(),accepted);
    await page.locator('[name=appearance]').fill('藍色外套');
    await submit('保存人物範本','/api/character-templates');await page.reload();await button('孟澄').click();
    assert.equal(await page.locator('[name=initialMemories]').inputValue(),accepted);
    assert.equal(await page.locator('[name=appearance]').inputValue(),'藍色外套');
    await send('/api/world',{operation:'set-model-key',mode:'openai',key:'controlled'});
    await send('/api/world',{operation:'set-adjudication',operationId:Date.now()+':'+crypto.randomUUID(),mode:'demo',worldContext:initial.world.contextId,adjudication:{provider:'openai',model:'gpt-6.1-sol'}});
    await openCity();const preview=await submit('預覽城市','/api/world','preview-city');assert.deepEqual(preview.preview.issues,[]);
    await submit('開始世界','/api/world','start-city');await page.reload();
    const started=await read();assert.equal(started.world.characters[0].profile.initialMemories,accepted);
    assert.ok(started.world.characters[0].shortTerm.some(m=>m.text===accepted));
    const round=await send('/api/world',{operation:'advance',operationId:Date.now()+':'+crypto.randomUUID(),worldContext:started.world.contextId,mode:'openai',model:'gpt-6.1-sol',minutes:15});
    assert.equal(round.world.turn,1);assert.equal(inputs.length-startInputs,1);
    assert.ok(inputs.at(-1).self.shortTerm.some(memory=>memory.text===accepted));
    assert.equal(round.world.aiUsage.totalCalls,1);
    assert.equal((await read('/api/character-templates')).templates[0].fields.initialMemories,accepted);
    record.saved=(await read('/api/character-templates')).templates[0];record.world=round.world;record.npcInput=inputs.at(-1);results.push(record);
    console.log(JSON.stringify({label,bytes:record.bytes,newSave:record.newSave||200,legacyRepaired:!!record.legacyPreview,turn:round.world.turn,npcRequests:1}));
  }
  assert.deepEqual(errors,[]);
}finally {
  await writeFile(directory+'/browser-evidence.json',JSON.stringify({results,errors,migrations:'drizzle/0000–0008, all 9 SQL migrations'},null,2));
  await browser?.close();server.close();
}
