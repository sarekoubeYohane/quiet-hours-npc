import { z } from 'zod';
import { canSee } from './perception';
import { requestModel, type ModelService } from './model-adapter';
import { customRoutinePlaces, dailyRoomAccessible, placeRoles } from './daily-place-context';
import { worldRegions } from './world-configuration';
import type { SceneSupply } from './world-effects';
import type { World } from './world';

const identifier=z.string().min(1).max(120);
const explanation=z.string().trim().min(1).max(400);
const actors=z.array(identifier).min(1).max(12);
const provisionSchema=z.object({
  region:identifier,kind:z.enum(['water','food']),label:z.string().trim().min(1).max(80),
  portions:z.number().int().min(1).max(100),responsible:identifier,allowedTo:actors,reason:explanation,
}).strict();
const replySchema=z.object({
  supplies:z.array(provisionSchema).max(32),
  furnishingGrants:z.array(z.object({objectId:identifier,allowedTo:actors,reason:explanation}).strict()).max(32),
  unavailable:z.array(explanation).max(24),
}).strict();
export type OpeningResources={version:1;minute:number;supplies:{id:string;label:string;region:string;location:string;allowedTo:string[];responsible:string;reason:string}[];furnishingGrants:z.infer<typeof replySchema>['furnishingGrants'];unavailable:string[]};
const string={type:'string'};
const object=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const array=(items:unknown)=>({type:'array',items});
const responseSchema=object({
  supplies:array(object({region:string,kind:{type:'string',enum:['water','food']},label:string,portions:{type:'integer'},responsible:string,allowedTo:array(string),reason:string})),
  furnishingGrants:array(object({objectId:string,allowedTo:array(string),reason:string})),unavailable:array(string),
});

export function validateOpeningResourceRequest(world:World,request:unknown):asserts request is string {
  if(!world.configuration||world.acceptance||world.turn!==0)throw Error('日常物資只能在自訂世界第 0 回合準備。');
  if(world.openingResources)throw Error('開局物資已確認；既有存量不會重複補貨。');
  if(typeof request!=='string'||request.length>1600)throw Error('請以 1600 字以內描述開局物資需求。');
}

function resourceInput(world:World,request:string){
  return {contractVersion:'opening-resources.v1',request,
    places:world.configuration!.locations.map(place=>({...place,
      responsibleActors:world.characters.flatMap(actor=>{const roles=placeRoles(world,actor.id,place.id);return roles.length?[{id:actor.id,name:actor.name,roles}]:[];}),
      rooms:worldRegions(world).filter(room=>room.location===place.id).map(room=>({...room,
        accessibleTo:world.characters.filter(actor=>dailyRoomAccessible(world,actor.id,room.id)).map(actor=>actor.id),
        privateFor:world.configuration!.privateRooms?.[room.id]??null,
      })),
    })),
    actors:world.characters.map(actor=>({id:actor.id,name:actor.name,location:actor.location,region:actor.region})),
    // Include exhausted, hidden and finite facts for authority; this is not NPC input.
    supplies:world.supplies||[],objects:world.objects||[],
  };
}

function category(item:{kind:string;consumable?:boolean}):'water'|'food'|undefined {
  if(item.kind==='drink')return 'water';
  if(item.kind==='food')return 'food';
}

// Bind the complete validated authoring result before changing any world facts.
function bindResources(world:World,reply:z.infer<typeof replySchema>){
  const additions:SceneSupply[]=[],receipts:OpeningResources['supplies']=[],seen=new Set<string>();
  if((world.supplies?.length||0)+reply.supplies.length>128)throw Error('開局供應超出容量。');
  for(const item of reply.supplies){
    const room=worldRegions(world).find(room=>room.id===item.region);
    if(!room||item.allowedTo.some(id=>!dailyRoomAccessible(world,id,room.id)||!canSee(world,{...world.characters.find(actor=>actor.id===id)!,region:room.id,location:room.location},room.id)))throw Error('物資必須放在使用者可通行的房間。');
    if(item.responsible!=='world'&&!placeRoles(world,item.responsible,room.location).length)throw Error('物資負責者必須是場所住戶、工作者、主人，或明示的背景管理者。');
    const key=JSON.stringify([item.region,item.kind]);
    const existing=[...world.supplies||[],...world.objects||[]];
    if(seen.has(key)||existing.some(source=>category(source)===item.kind&&(source.region===item.region||source.finiteScope?.coverage==='location'&&worldRegions(world).find(region=>region.id===source.region)?.location===room.location)))throw Error('已有同類物資或明確有限來源，不能由開局準備替換或補回。');
    seen.add(key);
    const id='supply:'+crypto.randomUUID();
    additions.push({id,label:item.label,region:item.region,remaining:item.portions,owner:item.responsible,
      knownTo:[...new Set(item.allowedTo)],allowedTo:[...new Set(item.allowedTo)],
      kind:item.kind==='water'?'drink':'food',consumable:true,quantity:{amount:1,unit:'serving'},
      initialState:{ready:'yes',contents:item.kind==='water'?'drinking-water':'ready-to-eat',serving:'可直接取用及攝取，不需要另外的容器'},
      finiteScope:{version:1,coverage:'region',subject:item.kind==='water'?'飲水':'即食食物'},
    });
    receipts.push({id,label:item.label,region:item.region,location:room.location,allowedTo:[...new Set(item.allowedTo)],responsible:item.responsible,reason:item.reason});
  }
  const granted=new Set<string>();
  for(const grant of reply.furnishingGrants){
    const item=world.objects?.find(object=>object.id===grant.objectId),room=worldRegions(world).find(room=>room.id===item?.region);
    if(!item||!room||item.kind!=='furnishing'||item.owner!=='world'||item.holder!==null||item.lifecycle!=='active'||item.hiddenAtOpening||granted.has(item.id)||
      grant.allowedTo.some(id=>!dailyRoomAccessible(world,id,room.id)||!placeRoles(world,id,room.location).length))throw Error('只能確認有場所身分者對可通行、可見、無人持有之公共陳設的日常使用權。');
    granted.add(item.id);
  }
  return {additions,receipts};
}

export async function prepareOpeningResources(world:World,request:string,service:ModelService,options:Parameters<typeof requestModel>[3]):Promise<void>{
  validateOpeningResourceRequest(world,request);
  const input=resourceInput(world,request);
  if(new TextEncoder().encode(JSON.stringify(input)).length>96000)throw Error('開局物資依據超出容量，未進行裁定。');
  const raw=await requestModel(service,[{role:'system',content:
    '你是開局天上意志，確認自訂場所為維持日常生活與工作已備妥的普通物資。這是第 0 回合的世界設定，不是 NPC 行動。依場所用途、住戶、工作者、主人、房間通行權和既有事實判斷；不要推進時間、分配行動或修改身體。只可新增真實的有限即食食物與可直接飲用的水，每處每類至多一個來源、1–100 份，總共至多 32 來源。水必須可直接飲用，不需要找杯子；食物必須即食且可直接取用。label 要清楚說明。allowedTo 是主人明確允許自行取用且知道位置的人；進得了商店不等於有權拿商品。可以確認店主提供的免費試吃或工作餐，不可假定未支援的購買流程。responsible 用場所實際負責者 id；無在場 NPC 主人時可用 world，reason 必須具體說明背景負責者及允許理由。不可新增任何已經有同類物資的房間，不可繞過缺貨、有限來源、隱藏或私人限制。冰箱、飲水機、桌面等陳設名字並非已有食物水的證據。furnishingGrants 只能確認住戶、工作者或主人對 world 擁有、非隱藏、無人持有的既有 furnishings 的使用權，例如自己的床與休息椅，不改物件或房間。supplies 與 grants 可以為空；無法配置的需求必須在 unavailable 列明原因。只輸出契約 JSON。'},
    {role:'user',content:JSON.stringify(input)}],responseSchema,{...options,maxOutputTokens:6000});
  if(new TextEncoder().encode(raw).length>48000)throw Error('開局物資裁定超出容量。');
  const reply=replySchema.parse(JSON.parse(raw));
  const {additions,receipts}=bindResources(world,reply);
  world.supplies=[...world.supplies||[],...additions];
  for(const grant of reply.furnishingGrants){const item=world.objects!.find(object=>object.id===grant.objectId)!;item.allowedTo=[...new Set([...item.allowedTo,...grant.allowedTo])];item.knownTo=[...new Set([...item.knownTo,...grant.allowedTo])];}
  world.routinePlaces=[...(world.routinePlaces||[]).filter(place=>place.purpose!=='custom'),...customRoutinePlaces(world).filter(place=>!world.routinePlaces?.some(existing=>existing.location===place.location&&existing.purpose!=='custom'))];
  world.openingResources={version:1,minute:world.minute,supplies:receipts,furnishingGrants:reply.furnishingGrants,unavailable:reply.unavailable};
}
