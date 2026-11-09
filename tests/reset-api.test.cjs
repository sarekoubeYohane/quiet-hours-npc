/* eslint-disable @typescript-eslint/no-require-imports -- Node tests load a temporary transpiled build. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixtureDecision } = require('./pursuit-fixture.cjs');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const root = process.env.QUIET_HOURS_AUTH_BUILD;
const load = name => require(join(root, name + '.cjs'));
const fixture = load('fixture'), headers = load('headers'), world = load('app/api/world/route');
const { seedWorld } = load('lib/world');
const origin = 'http://localhost:5173';
const cookies = response => response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
const request = (path, cookie = '', init = {}) => new Request(origin + path, { ...init, headers: { cookie, ...init.headers } });
const operationId = () => `${Date.now()}:${crypto.randomUUID()}`;
function freshDatabase() {
  fixture.reset(); fixture.migrate(readFileSync(join(root, 'migrations.sql'), 'utf8'));
  // These auth/key/reset cases exercise pre-existing legacy worlds, not creation.
  fixture.installLegacyWorlds(['github:123','github:456']);
  Object.assign(fixture.env, { APP_ENV: 'local', AUTH_ORIGIN: origin, GITHUB_CLIENT_ID: 'local-client', GITHUB_CLIENT_SECRET: 'test-only-client-secret', SESSION_SECRET: 'test-only-signing-secret-at-least-32-characters', GITHUB_ALLOWED_IDS: '123,456', MODEL_KEY_ENCRYPTION_SECRET: 'ab'.repeat(32) });
  headers.set(new Headers());
}
async function signIn(id = 123) {
  const start = await load('app/api/auth/github/route').GET(request('/api/auth/github'));
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const original = global.fetch;
  global.fetch = async url => String(url).includes('/login/oauth/access_token') ? Response.json({ access_token: 'fake-github-token' }) : Response.json({ id, login: 'owner' + id });
  try { return cookies(await load('app/api/auth/github/callback/route').GET(request('/api/auth/github/callback?code=fake&state=' + state, cookies(start)))); }
  finally { global.fetch = original; }
}
async function post(cookie, body) {
  headers.set(new Headers({ cookie }));
  const response = await world.POST(request('/api/world', cookie, { method: 'POST', headers: { origin, 'X-World-Time-Policy':'round-v1' }, body: JSON.stringify({ mode: 'demo', operationId: operationId(), ...body }) }));
  if (body.operation === 'set-model-key' && response.ok) {
    await post(cookie, { operation: 'set-adjudication', adjudication: { provider: 'openai', model: 'gpt-6-luna' } });
  }
  return response;
}
async function read(cookie) {
  headers.set(new Headers({ cookie }));
  const response = await world.GET();
  assert.equal(response.status, 200);
  const view=await response.json();Object.defineProperty(view,'persisted',{value:await fixture.env.DB.prepare('SELECT state,version FROM worlds WHERE owner=?').bind(view.operationScope).first()});return view;
}
const advance = (cookie, body = {}) => post(cookie, { operation: 'advance', minutes: 15, ...body });
const resetWorld = (cookie, body = {}) => post(cookie, { operation: 'reset', ...body });
const modelReply = init => Response.json({ usage: { prompt_tokens: 10, completion_tokens: 5 }, choices: [{ message: { content: JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(init.body).messages[1].content), { type: 'rest', target: '', content: '休息一下', mood: '平靜', durationMinutes: 60, intents: [] })) } }] });
const paidAdvance = async (cookie, fetcher = async (_url, init) => modelReply(init)) => {
  const original = global.fetch; global.fetch = fetcher;
  try { return await advance(cookie, { mode: 'openai', model: 'gpt-6-luna' }); } finally { global.fetch = original; }
};

// Legacy snapshots and receipts below are historical compatibility fixtures,
// never evidence that a user created a new world through the retired endpoint.
const unchanged=async(cookie,before)=>{const after=await read(cookie);assert.equal(after.version,before.version);assert.deepEqual(after.persisted,before.persisted);const a=structuredClone(after.world),b=structuredClone(before.world);if(b.aiUsage?.totalCalls===0&&b.aiUsage.calls===0){assert.equal(a.aiUsage.totalCalls,0);assert.equal(a.aiUsage.calls,0);delete a.aiUsage.windowStartedAt;delete b.aiUsage.windowStartedAt;}assert.deepEqual(a,b);return after;};
const historicalReceipt=async(id,result)=>fixture.env.DB.prepare('UPDATE worlds SET operations=? WHERE owner=?').bind(JSON.stringify({floor:0,results:{[id]:result}}),'github:123').run();

test('a new reset is retired and preserves the complete current story instead of installing a seed',async()=>{
 freshDatabase();const cookie=await signIn();await advance(cookie);await advance(cookie,{minutes:30});await post(cookie,{operation:'intervene',target:'cass',text:'咖啡館明天有活動。'});await post(cookie,{operation:'takeover'});
 const before=await read(cookie);assert.equal(before.world.turn,2);assert.equal(before.world.characters.find(c=>c.id==='owner').control.mode,'taken-over');
 const response=await resetWorld(cookie);assert.equal(response.status,409);assert.equal((await response.json()).operationSettled,true);await unchanged(cookie,before);
 assert.equal((await(await advance(cookie)).json()).world.turn,3);
});
test('a rejected new reset retains hourly account usage, complete life and saved decisions',async()=>{
 freshDatabase();const cookie=await signIn();await post(cookie,{operation:'set-model-key',mode:'openai',key:'test-only-model-key-never-real'});await paidAdvance(cookie);assert.equal((await read(cookie)).world.aiUsage.totalCalls,4);
 await paidAdvance(cookie,async()=>{throw Error('continuations must not call the model');});const before=await read(cookie);assert.equal(before.world.aiUsage.savedDecisions,4);assert.equal((await resetWorld(cookie)).status,409);const after=await unchanged(cookie,before);assert.deepEqual(after.accountPlayer.usage,before.accountPlayer.usage);
 await post(cookie,{operation:'set-budget',limits:{calls:3,tokens:30000}});const blocked=await post(cookie,{operation:'advance',minutes:15,mode:'openai',model:'gpt-6-luna'});assert.equal(blocked.status,429);assert.equal((await blocked.json()).limitReached,true);
});
test('retired reset changes neither the signed-in story nor another invited account',async()=>{
 freshDatabase();const first=await signIn(123),second=await signIn(456);await advance(first);await advance(second);await advance(second);const a=await read(first),b=await read(second);assert.equal((await resetWorld(first)).status,409);await unchanged(first,a);await unchanged(second,b);
});
test('an explicitly installed historical settled reset receipt still replays without resetting current progress',async()=>{
 freshDatabase();const cookie=await signIn();await advance(cookie);const before=await read(cookie),operation=operationId();const saved={world:seedWorld(),version:1,operationSettled:true,historical:'pre-retirement-reset'};
 await historicalReceipt(operation,{status:200,body:saved});const response=await resetWorld(cookie,{operationId:operation});assert.equal(response.status,200);assert.deepEqual(await response.json(),saved);await unchanged(cookie,before);assert.equal((await resetWorld(cookie)).status,409);await unchanged(cookie,before);
});
test('an old pending reset recovers by its original receipt while new reset cannot disturb an active world lease',async()=>{
 freshDatabase();const cookie=await signIn(),operation=operationId();const before=await read(cookie);await historicalReceipt(operation,{pending:Date.now()+60000});let response=await resetWorld(cookie,{operationId:operation});assert.equal(response.status,409);assert.equal((await response.json()).retryable,true);await unchanged(cookie,before);
 await historicalReceipt(operation,{pending:Date.now()-1});response=await resetWorld(cookie,{operationId:operation});assert.equal(response.status,502);const uncertain=await response.json();assert.equal(uncertain.operationUncertain,true);assert.deepEqual(await(await resetWorld(cookie,{operationId:operation})).json(),uncertain);await unchanged(cookie,before);
});
test('a legacy world with older missing optional fields stays readable and cannot be overwritten by new reset',async()=>{
 freshDatabase();const cookie=await signIn();const legacy=seedWorld();delete legacy.pursuitVersion;delete legacy.pursuitContext;for(const actor of legacy.characters){delete actor.plan;delete actor.attributes;}
 await fixture.env.DB.prepare('UPDATE worlds SET state=?,version=7 WHERE owner=?').bind(JSON.stringify(legacy),'github:123').run();const before=await read(cookie);assert.equal(before.version,7);assert.equal((await resetWorld(cookie)).status,409);await unchanged(cookie,before);
});
test('retired reset still validates operation identity and original account scope',async()=>{
 freshDatabase();const cookie=await signIn();headers.set(new Headers({cookie}));const missing=await world.POST(request('/api/world',cookie,{method:'POST',headers:{origin,'X-World-Time-Policy':'round-v1'},body:JSON.stringify({mode:'demo',operation:'reset'})}));assert.equal(missing.status,400);
 const foreign=await resetWorld(cookie,{operationScope:'github:999'});assert.equal(foreign.status,409);assert.equal((await foreign.json()).scopeMismatch,true);assert.equal((await read(cookie)).version,0);
});
test('rejected new reset does not expire old unsubmitted intentions or invalidate already settled results',async()=>{
 freshDatabase();const cookie=await signIn();const earlier={operation:'intervene',target:'cass',text:'仍屬原故事的一句話。',operationId:operationId()},settled={operation:'advance',minutes:15,operationId:operationId()};const original=await(await post(cookie,settled)).json(),before=await read(cookie);
 assert.equal((await resetWorld(cookie)).status,409);await unchanged(cookie,before);assert.equal((await post(cookie,earlier)).status,200);const after=await read(cookie);assert.equal(after.world.turn,1);assert.ok(after.world.events.some(event=>event.text.includes('仍屬原故事')));assert.deepEqual(await(await post(cookie,settled)).json(),original);await unchanged(cookie,after);
});
