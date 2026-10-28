/* eslint-disable @typescript-eslint/no-require-imports -- Real API/SQLite with explicit NPC/adjudication transport only. */
const test=require('node:test'),assert=require('node:assert/strict');
const {scenario,rest,proposal,discover,accepted,load}=require('./discovery-fixture.cjs');
const confirmed=(key,effects)=>({...accepted(effects),activityIdentity:{version:1,key,label:key==='scan-shelf'?'查看架上供應':'逐一檢查供應位置'}});
test('the same confirmed method preserves a failed source search; a genuinely different world-confirmed method creates one new opportunity',async()=>{
 const s=await scenario();try{
  let rolls=0;Math.random=()=>{rolls++;return .075;};s.reply(confirmed('scan-shelf',[discover(['unknown-object'],['unknown-supply'])]));let w=await s.advance();assert.deepEqual(w.supplies[0].knownTo,[]);assert.equal(rolls,1);
  Math.random=()=>{rolls++;return .975;};s.choose({...rest,type:'propose',target:'cafe-front',content:'再仔細看看架上的來源',purpose:'確認材料'});s.reply(confirmed('scan-shelf',[discover(['unknown-object'],['unknown-supply'])]));w=await s.advance();assert.deepEqual(w.supplies[0].knownTo,[]);assert.equal(rolls,1,'changing only NPC wording cannot grant a new method');
  s.choose({...rest,type:'propose',target:'cafe-front',content:'逐個位置核對供應的標示與內容',purpose:'確認材料'});s.reply(confirmed('inspect-supply-positions',[discover(['unknown-object'],['unknown-supply'])]));w=await s.advance();assert.deepEqual(w.supplies[0].knownTo,['owner']);assert.equal(rolls,2,'both new resource opportunities share one die for the different confirmed method');assert.deepEqual(w.objects[0].knownTo,['owner']);assert.equal(w.supplies[0].remaining,2);assert.equal(w.objects.some(o=>o.source==='unknown-supply'),false);
  s.choose(rest);await s.advance();assert.ok(s.npc().at(-1).input.supplies.some(source=>source.id==='unknown-supply'));assert.equal(s.judgments().length,3);
 }finally{s.restore();}
});

test('confirmed method context is stored across SQLite phases without an early roll or NPC-side cache key',async()=>{
 const s=await scenario();try{
  let rolls=0;Math.random=()=>{rolls++;return .075;};s.reply(confirmed('scan-shelf',[discover([],['unknown-supply'])]));await s.advance();assert.equal(rolls,1);
  Math.random=()=>{rolls++;return .975;};s.reply({...confirmed('scan-shelf',[discover([],['unknown-supply'])]),completionMinutes:30});let w=await s.advance();assert.equal(rolls,1);assert.deepEqual(w.characters[0].plan.phases.stages[0].discoveryMethod,{version:1,kind:'activity',key:'scan-shelf'});w=await s.advance();assert.equal(rolls,1);assert.deepEqual(w.supplies[0].knownTo,[]);
  s.reply({...confirmed('inspect-supply-positions',[discover([],['unknown-supply'])]),completionMinutes:30});w=await s.advance();assert.equal(rolls,1);assert.deepEqual(w.characters[0].plan.phases.stages[0].discoveryMethod,{version:1,kind:'activity',key:'inspect-supply-positions'});w=await s.advance();assert.equal(rolls,2);assert.deepEqual(w.supplies[0].knownTo,['owner']);s.choose(rest);await s.advance();assert.equal(JSON.stringify(s.npc().at(-1).input).includes('discoveryMethod'),false);assert.equal(JSON.stringify(s.npc().at(-1).input).includes('resource-probe.v2'),false);
 }finally{s.restore();}
});

test('old unscoped group receipts are reused on first method confirmation without read-time migration, then a different confirmed method can investigate',async()=>{
 let legacy;const first=await scenario();try{Math.random=()=>.075;first.reply(accepted([discover([],['unknown-supply'])]));legacy=await first.advance();legacy.probeResults=Object.fromEntries(Object.entries(legacy.probeResults).filter(([key])=>!key.includes('resource-probe.v1')));}finally{first.restore();}
 const s=await scenario({world:legacy});try{
  const before=load('store').snapshot();await s.read();assert.deepEqual(load('store').snapshot(),before);let rolls=0;Math.random=()=>{rolls++;return .975;};
  s.reply(confirmed('scan-shelf',[discover([],['unknown-supply'])]));let w=await s.advance();assert.equal(rolls,0);assert.deepEqual(w.supplies[0].knownTo,[]);assert.ok(Object.keys(w.probeResults).some(key=>key.includes('resource-probe.v2')&&key.includes('scan-shelf')));
  s.choose({...proposal,content:'同義地再看一次'});w=await s.advance();assert.equal(rolls,0);assert.deepEqual(w.supplies[0].knownTo,[]);
  s.reply(confirmed('inspect-supply-positions',[discover([],['unknown-supply'])]));w=await s.advance();assert.equal(rolls,1);assert.deepEqual(w.supplies[0].knownTo,['owner']);
 }finally{s.restore();}
});

test('a trusted routine operation and its confirmed alias share a method, while a different operation gains one shared new group die',async()=>{
 const f=require('./routine-world-programs-fixture.cjs');
 const s=await scenario({prepare:w=>{w.supplies[0].knownTo=['owner'];}});try{
  const program=(operation,content)=>f.program(operation,content,'確認材料',[f.binding('raw','supply','target',[],{kind:'fabric'})],[f.phase(15,[{kind:'discover',version:1,region:'$here',objectIds:[],supplyIds:['$raw']}])]);
  const a=program('scan-stock','查看材料來源');a.methods[0].aliases=[{content:'再看看材料來源',purpose:'確認材料'}];s.choose({...proposal,target:'unknown-supply',content:'查看材料來源',purpose:'確認材料'});s.reply(f.approval([a],'scan-stock'));let rolls=0;Math.random=()=>{rolls++;return .075;};await s.advance();assert.equal(rolls,1);
  Math.random=()=>{rolls++;return .975;};s.choose({...proposal,target:'unknown-supply',content:'再看看材料來源',purpose:'確認材料'});await s.advance();assert.equal(rolls,1);assert.equal(s.judgments().length,1);
  const b=program('inspect-stock','逐一檢查材料來源');s.choose({...proposal,target:'unknown-supply',content:'逐一檢查材料來源',purpose:'確認材料'});s.reply(f.approval([b],'inspect-stock'));await s.advance();assert.equal(rolls,2);assert.equal(s.judgments().length,2);
 }finally{s.restore();}
});
