export type Intent={id:string;content:string;intensity:'low'|'medium'|'high';importance:'low'|'medium'|'high';urgency:'low'|'medium'|'high';context:string};
export type ActivityPlan={action:Action;startedAt:number;until:number;attention:string;modelKey:string};
export type AIUsage={windowStartedAt:number;calls:number;inputTokens:number;outputTokens:number;unknownCalls:number;totalCalls:number;totalInputTokens:number;totalOutputTokens:number;totalUnknownCalls:number;savedDecisions:number};
export type Habit={key:string;type:Action['type'];target:string;location:string;period:number;observedDays:number[];lastSeen:number};
export type OwnerControl={mode:'autonomous'|'taken-over';pending?:Action;active?:boolean};
export type Character={id:string;name:string;color:string;location:string;mood:string;personality:string;goal:string;activity:string;relationships:Record<string,string>;memories:{time:number;text:string}[];plan?:ActivityPlan;habits?:Habit[];intents?:Intent[];control?:OwnerControl};
export type WorldEvent={id:string;time:number;actor:string;text:string;kind:string;audience:string[];scene?:{from:string;to:string;target?:string;content?:string}};
export type World={minute:number;turn:number;characters:Character[];events:WorldEvent[];lastMode:string;aiUsage?:AIUsage};
export type Action={type:'move'|'say'|'message'|'rest'|'reflect'|'work'|'observe';target?:string;content?:string;mood?:string};
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
{id:'cass',intents:[],name:'Cass',color:'#eb9e79',location:'kris-home',mood:'疲憊',personality:'努力保持冷靜；害怕被留下，但也想保有自己的選擇。',goal:'先安頓自己，慢慢想清楚接下來的生活。',activity:'坐在客廳，捧著一杯溫水。',relationships:{vera:'在乎她，也需要幾天空間。',kris:'暫時借住；信任她務實的支持。'},memories:[{time:1260,text:'與 Vera 約好暫時分開幾天。Kris 讓我先住下，接下來由我自己決定。'}]},
{id:'vera',intents:[],name:'Vera',color:'#a2bdf0',location:'vera-home',mood:'不安',personality:'不善言詞，習慣以陪伴表達關心；正在練習不把所有責任攬在身上。',goal:'尊重 Cass 的空間，也試著做一件自己喜歡的事。',activity:'整理桌上的髮夾，偶爾看一眼手機。',relationships:{cass:'想關心她，但不想再越界。',kris:'知道她是 Cass 信任的人。'},memories:[{time:1260,text:'Cass 說需要幾天空間。我不知道她此刻在哪裡；我們可以用手機聯絡。'}]},
{id:'kris',intents:[],name:'Kris',color:'#d4c485',location:'kris-home',mood:'平靜',personality:'成熟、務實，不替別人決定人生；先處理吃飯與休息等眼前的事情。',goal:'提供安全的暫住空間，讓 Cass 自己思考。',activity:'在廚房收拾杯子。',relationships:{cass:'願意幫忙，但不替她做決定。',vera:'不代替兩人傳遞私密談話。'},memories:[{time:1260,text:'Cass 暫時借住。我可以幫她安頓，不必逼她今晚做出決定。'}]}
,cafeOwner(1260)],events:[{id:'opening',time:1260,actor:'world',text:'雨已經停了。Cass 暫住在 Kris 家；Vera 留在自己的房間。今晚還沒有新的聯絡。',kind:'opening',audience:['cass','kris']} ]};}
export function record(w:World,actor:string,text:string,kind:string,audience:string[],scene?:WorldEvent['scene']){w.events=[...w.events,{id:crypto.randomUUID(),time:w.minute,actor,text,kind,audience,...(scene?{scene}:{})}].slice(-300);if(kind!=='continue')for(const c of w.characters)if(audience.includes(c.id))c.memories=[...c.memories,{time:w.minute,text}].slice(-80);}
export function perception(w:World,c:Character){return {time:timeLabel(w.minute),day:Math.floor(w.minute/1440)+1,self:c,home:locations.find(l=>l.id===homeLocation(c)),pendingInterventions:pendingInterventions(w,c),places:locations,contacts:w.characters.map(x=>({id:x.id,name:x.name})),visiblePeople:w.characters.filter(x=>x.id!==c.id&&x.location===c.location).map(x=>({id:x.id,name:x.name}))};}
export function resolve(w:World,c:Character,a:Action){
if(!a||typeof a.type!=='string')throw Error('行動無效');const from=c.location;
const target=w.characters.find(x=>x.id===a.target),content=typeof a.content==='string'?a.content.trim().slice(0,500):'',witnesses=w.characters.filter(x=>x.location===c.location).map(x=>x.id);let text='',audience=[c.id];
if(a.type==='move'){const dest=locations.find(x=>x.id===a.target);if(!dest||dest.id===c.location)throw Error('目的地無效');audience=[...new Set([...witnesses,...w.characters.filter(x=>x.location===dest.id).map(x=>x.id)])];c.location=dest.id;c.activity=`剛走到${dest.name}。`;text=`${c.name} 步行前往${dest.name}，在這段時間結束時抵達。`;}
else if(a.type==='say'){if(!content)throw Error('說話內容不能為空');if(a.target==='observer'){audience=[c.id];c.activity='回覆了觀察者。';text=`${c.name} 回覆你：「${content}」`;}else{if(!target||target.id===c.id||target.location!==c.location)throw Error('只能向同地點的人說話');audience=witnesses;c.activity=`正在與 ${target.name} 說話。`;text=`${c.name} 對 ${target.name} 說：「${content}」`;}}
else if(a.type==='message'){if(!target||target.id===c.id||!content)throw Error('收訊人無效');audience=[c.id,target.id];c.activity=`傳了一則訊息給 ${target.name}。`;text=`${c.name} 傳訊息給 ${target.name}：「${content}」`;}
else if(a.type==='rest'){c.activity='安靜休息了一會兒。';text=`${c.name} 讓自己安靜休息了一會兒。`;audience=witnesses;}
else if(a.type==='work'){const tasks:Record<string,string>={tea:'泡了一壺茶，放在桌上。',tidy:'收拾桌面，整理眼前的小東西。',craft:'在紙上畫下一個簡單的髮飾樣式。'};if(!a.target||!tasks[a.target])throw Error('工作無效');c.activity=tasks[a.target];text=`${c.name} ${c.activity}`;audience=witnesses;}
else if(a.type==='reflect'){if(!content)throw Error('想法不能為空');c.activity='留了一點時間給自己。';text=`${c.name} 心想：「${content}」`;}
else if(a.type==='observe'){c.activity='留意周圍的動靜。';text=`${c.name} 留意周圍的動靜。`;}
else throw Error('未知行動');if(typeof a.mood==='string')c.mood=a.mood.slice(0,20);record(w,c.id,text,a.type,audience,{from,to:c.location,target:a.target,...(a.type==='say'?{content}:{})});
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
if(c.id==='vera'){const actions:Action[]=[{type:'reflect',content:'想知道她好不好。但現在，可以先把手機放下。',mood:'猶豫'},{type:'work',target:'craft',mood:'專注'},{type:'message',target:'cass',content:'不用急著回我。希望你今晚有吃點東西。',mood:'牽掛'},{type:'rest',mood:'稍微放鬆'},{type:'move',target:c.location==='cafe'?'vera-home':'cafe',mood:'平靜'},{type:'observe'},{type:'work',target:'craft'},{type:'reflect',content:'就算沒有人需要我，也可以做一件自己想做的事。',mood:'平靜'}];return actions[p];}
const other=w.characters.find(x=>x.id!==c.id&&x.location===c.location);
if(c.id==='cass'){if(p===0&&other)return {type:'say',target:other.id,content:'……我不知道還能怎麼做。',mood:'茫然'};if(p===3&&recent.includes('訊息'))return {type:'message',target:'vera',content:'有吃東西。謝謝你，我還想再想一想。',mood:'疲憊'};if(p===4)return {type:'move',target:c.location==='cafe'?'kris-home':'cafe',mood:'想透透氣'};return p%2?{type:'reflect',content:'不用今晚就決定全部。先想一件我自己想做的事。',mood:'思考中'}:{type:'rest',mood:'疲憊'};}
if(other&&p%3===0)return {type:'say',target:other.id,content:'這是你自己的事，要自己想。先休息；需要實際幫忙再叫我。',mood:'平靜'};if(p===5)return {type:'move',target:c.location==='cafe'?'kris-home':'cafe'};return {type:'work',target:p%2?'tidy':'tea',mood:'平靜'};
}
