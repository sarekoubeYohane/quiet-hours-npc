import type { RoutineOperation } from './routine-rules';

export const adjudicationLimits = {
 statuses: ['accepted','denied','unsupported'],
 difficulties: [8,12,16],
 outcomes: ['critical-success','success','mixed','failure','critical-failure'],
 phaseMinutes: Array.from({length:96},(_,index)=>(index+1)*15),
 maxMinutes: 1440,
 minuteStep: 15,
 maxEffects: 4,
 maxProgramSteps: 8,
 maxStages: 4,
 maxBranches: 5,
 maxConditions: 4,
 maxStateEntries: 8,
 maxCandidateLength: 8192,
 maxReferenceLength: 120,
 maxValueLength: 100,
} as const;
export const routineOperations:RoutineOperation[]=['tea','coffee','food','drink','wash','return'];

export const effectKinds={form:'form',separate:'separate',materialize:'materialize',consume:'consume',destroy:'destroy',transfer:'transfer',state:'state',grant:'grant',consent:'consent',scheduleNatural:'schedule-natural',changeState:'change-state',displaceBody:'displace-body',physical:'physical'} as const;

export const physicalEffectLimits = {version:1,objectOperations:['take','place','consume','destroy'],maxHistory:16,maxReasonLength:300} as const;

// These limits describe inert external state data, never arbitrary world paths.
export const stateChangeLimits = {
 version: 1,
 accesses: ['authorized','physical'],
 targets: ['object'],
 exposures:['public','hidden'],
 maxChanges: 4,
 maxEntries: 16,
 maxKeyLength: 60,
 maxValueLength: 100,
 maxStateBytes: 4096,
 maxReasonLength: 300,
 maxKindLength: 60,
} as const;

export const externalStateLimits={targets:['environment','body'],access:'physical',exposures:['public','subject','hidden'],environmentExposures:['public','hidden']} as const;

export const naturalChangeLimits={version:1,minDelay:15,maxDelay:1440,minuteStep:15,maxConditions:4,maxEffects:4,maxPending:32,maxSettled:64} as const;
