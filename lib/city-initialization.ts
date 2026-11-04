import { z } from 'zod';
import { assertBoundedState } from './adjudication-contract';
import { stateChangeLimits } from './adjudication-limits';
import { cityLimits, type CityDraft, type CityFinalization, type CityPreview, type CitySpace, type FinalizedRoom } from './city-draft';
import { cityWalkSchema, finalConnectionSchema, pairKey, spaceNameKey } from './city-finalization';
import type { ModelMessage } from './model-adapter';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const label = z.string().trim().min(1).max(80);
const stateRows = z.array(z.object({
  key:z.string().min(1).max(stateChangeLimits.maxKeyLength), value:z.string().min(1).max(stateChangeLimits.maxValueLength),
}).strict()).max(stateChangeLimits.maxEntries);
const proposedObject = z.object({ placeId:id, roomId:id, name:label, state:stateRows }).strict();
const npcReply = z.object({
  rooms:z.array(z.object({ placeId:id,id,name:label,private:z.boolean() }).strict()).max(20),
  objects:z.array(proposedObject).max(80),
}).strict();
const heavenlyReply = z.object({
  spaces:z.array(z.object({
    placeId:id,
    rooms:z.array(z.object({id,name:label,privateFor:z.string().max(64)}).strict()).max(20),
    objects:z.array(z.object({id,roomId:id,name:label,state:stateRows}).strict()).max(80),
    connections:z.array(finalConnectionSchema).max(40),
  }).strict()).max(cityLimits.places),
  walks:z.array(cityWalkSchema).max(28),
}).strict();

const string = {type:'string'};
const object = (properties:Record<string,unknown>) => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const array = (items:unknown) => ({type:'array',items});
const stateShape = array(object({key:string,value:string}));
const npcShape = object({
  rooms:array(object({placeId:string,id:string,name:string,private:{type:'boolean'}})),
  objects:array(object({placeId:string,roomId:string,name:string,state:stateShape})),
});
const heavenlyShape = object({
  spaces:array(object({
    placeId:string,
    rooms:array(object({id:string,name:string,privateFor:string})),
    objects:array(object({id:string,roomId:string,name:string,state:stateShape})),
    connections:array(object({id:string,name:string,rooms:array(string),state:{type:'string',enum:['open','closed','blocked']}})),
  })),
  walks:array(object({places:array(string),minutes:{type:['integer','null']}})),
});

type Dispatch = (task:string,messages:ModelMessage[],schema:object)=>Promise<string>;
function parseState(entries: z.infer<typeof stateRows>) {
  const result = Object.fromEntries(entries.map(({key,value})=>[key,value]));
  if (Object.keys(result).length!==entries.length) throw Error('場所描述有重複狀態。');
  assertBoundedState(result);
  return result;
}

function readReply<T>(schema:z.ZodType<T>,raw:string):T {
  if (new TextEncoder().encode(raw).length>64000) throw Error('場所描述超出容量。');
  return schema.parse(JSON.parse(raw));
}

function personPlaces(draft:CityDraft,preview:CityPreview,actor:CityDraft['characters'][number]) {
  const familiar = new Set([actor.homeId,...(actor.ownedPlaceIds??[]),...(actor.workplaceIds??[])]);
  return preview.places.filter(place=>familiar.has(place.id)).map(place=>{
    const rooms = place.rooms.filter(room=>{
      const assigned = draft.characters.filter(person=>person.homeId===place.id&&person.homeRoomId===room.id);
      if ((room.privateFor&&room.privateFor!==actor.templateId) ||
          (assigned.length&&!assigned.some(person=>person.templateId===actor.templateId))) return false;
      const directlyKnown = room.privateFor===actor.templateId || assigned.length>0 ||
        (actor.placeId===place.id&&actor.roomId===room.id);
      const access = preview.access?.find(item=>item.placeId===place.id&&item.roomId===room.id);
      if (access) {
        if (access.rule==='private'&&!directlyKnown) return false;
        const roleAllowed = (access.rule==='residents'&&actor.homeId===place.id) ||
          (access.rule==='workers'&&actor.workplaceIds?.includes(place.id));
        const granted = draft.accessGrants?.some(grant=>grant.placeId===place.id&&
          grant.characterTemplateId===actor.templateId&&(grant.roomId===room.id||(!grant.roomId&&access.inherited)));
        if (access.rule!=='public'&&!roleAllowed&&!granted&&!access.allowed.some(person=>person.characterTemplateId===actor.templateId)) return false;
      }
      if (directlyKnown) return true;
      if (/臥室|卧室|私人|bedroom|private/i.test(room.name)) {
        return draft.characters.filter(person=>person.homeId===place.id).length===1 && actor.homeId===place.id &&
          preview.characters.find(person=>person.templateId===actor.templateId)?.bedroomId===room.id;
      }
      return true;
    });
    const visible = new Set(rooms.map(room=>room.id));
    return {
      id:place.id,name:place.name,canDescribePrivate:actor.homeId===place.id||!!actor.ownedPlaceIds?.includes(place.id),
      rooms:rooms.map(({id,name})=>({id,name})),
      objects:place.objects.filter(item=>!item.hidden&&visible.has(item.roomId)).map(({roomId,name,state})=>({roomId,name,state})),
    };
  });
}

export async function initializeCity(draft:CityDraft,preview:CityPreview,dispatch:Dispatch):Promise<CityDraft> {
  const finalized:CityFinalization = structuredClone(draft.finalization??{spaces:[],walks:[]});
  const places = new Map(preview.places.map(place=>[place.id,place]));
  const observations: {person:string;description:z.infer<typeof npcReply>}[] = [];
  const generatedObjectIds = new Set<string>();
  const generatedRooms = new Map<string,FinalizedRoom>();
  let nextId = 0;
  const newId = (prefix:string, exists:(id:string)=>boolean) => {
    let candidate:string;
    do {candidate=prefix+'-'+(++nextId);} while(exists(candidate));
    return candidate;
  };
  const extraFor = (placeId:string):CitySpace => {
    const previous = finalized.spaces.find(space=>space.placeId===placeId);
    if (previous) return previous;
    const space = {placeId,rooms:[],objects:[],connections:[]};
    finalized.spaces.push(space);
    return space;
  };
  const request = async (task:string,system:string,data:unknown,schema:object) => {
    const messages = [{role:'system',content:system},{role:'user',content:JSON.stringify(data)}];
    if (new TextEncoder().encode(JSON.stringify(messages)).length>88*1024) throw Error('場所初始化輸入超出容量。');
    return dispatch(task,messages,schema);
  };

  for (const [index,actor] of draft.characters.entries()) {
    const person = preview.characters.find(item=>item.templateId===actor.templateId);
    const scope = personPlaces(draft,preview,actor);
    if (!person||!scope.length) continue;
    const raw = await request('city-npc-'+index,
      '描述你自己居住、擁有或熟悉的已選場所。以房間和具體物件表示，只描述所提供的場所，或在其中新增合適的共用房間。私人房間只能是你自己的居所或所有場所。沿用現有房間 ID。新房間請提供暫用 ID，物件以 roomId 對應，state 用 key/value 陣列；列出每件具體物品，不按重要性篩選。',
      {stage:'npc-city-description',person:{name:person.name,fields:person.fields},places:scope},npcShape);
    const candidate = readReply(npcReply,raw);
    const visible = new Map(scope.map(place=>[place.id,new Map(place.rooms.map(room=>[room.id,room.id]))]));
    const accepted: z.infer<typeof npcReply> = {rooms:[],objects:[]};

    for (const proposed of candidate.rooms) {
      const place = places.get(proposed.placeId);
      const view = scope.find(item=>item.id===proposed.placeId);
      const aliases = visible.get(proposed.placeId);
      if (!place||!view||!aliases || (proposed.private&&!view.canDescribePrivate) ||
          place.rooms.some(room=>room.id===proposed.id&&!aliases.has(proposed.id))) continue;
      if (aliases.has(proposed.id)) continue;
      const space = extraFor(place.id);
      const privateFor = proposed.private?actor.templateId:undefined;
      const ownRoom = privateFor && (actor.homeId===place.id && actor.homeRoomId
        ? place.rooms.find(room=>room.id===actor.homeRoomId)
        : space.rooms.find(room=>room.privateFor===privateFor));
      const sharedRoom = !privateFor && [...place.rooms,...space.rooms].find(room=>!room.privateFor &&
        spaceNameKey(room.name)===spaceNameKey(proposed.name) &&
        (!place.rooms.some(base=>base.id===room.id)||aliases.has(room.id)));
      const known = ownRoom||sharedRoom;
      if (known) {
        aliases.set(proposed.id,known.id);
        accepted.rooms.push({...proposed,id:known.id});
        continue;
      }
      if (space.rooms.length>=20) throw Error('新增房間超出容量。');
      const newRoom = {
        id:newId('init-room',id=>place.rooms.some(room=>room.id===id)||space.rooms.some(room=>room.id===id)),
        name:privateFor&&!proposed.name.includes(person.name)?(person.name+'的'+proposed.name).slice(0,80):proposed.name,
        ...(privateFor?{privateFor}:{}),
      };
      space.rooms.push(newRoom);
      generatedRooms.set(place.id+':'+newRoom.id,newRoom);
      aliases.set(proposed.id,newRoom.id);
      accepted.rooms.push({...proposed,id:newRoom.id});
    }

    for (const proposed of candidate.objects) {
      const place = places.get(proposed.placeId);
      const roomId = visible.get(proposed.placeId)?.get(proposed.roomId);
      if (!place||!roomId) continue;
      const state = parseState(proposed.state);
      const space = extraFor(place.id);
      const sameObject = (item:{roomId:string;name:string}) => item.roomId===roomId && spaceNameKey(item.name)===spaceNameKey(proposed.name);
      accepted.objects.push({...proposed,roomId});
      if (place.objects.some(sameObject)||space.objects.some(sameObject)) continue;
      if (space.objects.length>=80) throw Error('新增物件超出容量。');
      const id = newId('init-object',id=>place.objects.some(item=>item.id===id)||space.objects.some(item=>item.id===id));
      space.objects.push({id,roomId,name:proposed.name,state});
      generatedObjectIds.add(place.id+':'+id);
    }
    observations.push({person:person.name,description:accepted});
  }

  const raw = await request('city-heavenly-will',
    '整合這次城市的生活細節。明示與範本優先，不覆寫現有房間、門、道路與物件，也不能加入未選場所。generated 已列出所有有效物件。對同一生成物件的不同狀態，沿用其 id、roomId、name 並選出相容狀態；不用列重複物品。補足必要房間門／通道及合理的城市步行時間，不需每個場所彼此直連。rooms 的 privateFor 若無則用空字串。房間與道路只用提供的 ID。禁止通行用 blocked 或 minutes=null。回傳 JSON {spaces,walks}。',
    {stage:'heavenly-city-finalization',places:preview.places,explicitWalks:preview.walks??[],generated:finalized,observations},heavenlyShape);
  const candidate = readReply(heavenlyReply,raw);
  for (const update of candidate.spaces) {
    const place = places.get(update.placeId);
    if (!place) continue;
    const space = extraFor(place.id);
    for (const room of update.rooms) {
      const generated = generatedRooms.get(place.id+':'+room.id);
      if (generated && (generated.privateFor??'')===room.privateFor &&
          ![...place.rooms,...space.rooms].some(item=>item.id!==room.id&&spaceNameKey(item.name)===spaceNameKey(room.name))) generated.name=room.name;
    }
    for (const object of update.objects) {
      const known = space.objects.find(item=>item.id===object.id&&item.roomId===object.roomId&&item.name===object.name);
      if (known&&generatedObjectIds.has(place.id+':'+object.id)) known.state=parseState(object.state);
    }
    const roomIds = new Set([...place.rooms,...space.rooms].map(room=>room.id));
    for (const connection of update.connections) {
      const [a,b] = connection.rooms;
      if (a===b||!roomIds.has(a)||!roomIds.has(b)||
          [...place.connections,...space.connections].some(item=>item.id===connection.id||pairKey(item.rooms)===pairKey(connection.rooms))) continue;
      if (space.connections.length>=40) throw Error('新增連接超出容量。');
      const privateRoom = [...place.rooms,...space.rooms].some(room=>room.privateFor&&connection.rooms.includes(room.id)) ||
        draft.characters.some(actor=>actor.homeId===place.id&&actor.homeRoomId&&connection.rooms.includes(actor.homeRoomId));
      space.connections.push(privateRoom&&connection.state==='open'?{...connection,state:'closed'}:connection);
    }
  }
  for (const walk of candidate.walks) {
    if (walk.places[0]===walk.places[1]||!walk.places.every(id=>places.has(id))||
        finalized.walks.some(item=>pairKey(item.places)===pairKey(walk.places))) continue;
    finalized.walks.push(walk);
  }
  return {...draft,finalization:finalized};
}
