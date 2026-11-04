import type { CityDraft, CityPreview } from './city-draft';
import type { WorldConfiguration } from './world-configuration';
import type { Character, World } from './world';
import type { SceneTemplate } from './scene-templates';
import type { EffectiveEntryRule, EntryGrant, EntryPreview, EntryRule } from './entry-rules';

type Scope = { placeId: string; roomId?: string };

export function prepareCityAccess(
  draft: CityDraft, preview: CityPreview, configuration: WorldConfiguration, people: Character[], scenes: SceneTemplate[],
) {
  const grants = draft.accessGrants ?? [];
  const selectedTemplates = new Set(draft.characters.map(person => person.templateId));
  const seen = new Set<string>();
  for (const grant of grants) {
    const place = preview.places.find(candidate => candidate.id === grant.placeId);
    const key = JSON.stringify([grant.placeId, grant.roomId, grant.characterTemplateId]);
    if (!place || (grant.roomId && !place.rooms.some(room => room.id === grant.roomId)) ||
        !selectedTemplates.has(grant.characterTemplateId) || seen.has(key)) {
      preview.issues.push('請為個別授權指定本次人物及有效場所或房間，且不要重複。');
    }
    seen.add(key);
  }

  const access: Record<string, EffectiveEntryRule> = {};
  const visible: EntryPreview[] = [];
  for (const place of preview.places) {
    const locationId = 'place:' + place.id;
    const source = scenes.find(scene => scene.id === configuration.sceneSources?.[locationId]?.id);
    const building = source?.access?.building ?? 'public';

    function assignment(scope: Scope, key: string, rule: EntryRule, inherited = false) {
      const allowed = people.filter(actor => {
        if (rule === 'public') return true;
        if (rule === 'residents' && configuration.residences?.[actor.id] === locationId) return true;
        if (rule === 'workers' && configuration.workplaces?.[actor.id]?.includes(locationId)) return true;
        return grants.some((grant: EntryGrant) => grant.placeId === scope.placeId &&
          (grant.roomId === scope.roomId || (inherited && !grant.roomId)) &&
          grant.characterTemplateId === actor.profileSource?.id);
      });
      access[key] = { rule, allowedActorIds: allowed.map(actor => actor.id) };
      visible.push({
        ...scope, rule, ...(inherited ? { inherited: true } : {}),
        allowed: allowed.flatMap(actor => actor.profileSource
          ? [{ characterTemplateId: actor.profileSource.id, name: actor.name }] : []),
      });
    }

    assignment({ placeId: place.id }, locationId, building);
    for (const room of place.rooms) {
      const rules = source?.access?.rooms;
      const override = rules && Object.hasOwn(rules, room.id) ? rules[room.id] : undefined;
      assignment({ placeId: place.id, roomId: room.id }, locationId + ':room:' + room.id, override ?? building, !override);
    }
  }
  if (visible.length) {
    configuration.access = access;
    preview.access = visible;
  }
}

// Permission is authority-only. Movement, locks, and first-person visibility use
// the existing physical and perception rules independently.
export function entryPermission(world: World, actorId: string, locationId: string, regionId: string) {
  const rules = world.configuration?.access;
  const effective = rules?.[regionId] ?? rules?.[locationId];
  if (!effective) return undefined;
  return { regionId, allowed: effective.rule === 'public' || effective.allowedActorIds.includes(actorId) };
}
