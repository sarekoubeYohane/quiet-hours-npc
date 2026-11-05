import { feelingUpdatesSchema } from './mental-experiences';
import { pursuitUpdatesSchema } from './pursuits';
import { pursuitCandidatesSchema, pursuitSelectionSchema } from './pursuit-selection';
import { arrangementUpdatesSchema } from './arrangements';
import { preferenceUpdatesSchema } from './preferences';
import { adjudicationLimits } from './adjudication-limits';
import { cognitiveUpdatesSchema } from './cognition';
import { memorySelectionSchema, memorySelectionSchemaFor, memoryOperationSchema } from './memory';
import { clueKinds } from './attention';
import { activityDurations } from './activities';
import { habitCandidateSchema } from './habits';
export const npcContractVersion = 'npc-decision.v3';
export const actionTypes = ['phone','pause','resume','abandon','propose', 'continue', 'door', 'move', 'say', 'shout', 'persuade', 'message', 'rest', 'reflect', 'work', 'observe'];
export const methodChoices = ['new','retry','continue','wait','switch','drop'] as const;
export const methodChanges = ['none','source','target','preparation','operation','condition','not-applicable'] as const;
export const methodAssessmentSchema = { type:'object', properties:{
  purpose:{type:'string',maxLength:300},
  knownResults:{type:'array',maxItems:4,items:{type:'object',properties:{kind:{type:'string',enum:['short','long']},id:{type:'string',minLength:1,maxLength:128},version:{type:'integer',minimum:1}},required:['kind','id','version'],additionalProperties:false}},
  choice:{type:'string',enum:methodChoices}, method:{type:'string',maxLength:300},
  change:{type:'object',properties:{kind:{type:'string',enum:methodChanges},detail:{type:'string',maxLength:256}},required:['kind','detail'],additionalProperties:false},
  reason:{type:'string',maxLength:256},
  selectedAction:{type:'object',properties:{type:{type:'string',enum:actionTypes},target:{type:'string',maxLength:100}},required:['type','target'],additionalProperties:false},
  intentIds:{type:'array',maxItems:12,items:{type:'string',minLength:1,maxLength:64}},
},required:['purpose','knownResults','choice','method','change','reason','selectedAction','intentIds'],additionalProperties:false};

export const actionSchema = { type: 'object', properties: {
  feelingUpdates:feelingUpdatesSchema([]),
  contractVersion: { type: 'string', enum: [npcContractVersion] },
  methodAssessment:methodAssessmentSchema,
  reconfirmBodyConsequences:{type:'boolean'},
  purpose:{type:'string',maxLength:300},
  type: { type: 'string', enum: actionTypes }, target: { type: 'string', maxLength: 100 },
  content: { type: 'string', maxLength: 500 }, mood: { type: 'string', maxLength: 20 },
  durationMinutes: { type: 'integer', enum: activityDurations },
  timeIntent: {type:'object',properties:{kind:{type:'string',enum:['completion','open-ended']},maxMinutes:{type:['number','null'],exclusiveMinimum:0,maximum:adjudicationLimits.maxMinutes}},required:['kind','maxMinutes'],additionalProperties:false},
  attentionConditions: { type: 'array', maxItems: 12, items: { type: 'object', properties: { kind: { type: 'string', enum: clueKinds }, source: { type: 'string' }, region: { type: 'string' } }, required: ['kind','source','region'], additionalProperties: false } },
  pursuitContext:{type:'string'},
  focusIntentId:{type:['string','null'],maxLength:64},
  pursuitUpdates:pursuitUpdatesSchema,
  pursuitCandidates:pursuitCandidatesSchema,
  pursuitSelection:pursuitSelectionSchema,
  memorySelections: memorySelectionSchema,
  memoryOperations: memoryOperationSchema,
  arrangementUpdates: arrangementUpdatesSchema,
  preferenceUpdates: preferenceUpdatesSchema,
  habitCandidates:habitCandidateSchema,
  cognitiveUpdates: cognitiveUpdatesSchema, interpretation: { type: 'string', maxLength: 256 },
}, required: ['feelingUpdates', 'methodAssessment', 'reconfirmBodyConsequences', 'purpose', 'contractVersion', 'type', 'target', 'content', 'mood', 'durationMinutes', 'timeIntent', 'pursuitContext', 'focusIntentId', 'pursuitUpdates', 'pursuitCandidates', 'pursuitSelection', 'attentionConditions', 'memorySelections', 'cognitiveUpdates', 'interpretation', 'memoryOperations', 'preferenceUpdates', 'habitCandidates', 'arrangementUpdates'], additionalProperties: false };

export function decisionWireSchema(allowedTypes:string[], short:Parameters<typeof memorySelectionSchemaFor>[0], sources?:string[]) {
  const fields=Object.fromEntries(Object.entries(actionSchema.properties).filter(([key])=>!['type','target','content','purpose',...(sources===undefined?['feelingUpdates']:[])].includes(key)));
  const branch=(types:string[],proposal:boolean)=>({type:'object',properties:{
    type:{type:'string',enum:types},target:actionSchema.properties.target,
    content:{...actionSchema.properties.content,...(proposal?{minLength:1,pattern:'\\S'}:{})},
    purpose:{...actionSchema.properties.purpose,...(proposal?{minLength:1,pattern:'\\S'}:{})},
  },required:['type','target','content','purpose'],additionalProperties:false});
  return {type:'object',properties:{...fields,...(sources===undefined?{}:{feelingUpdates:feelingUpdatesSchema(sources)}),action:{anyOf:[branch(['propose'],true),branch(allowedTypes.filter(type=>type!=='propose'),false)]},memorySelections:memorySelectionSchemaFor(short)},required:[...actionSchema.required.filter(key=>!['type','target','content','purpose',...(sources===undefined?['feelingUpdates']:[])].includes(key)),'action'],additionalProperties:false};
}
