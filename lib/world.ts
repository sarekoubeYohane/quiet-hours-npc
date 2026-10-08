import { judgeD20, rollD20, type Resolution, type Advantage, type Difficulty } from './d20';

export type Intent={id:string;content:string;intensity:'low'|'medium'|'high';importance:'low'|'medium'|'high';urgency:'low'|'medium'|'high';context:string};
export type ActivityPlan={action:Action;startedAt:number;until:number;attention:string;modelKey:string};
export type AIUsage={windowStartedAt:number;calls:number;inputTokens:number;outputTokens:number;unknownCalls:number;totalCalls:number;totalInputTokens:number;totalOutputTokens:number;totalUnknownCalls:number;savedDecisions:number};
export type Habit={key:string;type:Action['type'];target:string;location:string;period:number;observedDays:number[];lastSeen:number};
export type CraftProject={resultId:string;theme:string;dc:Difficulty;status:'finished-with-variation'|'finished'|'draft'|'unfinished'|'spoiled';target?:string;method?:'initial'|'researched'};
export type NPCMemory={id?:string;time:number;text:string;kind?:'observation'|'inference'|'hearsay';source?:string;correctedBy?:string};
export type OwnerControl={mode:'autonomous'|'taken-over';pending?:Action;active?:boolean;experiences?:{time:number;text:string}[]};
export type Character={id:string;name:string;color:string;location:string;mood:string;personality:string;goal:string;activity:string;relationships:Record<string,string>;memories:NPCMemory[];abilityTags?:string[];projects?:CraftProject[];craftInsights?:string[];plan?:ActivityPlan;habits?:Habit[];intents?:Intent[];control?:OwnerControl};
export type WorldEvent={id:string;time:number;actor:string;text:string;kind:string;audience:string[];scene?:{from:string;to:string;target?:string;content?:string};resolution?:Resolution};
export type WorldClue={id:string;sourceEventId:string;location:string;text:string;visibility:'obvious'|'subtle';noticedBy:string[];attempts?:Record<string,string[]>;misleading?:string};
export type World={minute:number;turn:number;characters:Character[];events:WorldEvent[];clues?:WorldClue[];lastMode:string;aiUsage?:AIUsage};
export type Action={type:'move'|'say'|'persuade'|'message'|'rest'|'reflect'|'work'|'observe'|'reconsider';target?:string;content?:string;mood?:string};
export const locations=[{id:'kris-home',name:'Kris 的住處',note:'一盞沒關的燈，一壺剛泡好的茶。'},{id:'vera-home',name:'Vera 的房間',note:'布料、髮飾，與安靜的手機。'},{id:'cafe',name:'街角咖啡館',note:'熟悉的角落。坐下，也可能遇見人。'}];
export function homeLocation(c:Character){return c.id==='owner'?'cafe':c.id==='vera'?'vera-home':'kris-home';}
export function pendingInterventions(w:World,c:Character){
// A character's next action consumes the requests they received before it.
// Event order, rather than time, distinguishes requests made in the same turn.
let lastAction=-1;for(let i=0;i<w.events.length;i++)if(w.events[i].actor===c.id)lastAction=i;
return w.events.slice(lastAction+1).filter(e=>e.actor==='observer'&&e.kind==='intervention'&&e.audience.includes(c.id)).map(({id,time,text})=>({id,time,text}));
}
export const timeLabel=(m:number)=>`${String(Math.floor((m%1440)/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
export function cafeOwner(minute:number):Character{return {id:'owner',name:'店主',color:'#a5c9b3',location:'cafe',mood:'平靜',personality:'務實而溫和，喜歡把咖啡館打理舒適；尊重客人的空間，也會留意需要幫忙的人。',goal:'整理咖啡館，照顧自己的生活與來訪的客人。',activity:'在吧台整理杯子。',relationships:{},memories:[{time:minute,text:'我是街角咖啡館的店主。這是獨立的測試角色，不屬於小說正史。'}],intents:[],control:{mode:'autonomous'}};}
export function normalizeWorld(w:World){for(const c of w.characters)c.intents??=[];if(!w.characters.some(c=>c.id==='owner'))w.characters.push(cafeOwner(w.minute));const owner=w.characters.find(c=>c.id==='owner')!;owner.control??={mode:'autonomous'};return w;}
export function seedWorld():World{return {minute:1260,turn:0,lastMode:'demo',characters:[
{id:'cass',intents:[],name:'Cass',color:'#eb9e79',location:'kris-home',mood:'疲憊',personality:'努力保持冷靜；害怕被留下，但也想保有自己的選擇。',abilityTags:['不擅長髮飾設計'],goal:'先安頓自己，慢慢想清楚接下來的生活。',activity:'坐在客廳，捧著一杯溫水。',relationships:{vera:'在乎她，也需要幾天空間。',kris:'暫時借住；信任她務實的支持。'},memories:[{time:1260,text:'與 Vera 約好暫時分開幾天。Kris 讓我先住下，接下來由我自己決定。'}]},
{id:'vera',intents:[],name:'Vera',color:'#a2bdf0',location:'vera-home',mood:'不安',personality:'不善言詞，習慣以陪伴表達關心；正在練習不把所有責任攬在身上。',abilityTags:['擅長髮飾設計'],goal:'尊重 Cass 的空間，也試著做一件自己喜歡的事。',activity:'整理桌上的髮夾，偶爾看一眼手機。',relationships:{cass:'想關心她，但不想再越界。',kris:'知道她是 Cass 信任的人。'},memories:[{time:1260,text:'Cass 說需要幾天空間。我不知道她此刻在哪裡；我們可以用手機聯絡。'}]},
{id:'kris',intents:[],name:'Kris',color:'#d4c485',location:'kris-home',mood:'平靜',personality:'成熟、務實，不替別人決定人生；先處理吃飯與休息等眼前的事情。',goal:'提供安全的暫住空間，讓 Cass 自己思考。',activity:'在廚房收拾杯子。',relationships:{cass:'願意幫忙，但不替她做決定。',vera:'不代替兩人傳遞私密談話。'},memories:[{time:1260,text:'Cass 暫時借住。我可以幫她安頓，不必逼她今晚做出決定。'}]}
,cafeOwner(1260)],events:[{id:'opening',time:1260,actor:'world',text:'雨已經停了。Cass 暫住在 Kris 家；Vera 留在自己的房間。今晚還沒有新的聯絡。',kind:'opening',audience:['cass','kris']} ]};}
export function record(w:World,actor:string,text:string,kind:string,audience:string[],scene?:WorldEvent['scene'],resolution?:Resolution,sourceOverride?:string){
const id=crypto.randomUUID();
w.events=[...w.events,{id,time:w.minute,actor,text,kind,audience,...(scene?{scene}:{}),...(resolution?{resolution}:{})}].slice(-300);
if(kind==='continue')return;
const memoryKind:NPCMemory['kind']=['reflect','belief','belief-correction'].includes(kind)?'inference':['say','message','intervention'].includes(kind)?'hearsay':'observation';
const source=sourceOverride||(memoryKind==='hearsay'||memoryKind==='inference'?actor:id);
for(const c of w.characters)if(audience.includes(c.id)){
 const memory:NPCMemory={id,time:w.minute,text,kind:memoryKind,source};
 c.memories=[...c.memories,memory].slice(-80);
 if(c.control&&(c.control.mode==='taken-over'||c.control.experiences!==undefined))c.control.experiences=[...(c.control.experiences||[]),memory].slice(-80);
}
}
function noticeSubtleClues(w:World,c:Character){
 for(const clue of w.clues||[]){
  if(clue.visibility!=='subtle'||clue.location!==c.location||clue.noticedBy.includes(c.id))continue;
  clue.attempts??={};
  clue.attempts[c.id]??=[];
  const method='active-observation';
  if(clue.attempts[c.id].includes(method))continue;
  clue.attempts[c.id].push(method);
  const tags=c.abilityTags||[];
  const advantage:Advantage=tags.includes('非常善於觀察')?4:tags.includes('不擅長觀察')?-2:2;
  const resolution=judgeD20(rollD20(),advantage,16);
  const noticed=resolution.outcome==='success'||resolution.outcome==='critical-success';
  if(noticed)clue.noticedBy.push(c.id);
  const message=noticed?'仔細看見：'+clue.text:
    resolution.outcome==='mixed'?'察覺附近有些異樣，但還沒有看清細節。':
    '觀察了一會兒，還是沒有找到那個不明顯的線索。';
  record(w,'world',message,'perception',[c.id],undefined,resolution,clue.id);
  if(resolution.outcome==='critical-failure'&&clue.misleading){
    // This is an individual's interpretation of real evidence, not an objective event.
    record(w,'world','我看到的線索讓我以為：'+clue.misleading,'belief',[c.id],undefined,undefined,clue.id);
  }
 }
}
function revealObviousClues(w:World,c:Character){
 for(const clue of w.clues||[]){
  if(clue.visibility!=='obvious'||clue.location!==c.location||clue.noticedBy.includes(c.id))continue;
  clue.noticedBy.push(c.id);
  record(w,'world','現場可以看見：'+clue.text,'clue',[c.id],undefined,undefined,clue.id);
 }
}
export function perception(w:World,c:Character){return {time:timeLabel(w.minute),day:Math.floor(w.minute/1440)+1,self:{...c,projects:undefined},home:locations.find(l=>l.id===homeLocation(c)),pendingInterventions:pendingInterventions(w,c),places:locations,contacts:w.characters.map(x=>({id:x.id,name:x.name})),visiblePeople:w.characters.filter(x=>x.id!==c.id&&x.location===c.location).map(x=>({id:x.id,name:x.name}))};}
function craftAdvantage(c:Character):Advantage {
const tags=c.abilityTags||[];
if(tags.includes('完全不懂髮飾設計'))return -4;
if(tags.includes('不擅長髮飾設計'))return -2;
if(tags.includes('精通髮飾設計'))return 4;
if(tags.includes('擅長髮飾設計'))return 2;
return 0;
}
function socialAdvantage(c:Character):Advantage {
const tags=c.abilityTags||[];
if(tags.includes('極不擅長說服'))return -4;
if(tags.includes('不擅長說服'))return -2;
if(tags.includes('非常擅長說服'))return 4;
if(tags.includes('擅長說服'))return 2;
return 0;
}
export function resolve(w:World,c:Character,a:Action,options:{dryRun?:boolean}={}){
if(!a||typeof a.type!=='string')throw Error('行動無效');const from=c.location;
const target=w.characters.find(x=>x.id===a.target),content=typeof a.content==='string'?a.content.trim().slice(0,500):'',witnesses=w.characters.filter(x=>x.location===c.location).map(x=>x.id);let text='',audience=[c.id],resolution:Resolution|undefined,project:Omit<CraftProject,'resultId'>|undefined;
if(a.type==='move'){const dest=locations.find(x=>x.id===a.target);if(!dest||dest.id===c.location)throw Error('目的地無效');audience=[...new Set([...witnesses,...w.characters.filter(x=>x.location===dest.id).map(x=>x.id)])];c.location=dest.id;c.activity=`剛走到${dest.name}。`;text=`${c.name} 步行前往${dest.name}，在這段時間結束時抵達。`;}
else if(a.type==='say'){if(!content)throw Error('說話內容不能為空');if(a.target==='observer'){audience=[c.id];c.activity='回覆了觀察者。';text=`${c.name} 回覆你：「${content}」`;}else{if(!target||target.id===c.id||target.location!==c.location)throw Error('只能向同地點的人說話');audience=witnesses;c.activity=`正在與 ${target.name} 說話。`;text=`${c.name} 對 ${target.name} 說：「${content}」`;}}
else if(a.type==='persuade'){
if(!target||target.id===c.id||target.location!==c.location||!content)throw Error('只能向同地點的角色提出說服請求');
if(options.dryRun)return;
const relationship=target.relationships[c.id]||'';
const dc:Difficulty=/(不願|不想|拒絕|不信任)/.test(relationship)?16:/(信任|願意幫忙|樂意)/.test(relationship)?8:12;
resolution=judgeD20(rollD20(),socialAdvantage(c),dc);
const effects:Record<Resolution['outcome'],string>={
'critical-success':'表達得非常清楚，對方認真聽完，但仍由對方自行決定。',
success:'把自己的理由清楚表達出來，等待對方的想法。',
mixed:'說出了想法，但還需要補充理由或回答疑慮。',
failure:'沒能把理由說得有說服力，對方未作出承諾。',
'critical-failure':'用詞讓場面有些尷尬，對方仍然有權拒絕。'
};
c.activity='向 '+target.name+' 提出請求。';
text=c.name+' 對 '+target.name+' 說：「'+content+'」'+effects[resolution.outcome];
audience=witnesses;
}
else if(a.type==='message'){if(!target||target.id===c.id||!content)throw Error('收訊人無效');audience=[c.id,target.id];c.activity=`傳了一則訊息給 ${target.name}。`;text=`${c.name} 傳訊息給 ${target.name}：「${content}」`;}
else if(a.type==='rest'){c.activity='安靜休息了一會兒。';text=`${c.name} 讓自己安靜休息了一會兒。`;audience=witnesses;}
else if(a.type==='work'){
const tasks:Record<string,string>={tea:'泡了一壺茶，放在桌上。',tidy:'收拾桌面，整理眼前的小東西。',craft:'在紙上畫下一個簡單的髮飾樣式。','craft-challenge':'嘗試構思一份較困難的髮飾設計。','craft-easy-challenge':'嘗試設計一個簡單的髮飾變化。','craft-expert-challenge':'嘗試設計非常複雜的髮飾樣式。','study-craft':'研究現場能接觸到的髮飾與布料參考。'};
if(!a.target||!tasks[a.target])throw Error('工作無效');
const challenges:Record<string,Difficulty>={'craft-easy-challenge':8,'craft-challenge':12,'craft-expert-challenge':16};
if(a.target==='study-craft'){
  if(c.location!=='vera-home')throw Error('只有在有髮飾與布料的房間才能研究這些參考');
  if(options.dryRun)return;
  c.craftInsights??=[];
  if(!c.craftInsights.includes('髮飾參考'))c.craftInsights.push('髮飾參考');
  c.activity='研究了現場的布料與髮飾，找到可以參考的細節。';
  text=c.name+' '+c.activity;
}else if(a.target in challenges){
  // A direct-control preflight validates the request without spending a die.
  if(options.dryRun)return;
  const theme=['星月','花朵','緞帶','幾何','蕾絲'].find(word=>content.includes(word))||'自由設計';
  const method:'initial'|'researched'=c.craftInsights?.includes('髮飾參考')?'researched':'initial';
  const prior=c.projects?.find(item=>item.target===a.target&&item.theme===theme&&item.method===method);
  if(prior){
    c.activity='繼續思考同一份髮飾設計，但方法與條件沒變，暫時沒有新進展。';
    text=c.name+' '+c.activity;
    record(w,c.id,text,'continue',[c.id],{from,to:c.location,target:a.target});
    return;
  }
  resolution=judgeD20(rollD20(),craftAdvantage(c),challenges[a.target]);
  const consequences:Record<Resolution['outcome'],string>={
    'critical-success':'完成精緻的髮飾草圖，還想出一種額外配色。',
    success:'完成一幅讓自己滿意的髮飾設計草圖。',
    mixed:'畫出髮飾的初稿，但仍有幾個細節需要修改。',
    failure:'沒能完成想要的髮飾設計，只留下零散的草稿。',
    'critical-failure':'沒畫出滿意的樣式，反而把幾張草稿塗得亂七八糟。'
  };
  // The model may suggest a drawing theme, not arbitrary world changes.
  const statuses:Record<Resolution['outcome'],CraftProject['status']>={
    'critical-success':'finished-with-variation',success:'finished',mixed:'draft',failure:'unfinished','critical-failure':'spoiled'
  };
  project={theme,dc:resolution.dc,status:statuses[resolution.outcome],target:a.target,method};
  c.activity=consequences[resolution.outcome]+'（主題：'+theme+'）';
  text=c.name+' '+c.activity;
}else{c.activity=tasks[a.target];text=c.name+' '+c.activity;}
audience=witnesses;
}
else if(a.type==='reflect'){if(!content)throw Error('想法不能為空');c.activity='留了一點時間給自己。';text=`${c.name} 心想：「${content}」`;}
else if(a.type==='observe'){
if(a.target&&a.target!=='general-observe'&&a.target!=='inspect-paper')throw Error('觀察方法無效');
if(a.target==='inspect-paper'&&!w.clues?.some(clue=>clue.location===c.location&&clue.visibility==='subtle'))throw Error('現場沒有可翻查的草稿');
c.activity=a.target==='inspect-paper'?'仔細翻過現場的草稿。':'留意周圍的動靜。';
text=c.name+' '+c.activity;
}
else if(a.type==='reconsider'){
if(!content)throw Error('請說明修正後的看法');
const index=c.memories.findIndex(item=>item.id===a.target&&item.kind==='inference'&&!item.correctedBy);
if(index<0)throw Error('沒有可修正的個人推測');
const old=c.memories[index];
const evidence=c.memories.slice(index+1).findLast(item=>item.kind==='observation'&&item.source===old.source&&
  (item.text.includes('翻過紙張')||item.text.includes('仔細看見')));
if(!evidence?.id)throw Error('目前沒有足以重新檢視這段推測的新觀察');
if(options.dryRun)return;
old.correctedBy=evidence.id;
c.activity='重新檢視了自己先前的推測。';
record(w,c.id,c.name+' 改變了看法：「'+content+'」','belief-correction',[c.id],{from,to:c.location,target:a.target},undefined,evidence.id);
return;
}
else throw Error('未知行動');if(typeof a.mood==='string')c.mood=a.mood.slice(0,20);record(w,c.id,text,resolution?'attempt':a.type,audience,{from,to:c.location,target:a.target,...(['say','persuade'].includes(a.type)?{content}:{})},resolution);
if(a.type==='move')revealObviousClues(w,c);
if(a.type==='observe'&&!options.dryRun){
  if(a.target==='inspect-paper'){
    const clue=w.clues?.find(item=>item.location===c.location&&item.visibility==='subtle');
    if(clue&&!clue.noticedBy.includes(c.id)){
      clue.noticedBy.push(c.id);
      record(w,'world','翻過紙張後看見：'+clue.text,'perception',[c.id],undefined,undefined,clue.id);
    }
  }else noticeSubtleClues(w,c);
}
if(project){
  const resultId=w.events.at(-1)!.id;
  c.projects=[...(c.projects||[]),{...project,resultId}].slice(-12);
  if(project.status==='spoiled'){
    const clue:WorldClue={id:crypto.randomUUID(),sourceEventId:resultId,location:c.location,text:'桌面有散落的髮飾草稿和墨跡。',visibility:'obvious',noticedBy:[]};
    const subtle:WorldClue={id:crypto.randomUUID(),sourceEventId:resultId,location:c.location,text:'紙張背面有一道深色墨線。',visibility:'subtle',noticedBy:[],misleading:'紙張彷彿已經裂開一道口子。'};
    w.clues=[...(w.clues||[]),clue,subtle].slice(-40);
    for(const nearby of w.characters.filter(other=>other.location===c.location))revealObviousClues(w,nearby);
  }
}
}
export function demoDecision(w:World,c:Character):Action{
const recent=c.memories.slice(-2).map(m=>m.text).join(' '),p=w.turn%8;
const request=pendingInterventions(w,c).at(-1);
if(request){
const body=(request.text.match(/「([\s\S]*)」/)?.[1]||request.text.replace(/^共同事件：/,'')).trim();
const negated=/(不要|別|不用|不想|不能).{0,4}(回|去|到|走|休息|睡)/.test(body);
let destination:string|undefined;
if(!negated){
if(/回家|回房間|回住處|回自己的房間/.test(body))destination=homeLocation(c);
else if(/去|到|前往|回/.test(body)){
if(/咖啡館|咖啡店|cafe/i.test(body))destination='cafe';
else if(/Kris.*(家|住處)|kris-home/i.test(body))destination='kris-home';
else if(/Vera.*(家|房間)|vera-home/i.test(body))destination='vera-home';
}
if(destination)return destination===c.location?{type:'say',target:'observer',content:destination===homeLocation(c)?c.id==='cass'?'我已經在暫住的地方了，今晚先住這裡。':'我已經在家了。':`我已經在${locations.find(l=>l.id===destination)?.name}了。`,mood:'平靜'}:{type:'move',target:destination,mood:'準備動身'};
if(/^(請|你|可以|先|快|去|現在|幫我|麻煩你|\s)*(休息|睡覺|坐下)/.test(body))return {type:'rest',mood:'稍微放鬆'};
if(/泡.*茶/.test(body))return {type:'work',target:'tea',mood:'平靜'};
}
return {type:'say',target:'observer',content:negated?'知道了，我會先留在這裡。':c.id==='kris'?'我聽到了。你想讓我幫什麼具體的忙？':c.id==='vera'?'嗯，我有聽到。讓我想一想。':'我聽到了，先給我一點時間。',mood:'思考中'};
}
if(c.id==='vera'){const actions:Action[]=[{type:'reflect',content:'想知道她好不好。但現在，可以先把手機放下。',mood:'猶豫'},{type:'work',target:'craft',mood:'專注'},{type:'message',target:'cass',content:'不用急著回我。希望你今晚有吃點東西。',mood:'牽掛'},{type:'rest',mood:'稍微放鬆'},{type:'move',target:c.location==='cafe'?'vera-home':'cafe',mood:'平靜'},{type:'observe'},{type:'work',target:'craft-challenge'},{type:'reflect',content:'就算沒有人需要我，也可以做一件自己想做的事。',mood:'平靜'}];return actions[p];}
const other=w.characters.find(x=>x.id!==c.id&&x.location===c.location);
if(c.id==='cass'){if(p===0&&other)return {type:'say',target:other.id,content:'……我不知道還能怎麼做。',mood:'茫然'};if(p===3&&recent.includes('訊息'))return {type:'message',target:'vera',content:'有吃東西。謝謝你，我還想再想一想。',mood:'疲憊'};if(p===4)return {type:'move',target:c.location==='cafe'?'kris-home':'cafe',mood:'想透透氣'};return p%2?{type:'reflect',content:'不用今晚就決定全部。先想一件我自己想做的事。',mood:'思考中'}:{type:'rest',mood:'疲憊'};}
if(other&&p%3===0)return {type:'say',target:other.id,content:'這是你自己的事，要自己想。先休息；需要實際幫忙再叫我。',mood:'平靜'};if(p===5)return {type:'move',target:c.location==='cafe'?'kris-home':'cafe'};return {type:'work',target:p%2?'tidy':'tea',mood:'平靜'};
}
