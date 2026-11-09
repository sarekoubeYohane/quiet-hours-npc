/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const load = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, name + '.cjs'));
const route = load('route');
const people = load('character-templates-route');
const scenes = load('scene-templates-route');
const store = load('store');
const { blankCharacterTemplateFields } = load('character-templates');
const { seedWorld } = load('world');
const { fixtureDecision } = require('./pursuit-fixture.cjs');
const {installHistoricalCity}=require('./historical-city-fixture.cjs');
const origin = 'https://test.invalid';
const send = (api, body) => api.POST(new Request(origin, {
  method: 'POST', headers: { origin, 'X-World-Time-Policy': 'round-v1' }, body: JSON.stringify(api === scenes ? {id:crypto.randomUUID(),version:0,...body} : body),
}));
const operationId = () => Date.now() + ':' + crypto.randomUUID();
const response = async (result, status) => {
  const body = await result.json();
  assert.equal(result.status, status, JSON.stringify(body));
  return body;
};

test('historical city compatibility: entry permission uses the actual place and the room override and is recorded independently of physical movement', async () => {
  const legacy = seedWorld();
  legacy.adjudication = { provider: 'openai', model: 'gpt-6.1-sol' };
  store.install(legacy);
  const opening = await response(await route.GET(), 200);
  const person = async name => (await response(await send(people, {
    id:crypto.randomUUID(), version:0, fields:{...blankCharacterTemplateFields(), name},
  }), 200)).template;
  const employee = await person('秋言');
  const friend = await person('阿眠');
  const access = { building:'public', rooms:{ staff:'workers' } };
  const scene = (await response(await send(scenes, {
    name:'咖啡店', note:'',
    rooms:[{id:'front',name:'前場'},{id:'staff',name:'員工房'}],
    connections:[{id:'staff-door',name:'工作門',rooms:['front','staff']}],
    objects:[{id:'private-note',name:'隱藏排班表',roomId:'staff',state:{}}],
    access,
  }), 201)).template;
  const house = (await response(await send(scenes, {
    name:'住宅', note:'', rooms:[{id:'hall',name:'大廳'},{id:'suite',name:'私人房'}],
    connections:[], objects:[], access:{building:'residents',rooms:{suite:'private'}},
  }), 201)).template;
  const city = {
    places:[
      {id:'east',templateId:scene.id,version:scene.version,name:'東店'},
      {id:'west',templateId:scene.id,version:scene.version,name:'西店'},
      {id:'home',templateId:house.id,version:house.version,name:'河畔住處'},
    ],
    characters:[
      {templateId:employee.id,version:employee.version,placeId:'east',roomId:'front',workplaceIds:['east']},
      {templateId:friend.id,version:friend.version,placeId:'west',roomId:'front',homeId:'home'},
    ],
    accessGrants:[{placeId:'home',characterTemplateId:employee.id}],
  };
  const scope = { operationScope:opening.operationScope, worldContext:opening.world.contextId, expectedVersion:opening.version };
  const preview = (await response(await send(route, { ...scope, operation:'preview-city', mode:'demo', city }), 200)).preview;
  assert.deepEqual(preview.issues, []);
  const allowed = (placeId, roomId) => preview.access.find(item=>item.placeId===placeId && item.roomId===roomId).allowed.map(item=>item.name);
  assert.deepEqual(allowed('east', 'staff'), ['秋言']);
  assert.deepEqual(allowed('west', 'staff'), []);
  assert.deepEqual(allowed('west', 'front'), ['秋言','阿眠']);
  assert.deepEqual(allowed('home', undefined), ['秋言','阿眠']);
  assert.deepEqual(allowed('home', 'hall'), ['秋言','阿眠']);
  assert.deepEqual(allowed('home', 'suite'), []);
  const edited = structuredClone(city);
  edited.accessGrants.push({ placeId:'home', roomId:'suite', characterTemplateId:employee.id });
  const revised = (await response(await send(route, {...scope, operation:'preview-city', mode:'demo', city:edited}), 200)).preview;
  assert.deepEqual(revised.access.find(item=>item.placeId==='home' && item.roomId==='suite').allowed.map(item=>item.name), ['秋言']);
  edited.accessGrants[1].roomId = 'not-in-this-home';
  const invalid = (await response(await send(route, {...scope, operation:'preview-city', mode:'demo', city:edited}), 200)).preview;
  assert.match(invalid.issues.join(''), /授權/);
  const started = await installHistoricalCity(city);
  const {world} = await response(await route.GET(), 200);
  assert.equal(world.configuration.residences[world.characters[0].id], undefined);
  assert.deepEqual(world.configuration.access, started.world.configuration.access);
  assert.deepEqual((await response(await scenes.GET(), 200)).templates.find(item=>item.id===scene.id).access, access);
  assert.deepEqual(Object.values(world.scene.doors), ['open','open']);

  await response(await send(route, { operation:'set-model-key', mode:'openai', key:'controlled' }), 200);
  const transport = global.fetch;
  const inputs = [];
  const adjudications = [];
  global.fetch = async (_url, request) => {
    const input = JSON.parse(JSON.parse(request.body).messages[1].content);
    if (input.contractVersion==='world-adjudication.v1') {
      adjudications.push(input);
      const denial = {status:'denied',completionMinutes:null,effects:[],check:null,stages:[],routine:null};
      return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify(denial)}}]});
    }
    inputs.push(input);
    const name = input.self.name;
    const target = world.configuration.regions.find(region => region.name==='員工房' &&
      region.location===world.characters.find(actor=>actor.name===name).location).id;
    const action = fixtureDecision(input, inputs.length <= 2
      ? { type:'move', target, content:'' }
      : { type:'propose', target, content:'在房間稍坐', purpose:'稍作休息', timeIntent:{kind:'completion',maxMinutes:null} });
    return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify(action)}}]});
  };
  try {
    // New choices begin forward; complete the fifteen-minute movement before judging a new room proposal.
    for(let step=0;step<5;step++){
    await response(await send(route, { operation:'advance', worldContext:world.contextId, operationId:operationId(), mode:'openai', model:'gpt-6.1-sol', minutes:5,timeContract:'five-minute-v1' }), 200);
    }
  } finally {
    global.fetch = transport;
  }
  const after = (await response(await route.GET(), 200)).world;
  assert.deepEqual(Object.fromEntries(adjudications.map(input=>[input.actor.id,input.entryPermission?.allowed])), {'npc:1':true,'npc:2':false});
  const moves = after.events.filter(item=>item.kind==='move');
  assert.deepEqual(Object.fromEntries(moves.map(item=>[item.actor,item.entryPermission?.allowed])), {'npc:1':true,'npc:2':false});
  assert.equal(after.characters.find(actor=>actor.name==='阿眠').region, 'place:west:room:staff');
  for (const input of inputs) assert.doesNotMatch(JSON.stringify(input), /allowedActorIds|entryPermission|workers|隱藏排班表/);
});
