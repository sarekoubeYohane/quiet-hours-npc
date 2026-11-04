import { z } from 'zod';
import { entryRules } from './entry-rules';
import { assertBoundedState } from './adjudication-contract';

const identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
const name = z.string().trim().min(1).max(80);
const objectState = z.custom<Record<string, string>>(value => {
  try {
    assertBoundedState(value);
    return true;
  } catch {
    return false;
  }
});

export const sceneTemplateDraft = z.object({
  name,
  note: z.string().max(600),
  access: z.object({ building: z.enum(entryRules), rooms: z.record(identifier, z.enum(entryRules)) }).strict().optional(),
  rooms: z.array(z.object({ id: identifier, name }).strict()).min(1).max(20),
  connections: z.array(z.object({
    id: identifier, name, rooms: z.tuple([identifier, identifier]),
  }).strict()).max(40),
  objects: z.array(z.object({ id: identifier, name, roomId: identifier, state: objectState }).strict()).max(80),
}).strict();

export type SceneTemplateDraft = z.infer<typeof sceneTemplateDraft>;
export type SceneTemplate = SceneTemplateDraft & {
  id: string;
  version: number;
  shared: boolean;
};

export const sceneTemplateSave = sceneTemplateDraft.extend({
  id: identifier.optional(),
  version: z.number().int().positive().safe().optional(),
}).superRefine(({ id, version, rooms, connections, objects, access }, context) => {
  const roomIds = new Set(rooms.map(room => room.id));
  const invalid =
    (id === undefined) !== (version === undefined) ||
    roomIds.size !== rooms.length ||
    new Set(objects.map(object => object.id)).size !== objects.length ||
    new Set(connections.map(connection => connection.id)).size !== connections.length ||
    new Set(connections.map(connection => [...connection.rooms].sort().join(':'))).size !== connections.length ||
    connections.some(({ rooms: [a, b] }) => a === b || !roomIds.has(a) || !roomIds.has(b)) ||
    objects.some(object => !roomIds.has(object.roomId)) ||
    Object.keys(access?.rooms ?? {}).some(roomId => !roomIds.has(roomId));

  if (invalid) context.addIssue({
    code: z.ZodIssueCode.custom,
    message: '請確認房間、連接及物件的所在房間。',
  });
});

export const sharedSceneTemplates: readonly SceneTemplate[] = [{
  id: 'default-residence',
  version: 1,
  shared: true,
  name: '住宅',
  note: '',
  rooms: [{ id: 'living-room', name: '客廳' }, { id: 'bedroom', name: '臥室' }],
  connections: [{ id: 'bedroom-door', name: '臥室門', rooms: ['living-room', 'bedroom'] }],
  objects: [
    { id: 'bed', name: '床', roomId: 'bedroom', state: {} },
    { id: 'table', name: '小桌', roomId: 'living-room', state: {} },
    { id: 'lamp', name: '台燈', roomId: 'living-room', state: { 電源: '關閉' } },
  ],
}];
