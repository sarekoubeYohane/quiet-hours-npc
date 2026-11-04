export const entryRules = ['public', 'residents', 'workers', 'private'] as const;
export type EntryRule = typeof entryRules[number];
export const entryRuleLabels: Record<EntryRule, string> = {
  public: '公開', residents: '本場所住戶', workers: '本場所員工', private: '僅個別授權',
};

export type EntryGrant = { placeId: string; roomId?: string; characterTemplateId: string };
export type EffectiveEntryRule = { rule: EntryRule; allowedActorIds: string[]; roomOverride?:true };
export type EntryPreview = {
  placeId: string; roomId?: string; rule: EntryRule; inherited?: boolean;
  allowed: { characterTemplateId: string; name: string }[];
};

export const maxEntryGrants = 96;
