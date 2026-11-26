// Compare two drafts after a meal committed by the real world API (#344).
// The focal NPC is live unless TRIAL_DRY=1. World judgements are always fixed.
const test = require('node:test');
const assert = require('node:assert/strict');
const {createHash,randomUUID} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {fixtureDecision} = require('../../../tests/pursuit-fixture.cjs');
const {applyDraft} = require('./assemble.cjs');
const load = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD,name+'.cjs'));
const store = load('store'), {POST} = load('route');
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const mealId = 'acceptance-meal';
const eat = {type:'propose',target:mealId,content:'取得並吃掉眼前的驗收餐點',purpose:'吃飯',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null}};
const rest = {type:'rest',target:'',content:'安靜休息',durationMinutes:15};
const fixture = value => Response.json({choices:[{message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:1,completion_tokens:1}});
const remaining = world => world.supplies.find(s=>s.id===mealId).remaining;

function judge(input) {
  const meal = input.supplies?.find(s=>s.id===mealId);
  if (input.actor.id !== 'cass' || input.action.target !== mealId || !/吃|食用|進食/.test(input.action.content) || meal?.remaining !== 1) {
    return {status:'denied',effects:[],stages:[],check:null};
  }
  return {status:'accepted',completionMinutes:15,stages:[],check:null,effects:[
    {kind:'materialize',supplyId:meal.id,expectedRemaining:1},
    {kind:'consume',objectId:meal.materializedObjectId,expectedRevision:1}
  ]};
}

async function advance(snapshot,model,fetcher) {
  store.install(structuredClone(snapshot));
  const post = body => POST(new Request('https://test.invalid/api/world',{method:'POST',
    headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v2'},
    body:JSON.stringify({operationScope:'test-owner',operationId:Date.now()+':'+randomUUID(),
      worldContext:snapshot.contextId,mode:'openai',model,...body})}));
  assert.equal((await post({operation:'set-model-key',key:'local-transport-placeholder-000000'})).status,200);
  const previous = global.fetch;
  global.fetch = fetcher;
  try { return await post({operation:'advance',minutes:15}); }
  finally { global.fetch = previous; }
}

function focus(world,id) {
  const scene = structuredClone(world);
  for(const c of scene.characters) c.control={mode:c.id===id?'autonomous':'taken-over'};
  return scene;
}

test('meal before and after consumption and owner field layout, paired draft decisions',async()=>{
  const dry = process.env.TRIAL_DRY === '1';
  const probeLayout = process.env.TRIAL_SCENARIO === 'layout-revision';
  const key = process.env.OPENAI_API_KEY || (!dry && process.env.TRIAL_KEY_FILE && fs.readFileSync(process.env.TRIAL_KEY_FILE,'utf8').trim());
  assert.ok(dry || key,'Set OPENAI_API_KEY or TRIAL_KEY_FILE');
  const dir = process.env.TRIAL_DIR || fs.mkdtempSync(path.join(os.tmpdir(),'npc-meal-trial-'));
  fs.mkdirSync(dir,{recursive:true});
  const prefix = probeLayout ? 'layout-revision-' : 'meal-revision-';
  const file = path.join(dir,prefix+(dry?'fixture':'live')+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.jsonl');
  const seed = load('world').seedWorld();
  seed.adjudication = {provider:'openai',model:'fixture-judge'};
  seed.playerBudget = {calls:100,tokens:2000000};
  const base = await load('acceptance-scene').enterAcceptanceScene(seed);
  base.contextId = 'meal-revision';
  load('phones').activatePhones(base);
  const before = focus(base,'cass');
  const setup = await advance(before,'gpt-6-luna',async(_url,init)=>{
    const input = JSON.parse(JSON.parse(init.body).messages[1].content);
    return fixture(input.contractVersion==='world-adjudication.v1'?judge(input):fixtureDecision(input,eat));
  });
  assert.equal(setup.status,200,await setup.clone().text());
  const after = store.snapshot();
  assert.equal(remaining(before),1); assert.equal(remaining(after),0);
  const realFetch = global.fetch;
  const cases = [
    {scene:'before',actor:'cass',model:'gpt-6-luna',world:before},
    {scene:'after',actor:'cass',model:'gpt-6-luna',world:after},
    {scene:'owner',actor:'owner',model:'gpt-6.1-sol',world:focus(base,'owner')}
  ];
  for (const [index,{scene,actor,model,world}] of cases.entries()) {
    if (probeLayout && scene==='after') continue;
    let fingerprint;
    const versions = ['v0.2.3','v0.2.4'];
    if (index%2 || (probeLayout && actor==='owner')) versions.reverse();
    const arms = probeLayout ? [...versions,...versions.slice().reverse()] : versions;
    for (const [i,condition] of arms.entries()) {
      const row = {scene,actor,model,condition,repetition:Math.floor(i/2)+1,transport:dry?'fixture':'OpenAI',snapshotHash:digest(world),calls:[],fixedJudgements:[]};
      const response = await advance(world,model,async(url,init)=>{
        assert.equal(String(url),'https://api.openai.com/v1/chat/completions');
        const body = JSON.parse(init.body), input = JSON.parse(body.messages[1].content);
        if(input.contractVersion==='world-adjudication.v1'){
          const verdict=judge(input); row.fixedJudgements.push(verdict); return fixture(verdict);
        }
        assert.equal(input.contractVersion,'npc-decision.v3'); assert.equal(input.self.id,actor);
        if (probeLayout) {
          body.response_format={type:'json_object'};
          body.reasoning_effort='low';
          body.max_completion_tokens=4096;
        }
        row.inputHash=digest(body);
        assert.equal(row.inputHash,fingerprint ?? row.inputHash,'original NPC request changed across arms');
        fingerprint=row.inputHash;
        row.included=applyDraft(body,input,condition);
        if(scene==='after') assert.ok(input.self.shortTerm.some(m=>m.text.includes('已發生：取得驗收餐點，食用驗收餐點')));
        const call = {kind:'npc',request:body};
        row.calls.push(call);
        const headers = new Headers(init.headers);
        if (!dry) headers.set('Authorization','Bearer '+key);
        const result = dry ? fixture(fixtureDecision(input,scene==='before'?eat:rest)) :
          await realFetch(url,{...init,headers,body:JSON.stringify(body),redirect:'error'});
        call.status=result.status;
        if(result.ok){
          const envelope=await result.clone().json(); call.reply=envelope.choices[0].message.content; call.usage=envelope.usage;
        }
        return result;
      });
      const saved=store.snapshot(),person=saved.characters.find(c=>c.id===actor);
      row.http=response.status; row.committed=response.ok;
      if(!response.ok) row.failure=(await response.json()).error;
      row.firstWorld={from:world.minute,minute:saved.minute,stockBefore:remaining(world),stockAfter:remaining(saved),
        activity:person.activity,foodIntent:person.intents?.find(i=>i.id==='cass:acceptance-food')?.status,
        events:saved.events.filter(e=>!world.events.some(old=>old.id===e.id)).map(e=>e.text)};
      fs.appendFileSync(file,JSON.stringify(row)+'\n');
      assert.equal(row.calls.length,1,row.failure); assert.equal(row.calls[0].status,200,'provider failed; stop sampling');
      assert.equal(saved.minute,world.minute+(response.ok?15:0));
      if(dry) assert.ok(row.committed,row.failure);
      console.log(scene,condition,response.status,person.activity);
    }
  }
  console.log('Records:',file);
});
