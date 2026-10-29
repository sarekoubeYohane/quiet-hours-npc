/* eslint-disable @typescript-eslint/no-require-imports */
const {fixtureDecision}=require('./pursuit-fixture.cjs');
const test = require('node:test');
const {nonPhoneObjects}=require('./fixtures/non-phone-objects.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, name + '.cjs'));
const { GET, POST } = load('route'), store = load('store');
const { seedWorld } = load('world');
const { enterAcceptanceScene } = load('acceptance-scene');
const read = async () => (await (await GET()).json()).world;
const id = () => Date.now() + ':' + crypto.randomUUID();
const completion = (value,_fixtureInput)=> Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(fixtureDecision(_fixtureInput,value))}}]});
async function setup(modify = () => {}) {
  const world = await enterAcceptanceScene(seedWorld());
  world.adjudication = {provider:'openai',model:'gpt-6.1-sol'};
  world.characters.forEach(c => {if(c.id !== 'vera') c.control = {mode:'taken-over'};});
  modify(world); store.install(world);
  const post = body => POST(new Request('https://test.invalid/api/world', {method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:id(),worldContext:world.contextId,mode:'demo',...body})}));
  await post({operation:'set-model-key',mode:'openai',key:'fixture-key'});
  return {post,advance:{operation:'advance',minutes:15,mode:'openai',model:'gpt-6.1-sol',operationId:id()}};
}
const tea = {type:'work',target:'tea',content:'泡一杯茶',mood:'平靜',durationMinutes:60,intents:[]};
test('legacy tea cannot persist a successful tea experience with an unauthorized empty cup', async () => {
  const {post,advance} = await setup(), previous = global.fetch;
  global.fetch = async (_url, init) => {
    const input = JSON.parse(JSON.parse(init.body).messages[1].content);
    return completion(input.contractVersion === 'world-adjudication.v1' ? {status:'denied',effects:[],stages:[],check:null} : tea,JSON.parse(JSON.parse(init.body).messages[1].content));
  };
  try {
    const response = await post(advance); assert.equal(response.status,200,(await response.clone().json()).error);
    const saved = await read();
    assert.equal(saved.objects.find(o=>o.id==='acceptance-cup').state.contents,'empty');
    assert.doesNotMatch(JSON.stringify(saved.events),/泡了一壺茶/,'no successful tea event without world effects');
    assert.doesNotMatch(JSON.stringify(saved.characters.flatMap(c=>c.shortTerm||[])),/泡了一壺茶/);
  } finally {global.fetch = previous;}
});

test('legacy tea uses the unchanged action in one adjudication, persists water then tea, and replay/continuation do not dispatch again', async () => {
  const {post,advance} = await setup(w => {w.objects[0].allowedTo.push('vera');});
  const previous = global.fetch, requests = [];
  global.fetch = async (_url, init) => {
    const input = JSON.parse(JSON.parse(init.body).messages[1].content); requests.push(input);
    return completion(input.contractVersion === 'world-adjudication.v1' ? {
      status:'accepted',completionMinutes:30,check:null,
      effects:[],
      stages:[{afterMinutes:15,preconditions:[],effects:[{kind:'transfer',objectId:'acceptance-cup',expectedRevision:1,toHolder:'vera',toRegion:'cafe-front'},{kind:'state',objectId:'acceptance-cup',expectedRevision:2,key:'contents',value:'water'}]},{afterMinutes:30,preconditions:[{objectId:'acceptance-cup',revision:3,region:'cafe-front',holder:'vera',state:[{key:'contents',value:'water'}]}],effects:[{kind:'state',objectId:'acceptance-cup',expectedRevision:3,key:'contents',value:'tea'}]}],
    } : {...tea,durationMinutes:30},JSON.parse(JSON.parse(init.body).messages[1].content));
  };
  try {
    const started=await post(advance),starting=await started.clone().json();assert.equal(started.status,200,JSON.stringify({error:starting.error,validation:starting.adjudicationFailure?.validation}));
    const water = await read(), cup = water.objects.find(o=>o.id==='acceptance-cup');
    assert.equal(cup.state.contents,'water'); assert.equal(cup.holder,'vera'); assert.equal(cup.owner,'owner');
    assert.equal(water.characters.find(c=>c.id==='vera').plan.phases.cursor,1);
    assert.equal(requests.length,2); assert.equal(requests[1].action.type,'work'); assert.equal(requests[1].action.target,'tea');
    assert.doesNotMatch(JSON.stringify(water.events),/泡了一壺茶|活動已完成/);
    const first = await (await post(advance)).json(); assert.equal(first.world.turn,1); assert.equal(requests.length,2);
    assert.equal((await post({...advance,operationId:id()})).status,200);
    const finished = await read(); assert.equal(finished.objects.find(o=>o.id==='acceptance-cup').state.contents,'tea');
    assert.equal(finished.characters.find(c=>c.id==='vera').plan,undefined);
    assert.equal(finished.aiUsage.totalCalls,2); assert.equal(requests.length,2);
    assert.equal(finished.objects.filter(o=>o.id==='acceptance-cup').length,1);
    assert.equal((await post({operation:'exit-acceptance'})).status,200);
    assert.equal((await read()).aiUsage.totalCalls,2);
  } finally {global.fetch = previous;}
});

test('tea has no success fallback when the cup is absent, budget is exhausted, or the candidate is invalid', async () => {
  for(const variant of ['missing','budget','invalid']) {
    const {post,advance} = await setup(w => {
      if(variant==='missing') w.objects = [];
      if(variant==='budget') w.playerBudget = {calls:1,tokens:1000000};
    }), previous = global.fetch;
    const before = await read(); let calls = 0;
    global.fetch = async (_url, init) => {
      calls++; const input = JSON.parse(JSON.parse(init.body).messages[1].content);
      return completion(input.contractVersion === 'world-adjudication.v1'
        ? variant==='missing' ? {status:'unsupported',effects:[],stages:[],check:null}
          : {status:'accepted',completionMinutes:15,effects:[{kind:'state',objectId:'acceptance-cup',expectedRevision:1,key:'contents',value:'tea'}],stages:[],check:null}
        : tea,JSON.parse(JSON.parse(init.body).messages[1].content));
    };
    try {
      const response = await post(advance), result = await response.json();
      assert.equal(response.status,variant==='missing'?200:variant==='budget'?429:502);
      const saved = await read(); if(variant==='missing')assert.deepEqual(nonPhoneObjects(saved),nonPhoneObjects(before));else assert.deepEqual(saved.objects,before.objects);
      assert.doesNotMatch(JSON.stringify(saved.events),/泡了一壺茶/);
      if(variant!=='missing') {assert.equal(saved.turn,before.turn);assert.equal(saved.minute,before.minute);}
      if(variant==='invalid') {assert.equal(result.stopReason.code,'candidate_contract'); assert.equal(result.adjudicationFailure.actorId,'vera');}
      const used = calls; await post(advance); assert.equal(calls,used); assert.equal(saved.aiUsage.totalCalls,used);
    } finally {global.fetch = previous;}
  }
});

test('unverified legacy plans and rule/direct entry cannot manufacture successful tea', async () => {
  const {post} = await setup(w => {
    const actor = w.characters.find(c=>c.id==='vera'); actor.plan = {action:{type:'work',target:'tea'},startedAt:705,until:795,modelKey:'demo:',attention:''};
    actor.activity='泡了一壺茶，放在桌上。';
  });
  assert.equal((await post({operation:'advance',minutes:15})).status,200);
  const saved = await read(); assert.doesNotMatch(JSON.stringify(saved.events),/泡了一壺茶|活動已完成/);
  assert.equal(saved.characters.find(c=>c.id==='vera').plan,undefined);
  assert.doesNotMatch(saved.characters.find(c=>c.id==='vera').activity,/泡了一壺茶/);
  const direct = await post({operation:'direct',action:{type:'work',target:'tea'}});
  assert.equal(direct.status,400); assert.match((await direct.json()).error,/泡茶/);
});
