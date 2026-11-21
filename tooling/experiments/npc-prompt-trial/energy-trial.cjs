// Run from repo root: node tests/run-activities.mjs tooling/experiments/npc-prompt-trial/energy-trial.cjs
// TRIAL_DRY=1 checks wiring with explicitly labelled fixtures; live mode uses OPENAI_API_KEY or TRIAL_KEY_FILE.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {createHash} = require('node:crypto');
const prompts = require('./energy-prompts.cjs');
const sleepTrial = require('./sleep-trial.cjs');
const {applyDraft} = require('./assemble.cjs');
const {fixtureDecision} = require('../../../tests/pursuit-fixture.cjs');
const load = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, name + '.cjs'));
const model = 'gpt-6.1-sol';
const dry = process.env.TRIAL_DRY === '1';
const scenario = process.env.TRIAL_SCENARIO || 'solo';
const compareRevisions = scenario.endsWith('-revision');
const compareDraft = scenario.endsWith('-draft') || compareRevisions;
const sharedRoom = scenario.split('-')[0] === 'companion';
const compareOnset = scenario === 'sleep-onset';
const captureDispatch = compareOnset || compareDraft;
const testSleep = scenario.split('-')[0] === 'sleep';
const runs = Number(process.env.TRIAL_RUNS || (testSleep || compareDraft ? 1 : sharedRoom ? 3 : 2));
const digest = data => createHash('sha256').update(data).digest('hex');

async function makeScene(name, sleepCase) {
  const {seedWorld, record} = load('world');
  const {exampleCharacterCards} = load('example-content');
  const seed = seedWorld();
  const partnerName = name === 'Cass' ? 'Vera' : 'Cass';
  const names = sharedRoom ? [name, partnerName] : [name];
  const cards = names.map(actorName => exampleCharacterCards.find(card => card.fields.name === actorName));
  if (sleepCase) {
    cards[0] = structuredClone(cards[0]);
    cards[0].fields.directions = sleepCase.goal;
  }
  const scene = {id:'test-quiet-home',version:1,name:'住處',note:'安靜的傍晚。',
    rooms:[{id:'main',name:'自己的房間'}],connections:[],objects:[
      {id:'chair',name:'自己的休息椅',roomId:'main',state:{}},
      {id:'bed',name:'自己的床',roomId:'main',state:{}}
    ]};
  if (sharedRoom) {
    scene.rooms[0].name = '共用起居室';
    scene.objects[0].name = '休息椅';
    scene.objects[1] = {id:'sofa',name:'沙發',roomId:'main',state:{}};
  }
  const draft = {places:[{id:'home',templateId:scene.id,version:1,name:scene.name}],
    characters:cards.map(card=>({templateId:card.id,version:card.version,placeId:'home',roomId:'main',
      homeId:'home',homeRoomId:'main',ownedPlaceIds:['home'],
      mentalOpening:{current:card.fields.name === 'Cass' ? 1 : 49},
      openingNeeds:sleepCase ? {hunger:15,thirst:15,fatigue:30,sleep:sleepCase.need} : {hunger:30,thirst:30,fatigue:15,sleep:20}}))};
  if (sharedRoom) {
    draft.relationships = cards.map((card, i) => {
      const self = seed.characters.find(person => person.name === card.fields.name);
      const other = seed.characters.find(person => person.name === cards[1-i].fields.name);
      return {from:card.id,to:cards[1-i].id,targetType:'character',description:self.relationships[other.id]};
    });
  }
  const {world,preview} = await load('city-creation').prepareCity('trial', draft, seed, {scenes:[scene],cards});
  assert.deepEqual(preview.issues, []);
  world.timeContract = 'five-minute-v1';
  world.adjudication = {provider:'openai',model};
  const actor = world.characters[0];
  actor.control = {mode:'autonomous'};
  load('phones').activatePhones(world); // Mint the phone once before cloning the paired input.
  if (sharedRoom) {
    world.characters[1].control = {mode:'taken-over'};
  } else if (!sleepCase) {
    record(world,'observer','你收到一張便條，上面寫著：「今晚這裡留給你，你可以照自己的步調安排。」','intervention',[actor.id]);
  }
  return world;
}

async function trial(world, condition, repetition, key, fingerprints, sleepCase) {
  const {POST} = load('route'), store = load('store');
  const actor = world.characters[0];
  store.install(structuredClone(world));
  const post = body => POST(new Request('https://test.invalid/api/world', {method:'POST',
    headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},
    body:JSON.stringify({operationScope:'test-owner',worldContext:world.contextId,
      operationId:Date.now()+':'+crypto.randomUUID(),mode:'openai',model,...body})}));
  const fixtureKey = 'local-transport-placeholder-000000';
  assert.equal((await post({operation:'set-model-key',key:fixtureKey})).status,200);
  if (sharedRoom || sleepCase) assert.equal((await post({operation:'set-budget',limits:{calls:6,tokens:150000}})).status,200);
  const row = {scenario,name:actor.name,condition,repetition,transport:dry?'fixture':'OpenAI',inputHash:null,
    calls:[],candidate:null,committed:false,activityStarted:null,energyStart:actor.mentalEnergy.value};
  if (captureDispatch) row.snapshotHash = digest(JSON.stringify(world));
  const realFetch = global.fetch;
  let decisionMade = false;
  global.fetch = async (url,init) => {
    assert.equal(String(url),'https://api.openai.com/v1/chat/completions');
    const body = JSON.parse(init.body), input = JSON.parse(body.messages[1].content);
    const isNPC = input.contractVersion === 'npc-decision.v3';
    // The silent partner does not supply an independent decision or a new emotional event.
    if (sharedRoom && input.contractVersion === 'controlled-feelings.v1') {
      assert.equal(input.self.id,world.characters[1].id);
      row.partnerAssessmentsSkipped = (row.partnerAssessmentsSkipped || 0) + 1;
      const content = JSON.stringify({contractVersion:input.contractVersion,processFeeling:null,feelingUpdates:[]});
      return Response.json({usage:{prompt_tokens:0,completion_tokens:0},choices:[{message:{content}}]});
    }
    if (isNPC) {
      if (decisionMade) {
        row.followupNeedsNewDecision = true;
        throw Error('Only the first autonomous decision is sampled');
      }
      decisionMade = true;
      if (captureDispatch) row.inputHash = digest(JSON.stringify(body));
      if (sleepCase) {
        row.sleepCase = sleepCase.id;
        row.goal = sleepCase.goal;
        row.sleepiness = input.self.bodyFeelings.find(x=>x.need==='睡眠需求')?.feeling;
        assert.equal(row.sleepiness,sleepCase.feeling);
        assert.ok(JSON.stringify(input.self).includes(sleepCase.goal),'subjective intention missing from decision');
        assert.ok(input.objects.some(o=>o.label==='自己的床'),'no visible bed');
        if (!captureDispatch) row.inputHash = digest(JSON.stringify([input,body.response_format]));
        if (!compareDraft) body.messages[0].content = sleepTrial.sleepPromptFor(body.messages[0].content,load('needs').sleepActionPrompt,condition);
      }
      if (sharedRoom) {
        const partner = world.characters[1];
        const visible = input.visiblePeople.find(person => person.id === partner.id);
        const relationship = input.self.relationships[partner.id];
        if (input.self.id !== actor.id || visible?.name !== partner.name || !relationship || relationship !== actor.relationships[partner.id]) {
          row.harnessError = 'The focal NPC must see the partner and its own opening relationship.';
          throw Error(row.harnessError);
        }
        row.partner = {name:visible.name,relationship};
      }
      if (!sleepCase && !captureDispatch) row.inputHash = digest(JSON.stringify([body.messages,body.response_format]));
      const pair = actor.name + (sleepCase?.id ?? '');
      if (!fingerprints.has(pair)) fingerprints.set(pair,row.inputHash);
      if (row.inputHash !== fingerprints.get(pair)) {
        row.harnessError = 'Unmodified model input changed across conditions';
        throw Error(row.harnessError);
      }
      if (condition === 'draft' || compareRevisions) {
        row.included = applyDraft(body,input,condition === 'draft' ? 'v0.2.3' : condition);
      }
      if (prompts[condition]) body.messages[0].content += '\n\n' + prompts[condition];
      row.systemHash = digest(body.messages[0].content);
    } else {
      assert.equal(input.contractVersion,'world-adjudication.v1');
    }
    const call = {kind:isNPC?'npc':'adjudication'};
    if (captureDispatch) call.request = body; // Generated game data only. Never store headers.
    row.calls.push(call);
    let response;
    if (dry && sleepCase) {
      const candidate = sleepTrial.fixture(input,condition,sleepCase);
      response = Response.json({usage:{prompt_tokens:1,completion_tokens:1},choices:[{message:{content:JSON.stringify(candidate)}}]});
    } else if (dry) {
      assert.ok(isNPC);
      let feeling = condition === 'original' ? null : {direction:'positive',level:2,reason:'安靜的片刻讓我感到放鬆。'};
      if (condition === 'companion') feeling = actor.name === 'Cass'
        ? {direction:'negative',level:2,reason:'Vera 在旁邊，我還惦記著想獨處。'}
        : {direction:'positive',level:2,reason:'能和 Cass 一起安靜地坐著，我覺得安心。'};
      const sources = input.self.shortTerm.flatMap(m=>m.feelingSources || []);
      if (!sharedRoom) assert.ok(sources.length, 'solo scenario needs a real feeling source');
      const updates = condition === 'examples' ? [{source:sources[0],direction:'positive',level:1,reason:'這張便條讓我安心。',mood:null}] : [];
      const candidate = fixtureDecision(input,{type:'rest',target:'',content:'坐著安靜休息。',durationMinutes:30,processFeeling:feeling,feelingUpdates:updates});
      response = Response.json({usage:{prompt_tokens:1,completion_tokens:1},choices:[{message:{content:JSON.stringify(candidate)}}]});
    } else {
      // The real credential is used only for the provider; the test database has a placeholder.
      const headers = new Headers(init.headers); headers.set('Authorization','Bearer '+key);
      response = await realFetch(url,{...init,headers,body:JSON.stringify(body),redirect:'error'});
    }
    call.status = response.status;
    if (response.ok) {
      const envelope = await response.clone().json();
      if (captureDispatch) call.reply = envelope.choices[0].message.content;
      call.usage = envelope.usage;
      if (isNPC || sleepCase) {
        try {
          const candidate = JSON.parse(envelope.choices[0].message.content);
          if (isNPC) {
            row.candidate = {action:candidate.action,timeIntent:candidate.timeIntent,durationMinutes:candidate.durationMinutes,
              processFeeling:candidate.processFeeling,feelingUpdates:candidate.feelingUpdates,
              emotionRegulation:candidate.emotionRegulation,reason:candidate.methodAssessment?.reason};
          } else {
            row.judgement = {status:candidate.status,bodyActivity:candidate.bodyActivity,routine:candidate.routine,
              completionMinutes:candidate.completionMinutes,explanation:candidate.explanation,blockedReason:candidate.knownBlockedReason};
          }
        } catch { call.unparsed = true; }
      }
    }
    return response;
  };
  const advance = (mode='openai') => post({operation:'advance',timeContract:'five-minute-v1',minutes:5,mode});
  try {
    const result = await advance(); row.http = result.status;
    if (captureDispatch) {
      const saved = store.snapshot(), person = saved.characters.find(c=>c.id===actor.id);
      row.firstWorld = {from:world.minute,minute:saved.minute,activity:person.activity,
        body:person.plan?.bodyActivity?.kind ?? null,energy:person.mentalEnergy.value,
        events:saved.events.filter(e=>!world.events.some(before=>before.id===e.id)).map(e=>e.text)};
      assert.equal(saved.minute, world.minute + (result.ok ? 5 : 0), 'check the saved minute after advance');
    }
    if (result.status !== 200) { row.failure = (await result.json()).error; return row; }
    row.committed = true;
    const first = store.snapshot().characters[0];
    row.activityStarted = first.plan?.action?.type || null;
    row.recordedProcess = first.plan?.mentalProcess?.assessment || null;
    row.receipts = (first.mentalEnergy.experiences?.receipts || []).filter(r=>r.at>world.minute);
    row.energyAfterDecision = first.mentalEnergy.value;
    if (sleepCase) {
      row.sleep = await sleepTrial.observeSleep(first,()=>advance('demo'),()=>store.snapshot().characters[0]);
    } else if (first.plan) {
      // Elapsed activity time settles before the next action selection.
      row.followupMode = sharedRoom || compareRevisions ? 'demo' : 'openai';
      const next = await advance(row.followupMode); row.nextHttp = next.status;
      if (next.status !== 200) row.followupFailure = (await next.json()).error;
    }
    const end = store.snapshot().characters[0];
    row.energyEnd = end.mentalEnergy.value;
    row.interval = end.mentalEnergy.history.filter(h=>h.from >= world.minute &&
      ['process','natural'].includes(h.kind)).map(h=>({minute:h.minute,processMinutes:h.processMinutes,
      draws:h.draws?.filter(d=>d.die===3),processDelta:h.processDelta,naturalDelta:h.naturalDelta,sleepDelta:h.sleepDelta}));
    row.processTriggered = row.interval.some(h=>h.draws?.length);
    row.positiveCredit = row.receipts.some(r=>r.rawDelta>0) || row.interval.some(h=>h.processDelta>0 || h.sleepDelta>0);
    return row;
  } finally { global.fetch = realFetch; }
}

test('NPC system prompt and mental-energy settlement trial',{timeout:60*60*1000},async()=>{
  const conditions = {
    solo:['original','hint','examples'], companion:['hint','companion'], sleep:['baseline','revised'],
    'sleep-onset':['current','candidate'], 'sleep-draft':['current','draft'], 'companion-draft':['current','draft'],
    'sleep-revision':['v0.2.3','v0.2.4'], 'solo-revision':['v0.2.3','v0.2.4'], 'companion-revision':['v0.2.3','v0.2.4']
  };
  const variants = conditions[scenario];
  assert.ok(variants,'Unknown TRIAL_SCENARIO');
  assert.ok(Number.isInteger(runs) && runs>=1 && runs<=10);
  const key = dry ? null : process.env.OPENAI_API_KEY || (process.env.TRIAL_KEY_FILE && fs.readFileSync(process.env.TRIAL_KEY_FILE,'utf8').trim());
  assert.ok(dry || key,'Set OPENAI_API_KEY or TRIAL_KEY_FILE for live sampling.');
  const dir = process.env.TRIAL_DIR || fs.mkdtempSync(path.join(os.tmpdir(),'npc-energy-trial-'));
  fs.mkdirSync(dir,{recursive:true});
  const file = path.join(dir,(scenario==='solo'?'':scenario+'-')+(dry?'fixture':'live')+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.jsonl');
  const names=['Cass','Vera'], fingerprints=new Map();
  const cases = (testSleep ? sleepTrial.scenarios : [undefined]).flatMap(sleepCase=>names.map(name=>({name,sleepCase})));
  const scenes = await Promise.all(cases.map(({name,sleepCase})=>makeScene(name,sleepCase)));
  console.log('Model:',model,'Transport:',dry?'scripted fixture':'OpenAI','Records:',file);
  for (let rep=0;rep<runs;rep++) for (let i=0;i<cases.length;i++) for(let j=0;j<variants.length;j++) {
    const condition=variants[(j+rep+i)%variants.length];
    const row=await trial(scenes[i],condition,rep+1,key,fingerprints,cases[i].sleepCase);
    fs.appendFileSync(file,JSON.stringify(row)+'\n');
    assert.ok(!row.harnessError,row.harnessError);
    if (captureDispatch) assert.ok(row.calls[0]?.status === 200, 'NPC provider call failed; stop sampling');
    if (testSleep) {
      console.log(row.name,row.sleepCase,condition,'action',row.candidate?.action?.type,'committed',row.committed,
        'body',row.sleep?.initialBodyActivity,'full hour',row.sleep?.fullHour,'failure',row.failure||row.sleep?.failure||'');
    } else {
      console.log(row.name,condition,rep+1,'committed',row.committed,'process',row.recordedProcess?.direction,
        'draw',row.processTriggered,'receipts',row.receipts?.length,'credit',row.positiveCredit,'failure',row.failure||row.followupFailure||'');
    }
    if (row.calls.some(c=>[401,402,403,429].includes(c.status))) throw Error('Provider authorization, balance or rate limit; stop sampling.');
    if (dry && testSleep) {
      assert.equal(row.committed,true,row.failure);
      const proposesSleep = condition!=='baseline' && cases[i].sleepCase.id!=='awake';
      if (proposesSleep && condition==='candidate') {
        assert.equal(row.calls.length,1,'open-ended proposals stop before adjudication');
        assert.match(row.firstWorld.activity,/尚未執行/);
        assert.equal(row.sleep.initialBodyActivity,null);
      } else {
        assert.equal(row.sleep.initialBodyActivity,proposesSleep?'sleep':'rest');
        if (proposesSleep) assert.equal(row.sleep.fullHour,true);
      }
    } else if (dry) {
      assert.equal(row.committed,true);assert.equal(row.nextHttp,200);
      assert.equal(row.processTriggered,condition!=='original');
      assert.equal(row.receipts.length,condition==='examples'?1:0);
      const negative = condition==='companion' && row.name==='Cass';
      if (negative) assert.ok(row.interval.some(h=>h.processDelta<0));
      assert.equal(row.positiveCredit,condition!=='original' && !negative);
    }
  }
});
