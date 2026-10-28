/* eslint-disable @typescript-eslint/no-require-imports -- Public API/SQLite and actual request boundaries; external model transport only is fixed. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {scenario:sourceScenario,propose,rest,advance}=require('./alternative-food-fixture.cjs');
const scenario=async options=>{const s=await sourceScenario(options),random=Math.random;Math.random=()=>.675;return {...s,restore:()=>{Math.random=random;s.restore();}};};
const {nonPhoneObjects}=require('./fixtures/non-phone-objects.cjs');
const f=require('./routine-world-programs-fixture.cjs');
const load=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,name+'.cjs'));
const {search,initial}=require('./routine-discovery-fixture.cjs');

test('ordinary background search confirms a source without taking it; SQLite and next actual messages support a later real acquisition',async()=>{
 const s=await scenario({prepare:initial});try{
  s.choose(propose('查看這裡可用的普通備餐材料','確認可用材料'));s.reply(f.approval([search()],'find-ingredient'));
  let w=await advance(s);assert.equal(w.supplies.length,1);const source=w.supplies[0];assert.equal(source.pending,undefined);assert.deepEqual(source.knownTo,['owner']);assert.equal(source.remaining,1);assert.equal(source.background.sequence,0);assert.equal(nonPhoneObjects(w).length,0);assert.equal(s.judgments(),1);
  s.choose(rest);await advance(s);const next=s.inputs.at(-1);assert.ok(next.supplies.some(x=>x.id===source.id));assert.equal(JSON.stringify(s.requests.at(-1).messages).includes('allowedTo'),false);
  s.choose(propose('取一份剛才找到的材料','取得材料',source.id));s.reply({status:'accepted',completionMinutes:15,effects:[{kind:'materialize',supplyId:source.id,expectedRemaining:1}],check:null});w=await advance(s);assert.equal(w.supplies[0].id,source.id);assert.equal(w.supplies[0].background.sequence,1);assert.equal(w.supplies[0].remaining,1);const actual=nonPhoneObjects(w)[0];assert.equal(actual.source,source.id);assert.equal(actual.holder,'owner');assert.equal(actual.owner,'owner');assert.equal(s.judgments(),2);
 }finally{s.restore();}
});
