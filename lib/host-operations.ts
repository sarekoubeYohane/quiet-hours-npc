import { suggestOpeningResources,mapResourceActors,prepareOpeningResources, validateOpeningResourceRequest } from './opening-resources';
import { readArrangement, storeArrangementResult } from './opening-arrangement-store';
import { arrangeOpening } from './opening-arrangement-model';
import type {OpeningDraft} from './opening-drafts';
import { playerAccount, setPlayerAccount } from './player-account-budget';
import { assessCharacterCard, characterFormationIssue } from './character-formation';
import { saveCardAssessment } from './character-card-store';
import { loadCharacterDraft } from './character-draft-store';
import { adoptFormalMentalEnergy, validateMentalAdoption } from './formal-mental-enablement';
import { enablePersonalNeeds, validateBodyNeedsSetup } from './body-needs-policy';
import { characterSetupSchema, formCharacterAttributes } from './character-attributes';
import { requestControlledFeelings } from './controlled-feelings';
import { readMentalEnergyTestPolicy } from './mental-energy';
import { CharacterTemplateValidationError, initialMemoryCapacityError } from './character-templates';
import { initializeCity } from './city-initialization';
import { requestModel, type ModelService } from './model-adapter';
import { readOpeningDescription, suggestOpeningRelationships } from './opening-relationship-generation';
import { cityDraftSchema, prepareCity } from './city-creation';
import { generateCharacterFields, readCharacterGeneration } from './character-generation';
import { confirmsBodyConsequences } from './needs';
import { traceActorSnapshot } from './decision-trace-capture';
import { cancelActivity } from './activity-lifecycle';
import { bindRoutine, selectRoutineForDecision, retainUnconfirmedBodyReview, routineOffer, routineCandidateSchema, resolveRoutineCandidate } from './routine-rules';
import { enterAcceptanceScene, exitAcceptanceScene } from './acceptance-scene';
import { requiresWorldEffects, authorityForProposal, EffectValidationError } from './world-effects';
import { requestAdjudication, buildAdjudicationInput, validateExistingAdjudication, captureAdjudicationFailure, type AdjudicationFailure } from './adjudication';
import { validPrice, beginCost } from './costs';
import { env } from 'cloudflare:workers';
import { recallMemories } from './recall';
import { reserveRecallDispatch, recallBudgetLimits, recallBudgetDatabase } from './recall-services';
import { record, resolve } from './world';
import { aiDecision } from './models';
import { accountUsage, advanceActivities, BudgetExceeded, currentUsage, validBudgetLimits, budgetReached } from './activities';
import { clearModelKey, saveModelKey, readModelKey, modelKeyStatus, modelKeyStorageAvailable } from './model-keys';
import { acceptOperation, respond, restoreWorld, runOperation, traceWorld, type OperationInput, type OperationChecks, type WorldChecks, type OperationHandler, type OperationOutcome, type OperationTable } from './host-runtime';

/**
 * 主持執行層受理的各項操作（#338）。每個操作是一個 handler：受理前的檢查分成數個
 * 時點（順序見 lib/host-runtime.ts 的 OperationHandler），取得租約後才執行 `run`。
 * 這裡只決定各操作自己的規則；防重送、租約、提交、回復與派送的接線都在主持執行層。
 */

/** 模型 Key：不進 journal，直接回應。 */
const modelKeyOperation = (): OperationHandler => ({
  accountWorkspace: true,
  async immediate({ b, accountId, id }) {
      if (!['ai', 'openai'].includes(b.mode || '')) return respond({ error: '請選擇要設定 Key 的模型服務。' }, 400);
      const provider = b.mode === 'openai' ? 'openai' : 'openrouter';
      if (b.operation === 'set-model-key') await saveModelKey(accountId, provider, b.key);
      else await clearModelKey(accountId, provider);
      return respond({operationScope:id,modelKeys:await modelKeyStatus(accountId),modelKeyStorageAvailable:modelKeyStorageAvailable()});
  },
});

/** 已退役的操作：一律回 409。 */
const retiredOperation = (largeBody: boolean) => (): OperationHandler => ({
  largeBody,
  loaded({ b }) { if (largeBody && !cityDraftSchema.safeParse(b.city).success) return respond({error:'請確認城市配置及場所、人物數量。'}, 400); },
  journaled() { return respond({error:'請從＋新開存檔建立世界；重新開始須讀原始開局並另建存檔，不會覆蓋原世界。',operationSettled:true},409); },
});

/** 城市預覽：不進 journal。 */
const previewCityOperation = (): OperationHandler => ({
  largeBody: true,
  async loaded({ b, accountId, world, version }) {
    const city = cityDraftSchema.safeParse(b.city);
    if (!city.success) return respond({error:'請確認城市配置及場所、人物數量。'}, 400);
      if (b.worldContext !== world.contextId || b.expectedVersion !== version) return respond({error:'原世界已變更，請重新讀取後再預覽。'}, 409);
      if (world.configuration || world.acceptance) return respond({error:'目前世界無法另建城市。'}, 400);
      const {preview} = await prepareCity(accountId, city.data, world);
      return respond({ preview, version });
  },
});

/** 推進世界時間。 */
const advanceOperation = (): OperationHandler => ({
  kind: 'advance',
  request({ b }) {
      if (![5, 15, 30].includes(b.minutes as number)) return respond({ error: '請選擇有效的世界推進時間。' }, 400);
  },
  journaled({ b, world }) {
    if(b.operation==='advance'&&(b.timeContract!==undefined&&b.timeContract!=='five-minute-v1'||b.minutes===5&&b.timeContract!=='five-minute-v1'||(world.timeContract==='five-minute-v1'||b.timeContract==='five-minute-v1')&&b.minutes!==5))return respond({error:'五分鐘時間契約每次只能推進 5 分鐘；請更新頁面後以五分鐘步驟推進。'},400);
    if(b.operation==='advance'&&world.characters.some(c=>c.mentalEnergy?.policy.kind==='formal')&&world.timeContract!=='five-minute-v1'&&b.timeContract!=='five-minute-v1')return respond({error:'正式精神電量需要明示採用五分鐘時間契約，舊十五／三十分鐘操作未執行。'},400);
  },
  accepted({ b, world }) {
    if(b.operation==='advance'&&(world.pursuitVersion!==1||typeof world.pursuitContext!=='string'))return respond({error:'此世界使用舊意圖契約，舊資料仍可讀取；請從新開存檔建立新世界，原存檔與用量保留。',worldResetRequired:true},409);
  },
  async run(ctx): Promise<OperationOutcome> {
    const { b, accountId, id, operationId, version, world, accountPlayer, services, trace, decisionTrace, workDeadline, verifyLease, workWait, modelSignal, dispatchModel } = ctx;
    let failure: Error | undefined;
    let adjudicationFailure: AdjudicationFailure | undefined;
    let adjudicationAttempt: { actorId:string; input:unknown; raw:string; secrets:string[]; stage:'parse'|'effects' } | undefined;
      const before = structuredClone(world);
      try {
        if(b.mode!=='demo'){const account=await playerAccount(accountId);if(budgetReached(account.usage,account.limits))throw new BudgetExceeded();}
        let dispatchKey = '';
        if(b.timeContract==='five-minute-v1')world.timeContract='five-minute-v1';
        await advanceActivities(world, {
          mentalEnergyPolicy:readMentalEnergyTestPolicy(env,world),
          onActor:(w,c)=>decisionTrace?.step('npc-feedback',c.id,{...traceActorSnapshot(c),shortTerm:c.shortTerm,memories:c.memories,observations:c.observations,control:c.control,minute:w.minute,turn:w.turn,resolutions:w.events.filter(event=>event.actor===c.id&&event.time===w.minute&&event.resolution).map(event=>({eventId:event.id,resolution:event.resolution})),routineAudit:w.routineAudit?.filter(item=>item.actorId===c.id&&item.turn===w.turn)}),
          minutes: b.minutes!, mode: b.mode!, modelKey: b.mode === 'demo' ? 'demo' : `${b.mode}:${b.model}`,
          limits:{calls:null,tokens:null},
          beforeDecision: async () => {
            const account=await playerAccount(accountId);if(budgetReached(account.usage,account.limits))throw new BudgetExceeded();
            await verifyLease();
            if (env.RECALL_ENABLED === 'true' && (await workWait(reserveRecallDispatch(recallBudgetDatabase(), accountId, 'chat', `${id}:${operationId}:chat:${world.aiUsage?.totalCalls || 0}`, 1, {ownerMonthly:0,accountMonthly:0}, 'player'))).replayed) throw Error('付費請求結果不明，禁止重送。');
            dispatchKey = await workWait(readModelKey(accountId, b.mode === 'openai' ? 'openai' : 'openrouter'));
            await verifyLease();
            traceWorld(trace, 'model-dispatch'); },
          evaluateControlledFeelings: async(w,c,prepared,onUsage)=>{
            const provider=b.mode==='openai'?'openai':'openrouter',model=b.model!.trim();
            const cost=beginCost(w.aiUsage!,provider,model,accountPlayer.prices.find(p=>p.provider===provider&&p.model===model),'feelings');
            traceWorld(trace,'controlled-feelings-dispatch');
            const dispatch=dispatchModel('feelings',w,c,provider,model,dispatchKey,{evidence:true,withinWorkDeadline:true});
            return requestControlledFeelings(c,w.minute,prepared,{key:dispatchKey,provider,model},{signal:modelSignal(),requestId:`${operationId}:${c.id}:feelings:${crypto.randomUUID()}`,observer:dispatch.observer,fetcher:dispatch.fetcher,beforeDispatch:dispatch.beforeDispatch,onSettled:dispatch.onSettled,onUsage:dispatch.reportUsage(onUsage,cost),verifyCurrent:verifyLease});
          },
          decide: async (w, c, onUsage) => {
            adjudicationAttempt = undefined;
            const provider=b.mode === 'openai' ? 'openai' : 'openrouter';
            const price=accountPlayer.prices.find(p=>p.provider===provider && p.model===b.model!.trim());
            let reportCost=beginCost(w.aiUsage!,provider,b.model!.trim(),price);
            let dispatch = 0;
            const guard = async (kind: 'chat' | 'embedding' | 'index' | 'search', units: number) => {
              await verifyLease();
              // Keep the same logical-round ledger captured by advanceActivities.
              // A rolling-hour boundary may reset only the next round, not this guard.
              if (kind === 'chat' && budgetReached((await playerAccount(accountId)).usage,(await playerAccount(accountId)).limits)) throw new BudgetExceeded();
              const reservationId = `${id}:${operationId}:${c.id}:${dispatch++}`;
              if ((kind!=='chat'||env.RECALL_ENABLED==='true') && (await workWait(reserveRecallDispatch(recallBudgetDatabase(), accountId, kind, reservationId, units, kind === 'chat' ? {ownerMonthly:0,accountMonthly:0} : recallBudgetLimits(kind), kind === 'chat' ? 'player' : 'owner'))).replayed) throw Error('付費請求結果不明，禁止重送。');
              await verifyLease();
              return reservationId;
            };
            const npcDispatch=dispatchModel('npc',w,c,provider,b.model!.trim(),dispatchKey,{evidence:true,withinWorkDeadline:true});
            const decision = await aiDecision(w, c, dispatchKey, b.model!.trim(), b.mode === 'openai' ? 'openai' : 'openrouter', npcDispatch.fetcher, npcDispatch.reportUsage(onUsage,tokens=>reportCost(tokens)), {
              beforeDispatch:npcDispatch.beforeDispatch,
              onSettled:npcDispatch.onSettled,
              observer: npcDispatch.observer,
              enabled: env.RECALL_ENABLED === 'true' && !w.acceptance,
              verifyCurrent: verifyLease,
              signal:modelSignal,
              beforeContinuation: async () => {
                await guard('chat', 1);
                traceWorld(trace, 'model-continuation-dispatch');
                const usage = w.aiUsage!;
                usage.calls++; usage.totalCalls++; usage.unknownCalls++; usage.totalUnknownCalls++;
                reportCost=beginCost(usage,provider,b.model!.trim(),price);
              },
              search: questions => workWait(recallMemories({owner:id, character:c, snapshot:before, version, questions, workDeadline:workDeadline, guard})),
            });
            decisionTrace?.step('npc-parsed',c.id,{action:decision.action,durationMinutes:decision.durationMinutes,timeIntent:decision.timeIntent,continueExisting:decision.continueExisting});
            if(decision.pursuitEvidence)decisionTrace?.step('npc-pursuit-selection',c.id,decision.pursuitEvidence,'model-self-report');
            if(decision.methodAssessment)decisionTrace?.step('npc-method-assessment',c.id,{methodAssessment:decision.methodAssessment,intents:decision.intents,action:decision.action},'model-self-report');
            if(decision.pursuitExits?.length)decisionTrace?.step('pursuit-exit-links',c.id,{currentIntentIds:decision.methodAssessment?.intentIds||[],exits:decision.pursuitExits,action:decision.action});
            if(requiresWorldEffects(decision.action)&&decision.timeIntent?.kind==='open-ended'&&!decision.continueExisting){
              decision.freeCandidate={status:'unsupported',effects:[],stages:[],check:null};
              return decision;
            }
            if(requiresWorldEffects(decision.action) && !decision.continueExisting){
              const selection=selectRoutineForDecision(w,c,decision.action,decision.durationMinutes,b.minutes!,decision.timeIntent?.maxMinutes,data=>decisionTrace?.step('rule-selection',c.id,data),decision.reconfirmBodyConsequences);
              const reused=selection.candidate;
              const priorRuleIds=new Set((w.routineRules||[]).map(rule=>rule.id));
              decisionTrace?.step('rule-selection',c.id,{branch:reused?'program-result':'adjudication-required',candidate:reused||null});
              if(reused){decision.freeCandidate=reused;}else{
              const config=w.adjudication!;
              await guard('chat',1);
              const key=await workWait(readModelKey(accountId,config.provider));
              await verifyLease();
              const usage=w.aiUsage!;usage.calls++;usage.totalCalls++;usage.unknownCalls++;usage.totalUnknownCalls++;
              const cost=beginCost(usage,config.provider,config.model,accountPlayer.prices.find(p=>p.provider===config.provider&&p.model===config.model),'adjudication');
              const input={...buildAdjudicationInput(w,c,decision.action,!!routineOffer(w,c,decision.action)),...authorityForProposal(w,c,decision.action),durationMinutes:decision.durationMinutes,timeIntent:decision.timeIntent,routineOffer:routineOffer(w,c,decision.action),...(selection.reconfirming?{bodyConsequencesReconfirmation:true}:{})};
              // Freeze the exact input before effects mutate objects or permissions.
              const inputSnapshot=JSON.stringify(input);
              const adjudicationDispatch=dispatchModel('adjudication',w,c,config.provider,config.model,key,{evidence:true,withinWorkDeadline:false});
              const raw=await requestAdjudication(input, {key,provider:config.provider,model:config.model}, routineCandidateSchema, {signal:modelSignal(),requestId:`${operationId}:${c.id}:adjudication:${crypto.randomUUID()}`,observer:adjudicationDispatch.observer,fetcher:adjudicationDispatch.fetcher,beforeDispatch:adjudicationDispatch.beforeDispatch,onSettled:adjudicationDispatch.onSettled,onUsage:adjudicationDispatch.reportUsage(onUsage,cost)});
              await verifyLease();
              adjudicationAttempt={actorId:c.id,input:inputSnapshot,raw,secrets:[key,dispatchKey],stage:'parse'};
              try{decision.freeCandidate=resolveRoutineCandidate(raw,w,c,decision.action,decision.durationMinutes,b.minutes,decision.timeIntent?.maxMinutes,data=>decisionTrace?.step('rule-selection',c.id,data),parsed=>{decisionTrace?.step('parsed-candidate',c.id,{candidate:parsed,explanationRecorded:!!parsed.explanation});if(parsed.explanation)decisionTrace?.step('adjudication-explanation',c.id,parsed.explanation,'model-self-report');});}
              catch(error){throw new EffectValidationError(error instanceof Error?error.message:'裁定候選格式無效。',{reason:'candidate_format'});}
              if(selection.reconfirming&&selection.signature&&decision.freeCandidate.status!=='accepted')retainUnconfirmedBodyReview(w,selection.signature);
              if(selection.reconfirming&&decision.freeCandidate.status==='accepted'&&(!confirmsBodyConsequences(decision.freeCandidate)||!(w.routineRules||[]).some(rule=>rule.version===3&&!priorRuleIds.has(rule.id))))throw new EffectValidationError('身體後果重新確認須保存含明示攝取或時間後果的新日常範圍。',{reason:'body_reconfirmation_scope'});
              decisionTrace?.step('bound-candidate',c.id,{candidate:decision.freeCandidate});
              adjudicationAttempt.stage='effects';
              }
            }
            if (typeof services?.adjudicateExistingAction === 'function' && !decision.continueExisting && !requiresWorldEffects(decision.action)) {
              const candidate = await workWait(services.adjudicateExistingAction(buildAdjudicationInput(w,c,decision.action)));
              await verifyLease();
              validateExistingAdjudication(candidate);
            }
            return decision;
          },
        });
      } catch (e) {
        if(e instanceof EffectValidationError && adjudicationAttempt){
          const attempt=adjudicationAttempt;
          adjudicationFailure=captureAdjudicationFailure({operationId,requestId:trace.requestId,contextId:world.contextId,actorId:attempt.actorId,stage:attempt.stage},attempt.input,attempt.raw,e.details,attempt.secrets);
        }
        decisionTrace?.step('round-failure',undefined,{name:e instanceof Error?e.name:'unknown',message:e instanceof Error?e.message:'unknown',validation:e instanceof EffectValidationError?e.details:undefined});
        // Roll back the incomplete round, but retain paid attempts and reported tokens.
        restoreWorld(world,before);
        failure = e instanceof Error ? e : new Error('模型決策失敗，本回合沒有推進。');
      }
    return { failure, adjudicationFailure };
  },
});

/** 需要派送模型的準備工作（第 0 回合備料、AI 整理開局、人物數值判讀、AI 補人物欄位，以及舊的城市導入）。 */
const setupOperation = (flags: Pick<OperationHandler, 'accountWorkspace' | 'largeBody' | 'privateEvidence'> = {}) => (): OperationHandler => {
  // 這次操作在各檢查時點之間保留的狀態。
  const state: {
    arrangingOpening: boolean; assessingCard: boolean; preparingResources: boolean; suggestingOpening: boolean; initializingCity: boolean;
    arrangement?: Awaited<ReturnType<typeof readArrangement>>; assessingDraft?: Awaited<ReturnType<typeof loadCharacterDraft>>;
    openingDescription?: ReturnType<typeof readOpeningDescription>; characterGeneration?: ReturnType<typeof readCharacterGeneration>;
    city?: ReturnType<typeof cityDraftSchema.safeParse>; openingPreview?: Awaited<ReturnType<typeof prepareCity>>['preview'];
  } = { arrangingOpening: false, assessingCard: false, preparingResources: false, suggestingOpening: false, initializingCity: false };
  return {
    kind: 'setup', ...flags,
    async request({ b, accountId, binding, id }) {
      const suggestingOpening = b.operation === 'suggest-opening-relationships';
      const initializingCity = b.operation === 'initialize-city';
      const arrangingOpening=b.operation==='arrange-opening';
      const arrangement=arrangingOpening&&typeof b.target==='string'&&typeof b.operationId==='string'?await readArrangement(accountId,b.target,b.operationId):undefined;
    if(arrangingOpening&&(!binding.accountWorkspace||!arrangement||arrangement.state!=='pending'))return respond({error:'請從原開局草稿恢復整理操作。'},409);
      const assessingCard = b.operation === 'assess-character-card';
      const assessingDraft = assessingCard && typeof b.target === 'string' ? await loadCharacterDraft(accountId,b.target) : undefined;
    if(assessingCard&&(!binding.accountWorkspace||!assessingDraft?.pendingFormation||assessingDraft.pendingFormation.operationId!==b.operationId||assessingDraft.formation||characterFormationIssue(assessingDraft)))return respond({error:'請從已確認文字的原建角草稿恢復形成。'},400);
      const generatingCharacter = b.operation === 'generate-character-template';
      const preparingResources=b.operation==='prepare-opening-resources';
    if (initializingCity && b.operationScope !== id) return respond({ error:'請重新讀取城市後再初始化。' },400);
      const openingDescription = suggestingOpening ? readOpeningDescription(b.openingDescription) : undefined;
    if (suggestingOpening && (openingDescription === undefined || b.operationScope !== id)) {
      return respond({ error: '請重新讀取城市並提供有效的開局關聯描述。' }, 400);
    }
    if (generatingCharacter && b.characterGeneration && typeof b.characterGeneration === 'object' && 'fields' in b.characterGeneration) {
      const fields = b.characterGeneration.fields;
      const memoryError = fields && typeof fields === 'object' && 'initialMemories' in fields && initialMemoryCapacityError(fields.initialMemories);
      if (memoryError) return respond({ error: memoryError, field: 'initialMemories' }, 400);
    }
      const characterGeneration = generatingCharacter ? readCharacterGeneration(b.characterGeneration) : undefined;
    if (generatingCharacter && (!characterGeneration || b.operationScope !== id)) {
      return respond({ error: '請重新讀取人物範本，並提供描述或已填設定及至少一個空白欄位。' }, 400);
    }
      Object.assign(state, { arrangingOpening, assessingCard, preparingResources, suggestingOpening, initializingCity, arrangement, assessingDraft, openingDescription, characterGeneration });
    },
    loaded({ b }) {
      const city = state.city = state.suggestingOpening || state.initializingCity ? cityDraftSchema.safeParse(b.city) : undefined;
    if (city && !city.success) return respond({error:'請確認城市配置及場所、人物數量。'}, 400);
    },
    async context({ b, accountId, world, version }) {
      const { suggestingOpening, initializingCity, openingDescription, city } = state;
      let openingPreview: typeof state.openingPreview;
    if ((suggestingOpening || initializingCity) && city?.success) {
      if (b.expectedVersion !== version) return respond({ error:'原世界已變更，請重新讀取後再整理。' }, 409);
      if (world.configuration || world.acceptance) return respond({ error:'目前世界無法另建城市。' }, 400);
      const { preview } = await prepareCity(accountId, city.data, world);
      const invalidMemory = preview.characters.some(actor => initialMemoryCapacityError(actor.fields.initialMemories));
      if (invalidMemory || (initializingCity && preview.issues.length > (preview.missingStarts ?? 0))) {
        return respond({ error:preview.issues.join(' '), preview },400);
      }
      if (!preview.places.length || !preview.characters.length || preview.places.length !== city.data.places.length ||
          preview.characters.length !== city.data.characters.length ||
          (suggestingOpening && !(openingDescription || preview.characters.some(actor => actor.fields.background.trim()) ||
            city.data.characters.some(actor => actor.homeDescription || actor.workDescription)))) {
        return respond({ error:'請選擇有效的場所及人物，並提供已有的開局設定或關聯描述。' }, 400);
      }
      openingPreview = preview;
    }
      state.openingPreview = openingPreview;
    },
    accepted({ b, world, version }) {
      const { preparingResources } = state;
    if(preparingResources){
      if(b.expectedVersion!==version)return respond({error:'世界已變更，請重新讀取後再準備物資。',operationSettled:true},409);
      try{validateOpeningResourceRequest(world,b.resourceRequest);}catch(error){return respond({error:(error as Error).message,operationSettled:true},409);}
    }
    },
    async run(ctx): Promise<OperationOutcome> {
      const { b, accountId, id, operationId, world, accountPlayer, trace, verifyLease, workWait, modelSignal, dispatchModel } = ctx;
      let failure: Error | undefined;
      let generatedCharacter: Awaited<ReturnType<typeof generateCharacterFields>> | undefined;
      let suggestedOpening: Awaited<ReturnType<typeof suggestOpeningRelationships>> | undefined;
      let finalizedCity: Awaited<ReturnType<typeof initializeCity>> | undefined;
      const { arrangingOpening, assessingCard, preparingResources, initializingCity, arrangement, assessingDraft, openingDescription, characterGeneration, city, openingPreview } = state;
      let finalizationPreview: typeof openingPreview;
      try {
        const config = world.adjudication!;
        const usage = world.aiUsage = currentUsage(world);
        const price = accountPlayer.prices.find(value => value.provider === config.provider && value.model === config.model);
        const runSetup = async <T,>(task:string, invoke:(service:ModelService,options:Parameters<typeof requestModel>[3])=>Promise<T>) => {
          if (budgetReached((await playerAccount(accountId)).usage, (await playerAccount(accountId)).limits)) throw new BudgetExceeded();
          await verifyLease();
          if (env.RECALL_ENABLED === 'true' && (await workWait(reserveRecallDispatch(
            recallBudgetDatabase(), accountId, 'chat', id + ':' + operationId + ':' + task, 1, { ownerMonthly: 0, accountMonthly: 0 }, 'player',
          ))).replayed) throw Error('付費請求結果不明，禁止重送。');
          const key = await workWait(readModelKey(accountId, config.provider));
          await verifyLease();
          let reportCost: ReturnType<typeof beginCost> | undefined;
          const dispatch = dispatchModel('adjudication', world, undefined, config.provider, config.model, key, { evidence: false, withinWorkDeadline: false, forward: (url, init) => {
            traceWorld(trace, 'model-dispatch');
            usage.calls++; usage.totalCalls++; usage.unknownCalls++; usage.totalUnknownCalls++;
            reportCost = beginCost(usage, config.provider, config.model, price, 'adjudication');
            return fetch(url, init);
          } });
          const result = await invoke({ ...config, key }, {
            signal: modelSignal(),
            onSettled: dispatch.onSettled,
            requestId: operationId + ':' + task,
            observer: dispatch.observer,
            beforeDispatch: dispatch.beforeDispatch,
            fetcher: dispatch.fetcher,
            onUsage: dispatch.reportUsage(tokens => accountUsage(usage, tokens), tokens => reportCost?.(tokens)),
          });
          await verifyLease();
          return result;
        };
        if(preparingResources){
          const prepared=structuredClone(world);
          await runSetup('opening-resources',(service,options)=>prepareOpeningResources(prepared,b.resourceRequest as string,service,options));
          world.supplies=prepared.supplies;world.objects=prepared.objects;
          world.routinePlaces=prepared.routinePlaces;world.openingResources=prepared.openingResources;
        } else if(arrangingOpening&&arrangement){
          const snapshot=JSON.parse(arrangement.snapshot) as OpeningDraft;
          const {purpose,resourceRequest}=JSON.parse(arrangement.request) as import('./opening-arrangement-store').ArrangementRequest;
          let city=snapshot.body.city;
          if(purpose==='resources'){
            const {world:candidate}=await prepareCity(accountId,city,world,snapshot.sources);
            if(!candidate)throw Error('請先完成起點與物資配置。');
            delete candidate.openingResources;
            const addition=await runSetup('opening-resources',(service,options)=>suggestOpeningResources(candidate,resourceRequest??'',service,options));
            const plan=mapResourceActors(addition,id=>{
              const source=candidate.characters.find(actor=>actor.id===id)?.profileSource?.id;
              if(!source)throw Error('物資指定了未選人物。');
              return source;
            });
            city={...city,resourcePlan:{supplies:[...city.resourcePlan?.supplies??[],...plan.supplies],
              furnishingGrants:[...city.resourcePlan?.furnishingGrants??[],...plan.furnishingGrants.filter(row=>!city.resourcePlan?.furnishingGrants.some(old=>old.objectId===row.objectId))],unavailable:plan.unavailable}};
          }else{
            city=await runSetup('opening-arrangement',(service,options)=>arrangeOpening(snapshot,service,options));

          }
          await workWait(storeArrangementResult(accountId,arrangement.draft_id,operationId,cityDraftSchema.parse(city)));
        } else if (assessingCard && assessingDraft) {
          const assessment = await runSetup('card-assessment',(service,options)=>assessCharacterCard(assessingDraft,service,options));
          await workWait(saveCardAssessment(accountId,assessingDraft.id,operationId,assessment));
        } else if (characterGeneration) {
          generatedCharacter = await runSetup('character-generation',(service,options)=>generateCharacterFields(characterGeneration,service,options));
        } else if (openingPreview && city?.success) {
          const draft = city.data;
          if (initializingCity) {
            finalizedCity = await initializeCity(draft,openingPreview,(task,messages,schema)=>
              runSetup(task,(service,options)=>requestModel(service,messages,schema,{...options,maxOutputTokens:4096})));
            const validated = cityDraftSchema.safeParse(finalizedCity);
            if (!validated.success) throw Error('場所定稿超出城市容量。');
            const {preview} = await workWait(prepareCity(accountId,validated.data,world));
            if (preview.issues.length > (preview.missingStarts ?? 0)) throw Error('場所定稿無法套用。');
            finalizationPreview = preview;
          } else if (openingDescription !== undefined) {
            const preview = openingPreview;
            suggestedOpening = await runSetup('opening-relationships',(service,options)=>suggestOpeningRelationships(draft,preview,openingDescription,service,options));
          }
        }
      } catch (error) {
        failure = error instanceof BudgetExceeded || error instanceof CharacterTemplateValidationError ? error : Error(preparingResources ? '日常物資未能完整確認，尚未新增物資；原世界與回合已保留。' : assessingCard ? '人物背景未能判讀，尚未形成數值，原文字已保留。' : characterGeneration ? '人物草稿未能生成，原設定已保留。' : initializingCity ? '場所未能定稿，原設定已保留。' : '開局關聯未能整理，原設定已保留。');
      }
      return { failure, extras: { ...(generatedCharacter ? { generatedCharacter } : {}), ...(suggestedOpening ? { suggestedOpening } : {}), ...(finalizedCity ? { finalizedCity, preview:finalizationPreview } : {}) } };
    },
  };
};

/** 驗收場景的進出（#331 會移除）。 */
const acceptanceOperation = (): OperationHandler => ({
  accepted({ b, world }) {
    if (b.operation === 'enter-acceptance' && world.acceptance) return respond({error:'目前已在驗收場景，請先返回原世界。'},400);
    if (b.operation === 'exit-acceptance' && !world.acceptance?.original && !world.acceptance?.snapshot) return respond({error:'沒有可返回的原世界。'},400);
  },
  async run({ b, world, forgetEarlierOperations }): Promise<OperationOutcome> {
    try {
      const next = await (b.operation === 'enter-acceptance' ? enterAcceptanceScene(world) : exitAcceptanceScene(world));
      forgetEarlierOperations();
      return { world: next };
    } catch (error) { return { failure: error instanceof Error ? error : new Error('無法切換驗收場景。') }; }
  },
});

const enableMentalEnergyOperation = (): OperationHandler => ({
  normalized({ b, world }) {
    if(b.operation==='enable-mental-energy'){try{validateMentalAdoption(world,b.mentalOpenings);readMentalEnergyTestPolicy(env,world);}catch(e){return respond({error:(e as Error).message},400);}}
  },
  run({ b, world }) {
      adoptFormalMentalEnergy(world,validateMentalAdoption(world,b.mentalOpenings));
  },
});

const enableBodyNeedsOperation = (): OperationHandler => ({
  normalized({ b, world }) {
    if(b.operation==='enable-body-needs'){try{validateBodyNeedsSetup(world,b.bodyNeeds);}catch(e){return respond({error:(e as Error).message},400);}}
  },
  run({ b, world }) {
      enablePersonalNeeds(world,validateBodyNeedsSetup(world,b.bodyNeeds));
  },
});

/** 導入舊制基本屬性，或只更新明示的感官硬限制。 */
const characterSetupOperation = (): OperationHandler => {
  let adoptingAttributes = false, updatingSenseLimits = false;
  let characterSetup: ReturnType<typeof characterSetupSchema.safeParse> | undefined;
  return {
    context({ b, id, world, version }) {
      adoptingAttributes = b.operation === 'adopt-character-attributes';
      updatingSenseLimits = b.operation === 'set-character-sense-limits';
      characterSetup = characterSetupSchema.safeParse(b.characterSetup);
      if (!characterSetup?.success) return respond({error:'請確認人物基本屬性、背景範圍及專長／感官修正。'},400);
      if (b.operationScope !== id || b.worldContext !== world.contextId || b.expectedVersion !== version) return respond({error:'人物設定依據的世界已變更，請重新讀取。',operationSettled:true},409);
      const actor=world.characters.find(actor=>actor.id===b.target);
      if (updatingSenseLimits && characterSetup.success && (characterSetup.data.blockedSenses === undefined || Object.keys(characterSetup.data).some(key=>key!=='blockedSenses'))) return respond({error:'此處只更新明示感官硬限制，不改寫人物數值。'},400);
      if (!actor || (adoptingAttributes ? !!actor.attributes : !actor.attributes) || world.acceptance) return respond({error:'此人物無法再次導入基本屬性。'},400);
    },
    run({ b, world }) {
      if (adoptingAttributes && characterSetup?.success) {
      formCharacterAttributes(world.characters.find(actor=>actor.id===b.target)!,characterSetup.data,world.minute);
      } else if (updatingSenseLimits && characterSetup?.success) {
      world.characters.find(actor=>actor.id===b.target)!.attributes!.blockedSenses=[...new Set(characterSetup.data.blockedSenses!)];
      }
    },
  };
};

const setPriceOperation = (): OperationHandler => ({
  accountWorkspace: true,
  request({ b }) {
    if (b.operation === 'set-price' && !validPrice(b.price)) return respond({error:'請填寫有效的供應商、模型、非負有限 USD 單價、來源與日期。'},400);
  },
  async run({ b, accountId, world }) {
      world.modelPrices=(await setPlayerAccount(accountId,{price:b.price!})).prices;
  },
});

const setAdjudicationOperation = (): OperationHandler => ({
  accountWorkspace: true,
  request({ b }) {
    if(b.operation==='set-adjudication'&&(!b.adjudication||!['openai','openrouter'].includes(b.adjudication.provider)||typeof b.adjudication.model!=='string'||!b.adjudication.model.trim()||b.adjudication.model.length>120||Object.keys(b.adjudication).some(k=>!['provider','model'].includes(k)))) return respond({error:'請填寫裁定服務與模型。'},400);
  },
  run({ b, world }) {
      world.adjudication={provider:b.adjudication!.provider,model:b.adjudication!.model.trim()};
  },
});

const setBudgetOperation = (): OperationHandler => ({
  accountWorkspace: true,
  request({ b }) {
    if (b.operation === 'set-budget' && !validBudgetLimits(b.limits)) return respond({ error: '請提供完整的玩家預算設定。' }, 400);
  },
  async run({ b, accountId, world }) {
      await setPlayerAccount(accountId,{limits:b.limits!});
      world.playerBudget = { calls:b.limits!.calls,tokens:b.limits!.tokens };
  },
});

/** 直接控制目前只適用舊固定世界的咖啡店主（#320 會改成任何人物）。 */
const noDirectControl = ({ world }: WorldChecks) => world.configuration ? respond({ error: '此世界沒有可直接控制的預設店主。' }, 400) : undefined;
const controlTarget = ({ b }: OperationChecks) => b.target !== undefined && b.target !== 'owner' ? respond({ error: '只能直接控制咖啡店主。' }, 400) : undefined;

const takeoverOperation = (): OperationHandler => ({
  normalized: checks => noDirectControl(checks) ?? controlTarget(checks),
  run({ world }) {
      const c = world.characters.find(c => c.id === 'owner')!;
      c.control!.mode = 'taken-over';
      c.control!.experiences ??= [];
      if (!c.control!.active) { cancelActivity(world,c,'stop'); c.activity = '待命，等待下一個指定行動。'; }
  },
});

const returnControlOperation = (): OperationHandler => ({
  normalized: checks => noDirectControl(checks) ?? controlTarget(checks),
  run({ world }) {
      const c = world.characters.find(c => c.id === 'owner')!;
      const experiences = c.control!.experiences;
      c.control = { mode: 'autonomous', ...(experiences?.length ? { experiences } : {}) };
      cancelActivity(world,c,'stop');
      c.activity = '已交還控制權，等待下一次自主選擇。';
  },
});

const directOperation = (): OperationHandler => ({
  normalized(checks) {
    const { b, world } = checks;
    const blocked = noDirectControl(checks);
    if (blocked) return blocked;
      try {
        if (b.target !== undefined && b.target !== 'owner') throw Error('只能直接控制咖啡店主');
        const action = b.action;
        if (!action || typeof action !== 'object' || Object.keys(action).some(k => !['type', 'target', 'content', ...(world.characters.some(c=>c.mentalEnergy)?[]:['mood'])].includes(k)) ||
          (action.content !== undefined && (typeof action.content !== 'string' || action.content.length > 500)) ||
          (action.target !== undefined && typeof action.target !== 'string') ||
          (action.mood !== undefined && (typeof action.mood !== 'string' || action.mood.length > 20))) throw Error('行動格式無效');
        const check = structuredClone(world);
        if(action.type==='work'&&action.target==='tea'){
          if(!bindRoutine(check,check.characters.find(c=>c.id==='owner')!,action,15))throw Error('泡茶尚無已確認的日常規則；直接指定不新增模型裁定。');
        }else resolve(check, check.characters.find(c => c.id === 'owner')!, action, { dryRun: true });
      } catch (e) { return respond({ error: e instanceof Error ? e.message : '指定行動無效。' }, 400); }
  },
  run({ b, world }) {
      world.characters.find(c => c.id === 'owner')!.control!.pending = b.action!;
  },
});

const interveneOperation = (): OperationHandler => ({
  normalized({ b, world }) {
    if (b.operation === 'intervene' && (typeof b.text !== 'string' || !b.text.trim() || b.text.length > 500 || (!world.characters.some(c => c.id === b.target) && b.target !== 'all'))) return respond({ error: '請填入 1–500 字的事件，並選擇對象。' }, 400);
  },
  run({ b, world }) {
      const targets = b.target === 'all' ? world.characters.map(c => c.id) : [b.target!];
      const name = world.characters.find(c => c.id === b.target)?.name;
      record(world, 'observer', b.target === 'all' ? `共同事件：${b.text!.trim()}` : `觀察者對 ${name} 說：「${b.text!.trim()}」`, 'intervention', targets);
  },
});

export const hostOperations: OperationTable = {
  'set-model-key': modelKeyOperation,
  'clear-model-key': modelKeyOperation,
  'advance': advanceOperation,
  'intervene': interveneOperation,
  'direct': directOperation,
  'takeover': takeoverOperation,
  'return-control': returnControlOperation,
  'set-budget': setBudgetOperation,
  'set-price': setPriceOperation,
  'set-adjudication': setAdjudicationOperation,
  'set-character-sense-limits': characterSetupOperation,
  'prepare-opening-resources': setupOperation(),
  'generate-character-template': setupOperation({ accountWorkspace: true }),
  'assess-character-card': setupOperation({ accountWorkspace: true, privateEvidence: true }),
  'arrange-opening': setupOperation({ accountWorkspace: true }),
  // 以下在 #331–#336 移除。
  'enable-mental-energy': enableMentalEnergyOperation,
  'enable-body-needs': enableBodyNeedsOperation,
  'adopt-character-attributes': characterSetupOperation,
  'enter-acceptance': acceptanceOperation,
  'exit-acceptance': acceptanceOperation,
  'preview-city': previewCityOperation,
  'suggest-opening-relationships': setupOperation({ largeBody: true }),
  'initialize-city': setupOperation({ largeBody: true }),
  'start-city': retiredOperation(true),
  'reset': retiredOperation(false),
};

/** 以 HTTP 請求受理一次操作（world route）。 */
export const runHostOperation = (input: OperationInput) => runOperation(input, hostOperations);
/** 不經 HTTP 受理一次操作：給已自行完成登入與來源檢查的 route 使用。 */
export const acceptHostOperation = (request: Parameters<typeof acceptOperation>[0]) => acceptOperation(request, hostOperations);
