'use client';
import {boundPath} from '@/lib/bound-navigation';
import type { PlayerAccountView } from '@/lib/player-account-budget';
import SaveActions from './save-actions';
import CharacterAnalysis from './character-analysis';
import WorldAnalysis from './world-analysis';
import ModelSettingsPanel from './model-settings-panel';
import { modelRoleReady, modelSourceLabel, type ModelSettingsView } from '@/lib/model-settings';
import SaveNavigation from './save-navigation';
import type { MentalAdoption } from '@/lib/formal-mental-enablement';
import type { BodyNeedsSetup } from '@/lib/body-needs-policy';

import type { CityDraft } from '@/lib/city-draft';
import { roundTimePolicy, roundClientMs, timePolicyHeader } from '@/lib/round-time-policy';
import OperationEvidenceDetails from '@/components/operation-evidence';
import DecisionTraces from '@/components/decision-traces';
import type { OperationEvidence, OperationSummary, ReplayAdvance } from '@/lib/operation-evidence';
import { useCallback,useEffect,useRef,useState,type CSSProperties,type ReactNode } from 'react';
import { Moon,Play,Pause,MessageSquare,Brain,Clock,Loader2,Eye,Radio,Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select,SelectTrigger,SelectValue,SelectContent,SelectItem } from '@/components/ui/select';
import { timeLabel,pendingInterventions,type World,type Character,type Action } from '@/lib/world';
import { currentUsage,defaultLimits,plannedCalls,validBudgetLimits,type BudgetLimits } from '@/lib/activities';
import { costSummary } from '@/lib/costs';
import CostPanel from '@/components/cost-panel';
import { AcceptanceSceneControls, AcceptanceSceneStatus } from '@/components/acceptance-scene';
import AdjudicationFailureDetails from '@/components/adjudication-failure';
import type { AdjudicationFailure } from '@/lib/adjudication';
import CharacterProfile from '@/components/character-profile';
import ForecastPanel from '@/components/forecast-panel';
import type { PriceInput } from '@/lib/costs';
import BudgetControls from '@/components/budget-controls';
import RoundLog from '@/components/round-log';
import CharacterStatusBoard,{whereabouts,activityStatus} from '@/components/character-status-board';
import { bodyFeelings } from '@/lib/needs';
import { mentalEnergyFeeling } from '@/lib/mental-energy';
import { regionOf, canSee, observationTargets } from '@/lib/perception';
import { worldDoors, worldLocations, worldRegions } from '@/lib/world-configuration';
import PixelWorld,{PixelSprite} from '@/components/pixel-world';
import type { EnvironmentView } from '@/lib/environment';
import { readWorldResponse, WorldResponseError } from '@/lib/world-response';
import type { ModelKeyStatus } from '@/lib/model-keys';
type AdjudicationConfig = {provider:'openai'|'openrouter';model:string};
type StopReason = {scope:'player'|'owner'|'provider'|'technical'|'adjudication';code:string};
const reasonLabel=(reason?:StopReason)=>reason?({player:'玩家預算',owner:'站主共用服務',provider:'供應商額度／速率',technical:'技術故障',adjudication:'裁定候選不合法'}[reason.scope]+'：'):'';
type OwnerUsage={enabled?:boolean;month?:string;ownerUnits?:Record<'embedding'|'index'|'search',number>;knownEmbeddingInputTokens?:number};
function Picker({value,onChange,items,label,disabled=false}:{value:string;onChange:(v:string)=>void;items:{value:string;label:string}[];label:string;disabled?:boolean}){return <Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger className="picker" aria-label={label}><SelectValue/></SelectTrigger><SelectContent>{items.map(i=><SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent></Select>;}
const feelingOf=(c:Character)=>{try{return mentalEnergyFeeling(c)?.feeling;}catch{return undefined;}};
function Initial({c,small=false}:{c:Character;small?:boolean}){return <span className={`initial ${small?'small':''}`} style={{color:c.color,borderColor:c.color+'55',background:c.color+'14','--character-color':c.color} as CSSProperties}><PixelSprite id={c.id} name={c.name} sourceId={c.profileSource?.id}/></span>;}
export default function WorldApp({signInPath,displayName,environment,templateNavigation,accountScope,saveId,saveName,originalOpeningAvailable,initialView='observation'}:{signInPath:string;displayName:string;environment:EnvironmentView;templateNavigation?:ReactNode;accountScope?:string;saveId?:string;saveName?:string;originalOpeningAvailable?:boolean;initialView?:'observation'|'analysis'|'settings'}){
const worldEndpoint=saveId?'/api/world?save='+encodeURIComponent(saveId):'/api/world';
const mountedRef=useRef(true);
const [worldVersion,setWorldVersion]=useState(-1);
const [modelPanel,setModelPanel]=useState(false),[modelPreferences,setModelPreferences]=useState<ModelSettingsView>();
const [world,setWorld]=useState<World|null>(null),[selected,setSelected]=useState('cass'),[busy,setBusy]=useState(false),[error,setError]=useState('');
const [adjudicationFailure,setAdjudicationFailure]=useState<AdjudicationFailure>();
const [operationEvidence,setOperationEvidence]=useState<OperationEvidence>(),[recentOperations,setRecentOperations]=useState<OperationSummary[]>([]),[evidenceScope,setEvidenceScope]=useState('');
const [mode,setMode]=useState('demo'),[key,setKey]=useState(''),[model,setModel]=useState(''),[page,setPageState]=useState<'observation'|'settings'|'analysis'|'profile'|'city'>(initialView),[minutes,setMinutes]=useState('5'),[target,setTarget]=useState('cass'),[text,setText]=useState(''),[notice,setNotice]=useState(''),[signInRequired,setSignInRequired]=useState(false),[playing,setPlaying]=useState(false);
function setPage(next:typeof page){
 setPageState(next);
 // Keep the current world's URL reloadable without remounting its operation owner.
 if(!saveId)return;
 const url=new URL(window.location.href);
 if(url.pathname!=='/observe'||url.searchParams.get('save')!==saveId)return;
 if(next==='analysis'||next==='settings')url.searchParams.set('view',next);else url.searchParams.delete('view');
 window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);
}
const character=world?.characters.find(c=>c.id===selected)||world?.characters[0];
const activeCharacterId=character?.id||'';
const interventionTarget=target==='all'||world?.characters.some(c=>c.id===target)?target:activeCharacterId;
const locations=worldLocations(world??undefined),regions=worldRegions(world??undefined),doors=world?worldDoors(world):[];
const [adjudicationProvider,setAdjudicationProvider]=useState<'openai'|'openrouter'>('openai'),[adjudicationModel,setAdjudicationModel]=useState(''),[adjudicationKey,setAdjudicationKey]=useState('');
const savedAdjudication=world?.adjudication;
const savedAdjudicationProvider=savedAdjudication?.provider;
const adjudicationDraftRef=useRef('');
const [analysisFromProfile,setAnalysisFromProfile]=useState(false);
const [analysisSection,setAnalysisSection]=useState<'character'|'world'|'usage'|'traces'>('character');
const [utility,setUtility]=useState<'save'|'runtime'|null>(null);
const utilityTrigger=useRef<HTMLButtonElement|null>(null);
const analysisHeading=useRef<HTMLHeadingElement|null>(null);
useEffect(()=>{if(page==='analysis')analysisHeading.current?.focus();},[page]);
function openUtility(next:'save'|'runtime',trigger:HTMLButtonElement){utilityTrigger.current=trigger;setUtility(previous=>previous===next?null:next);}
function closeUtility(){setUtility(null);utilityTrigger.current?.focus();}
function showAnalysis(section:typeof analysisSection){setAnalysisSection(section);setPage('analysis');setUtility(null);}

const [automatic,setAutomatic]=useState(false),[intervalSeconds,setIntervalSeconds]=useState('30'),[limits,setLimits]=useState<BudgetLimits>(defaultLimits);
const [accountPlayer,setAccountPlayer]=useState<PlayerAccountView>();
const [unresolvedUsageRecovery,setUnresolvedUsageRecovery]=useState(false);
const [ownerUsage,setOwnerUsage]=useState<OwnerUsage>({enabled:false});
const [directType,setDirectType]=useState<Action['type']>('rest'),[directTarget,setDirectTarget]=useState(''),[directContent,setDirectContent]=useState('');
const [modelKeys,setModelKeys]=useState<ModelKeyStatus>({openai:{configured:false,expiresAt:null},openrouter:{configured:false,expiresAt:null}}),[keyStorageAvailable,setKeyStorageAvailable]=useState(false);
const busyRef=useRef(false),autoRef=useRef(false),playingRef=useRef(false);
const versionRef=useRef(-1),scopeRef=useRef(''),worldContextRef=useRef<string|undefined>(undefined);
const [traceFocusOperationId,setTraceFocusOperationId]=useState<string>();
const [traceResponseStatus,setTraceResponseStatus]=useState<{operationId:string;status:string;gap?:string;lastKnownStage?:string}>();
const focusTrace=useCallback((operationId:string)=>{setTraceFocusOperationId(operationId);setTraceResponseStatus(previous=>previous?.operationId===operationId?previous:undefined);if(scopeRef.current)sessionStorage.setItem(scopeRef.current+':trace-focus',JSON.stringify({operationId,contextId:worldContextRef.current}));},[]);
const [pendingOperation,setPendingOperation]=useState(false);
const acceptWorld=useCallback((d:{accountPlayer?:PlayerAccountView;world?:World;version?:number;adjudicationFailure?:AdjudicationFailure;operationEvidence?:OperationEvidence;recentOperations?:OperationSummary[];unresolvedUsageRecovery?:boolean})=>{const policy=d.accountPlayer&&(!accountScope||d.accountPlayer.accountOwner===accountScope)?d.accountPlayer:undefined;if(d.world&&typeof d.version==='number'&&d.version>=versionRef.current){if(worldContextRef.current!==d.world.contextId){setTraceFocusOperationId(undefined);setTraceResponseStatus(undefined);if(scopeRef.current)sessionStorage.removeItem(scopeRef.current+':trace-focus');}worldContextRef.current=d.world.contextId;versionRef.current=d.version;setWorldVersion(d.version);setWorld(d.world);if(d.unresolvedUsageRecovery!==undefined)setUnresolvedUsageRecovery(d.unresolvedUsageRecovery);setAdjudicationFailure(d.adjudicationFailure);setOperationEvidence(d.operationEvidence);if(d.recentOperations)setRecentOperations(d.recentOperations);const config=JSON.stringify(d.world.adjudication||null);if(config!==adjudicationDraftRef.current){adjudicationDraftRef.current=config;setAdjudicationProvider(d.world.adjudication?.provider||'openai');setAdjudicationModel(d.world.adjudication?.model||'');}setLimits(policy?.limits||(validBudgetLimits(d.world.playerBudget)?d.world.playerBudget:defaultLimits));if(policy)setAccountPlayer(previous=>!previous||policy.accountingVersion>=previous.accountingVersion?policy:previous);}},[accountScope]);
const readLatest=useCallback(async()=>{
type Latest={accountPlayer?:PlayerAccountView;modelSettings?:ModelSettingsView;unresolvedUsageRecovery?:boolean;operationEvidence?:OperationEvidence;recentOperations?:OperationSummary[];adjudicationFailure?:AdjudicationFailure;recallUsage?:OwnerUsage;stopReason?:StopReason;world:World;version:number;operationScope:string;modelKeys:ModelKeyStatus;modelKeyStorageAvailable:boolean;error?:string;operation?:{state:string;status?:number;error?:string;stopReason?:StopReason}};
const read=async(path:string)=>{const r=await fetch(path,{credentials:'same-origin',signal:AbortSignal.timeout(15000)});if(r.status===401)setSignInRequired(true);const d=await readWorldResponse<Latest>(r);if(!r.ok)throw Error(reasonLabel(d.stopReason)+(d.error||`讀取世界失敗（HTTP ${r.status}）。`));if(!d.world||typeof d.version!=='number'||typeof d.operationScope!=='string'||!d.modelKeys?.openai||!d.modelKeys?.openrouter)throw new WorldResponseError(r.status,'application/json');return d;};
const originalBinding=scopeRef.current.slice('quiet-hours:pending:'.length);
const initialEndpoint=worldEndpoint+(worldEndpoint.includes('?')?'&':'?')+'operationScope='+encodeURIComponent(originalBinding);
let d=await read(originalBinding?initialEndpoint:worldEndpoint);
if(accountScope&&d.accountPlayer?.accountOwner!==accountScope)throw Error('登入帳號已變更，原世界未同步。');
if(originalBinding&&d.operationScope!==originalBinding)throw Error('登入帳號或存檔已變更，原世界未同步。');
if(!mountedRef.current)return;
const scopedEndpoint=worldEndpoint+(worldEndpoint.includes('?')?'&':'?')+'operationScope='+encodeURIComponent(d.operationScope);
const scope=`quiet-hours:pending:${d.operationScope}`;
const initialScope=!scopeRef.current;
if(scopeRef.current!==scope){if(scopeRef.current)sessionStorage.removeItem(scopeRef.current+':trace-focus');scopeRef.current=scope;versionRef.current=-1;worldContextRef.current=undefined;setTraceFocusOperationId(undefined);setTraceResponseStatus(undefined);setEvidenceScope(scope);}
const storedFocus=initialScope?sessionStorage.getItem(scope+':trace-focus'):null;
acceptWorld(d);
if(storedFocus){try{const focus=JSON.parse(storedFocus);if(focus.contextId===d.world.contextId&&typeof focus.operationId==='string')focusTrace(focus.operationId);}catch{sessionStorage.removeItem(scope+':trace-focus');}}
if(d.modelSettings){setModelPreferences(d.modelSettings);if(d.modelSettings.effective.npc){setModel(d.modelSettings.effective.npc.model);const provider=d.modelSettings.effective.npc.provider;setMode(previous=>previous==='demo'?previous:provider==='openai'?'openai':'ai');}}
setOwnerUsage(d.recallUsage||{enabled:false});setSignInRequired(false);setModelKeys(d.modelKeys);setKeyStorageAvailable(d.modelKeyStorageAvailable);
const saved=sessionStorage.getItem(scope);
setPendingOperation(!!saved);
if(saved){
const payload=JSON.parse(saved) as {operationId:string;worldContext?:string};
if(payload.worldContext===d.world.contextId)focusTrace(payload.operationId);
d=await read(`${scopedEndpoint}${scopedEndpoint.includes('?')?'&':'?'}operationId=${encodeURIComponent(payload.operationId)}`);
if(`quiet-hours:pending:${d.operationScope}`!==scope)throw Error('登入帳號已變更，請重新讀取世界。');
acceptWorld(d);
// A successful GET alone does not settle an operation. Only the durable journal can.
if(d.operation?.state==='settled'){
sessionStorage.removeItem(scope);setPendingOperation(false);
if(d.operation.status!==200)throw Error(reasonLabel(d.operation.stopReason)+(d.operation.error||'上次操作已確認失敗，世界未重做；可以決定是否建立新操作。'));
}else if(d.operation?.state==='uncertain'||d.operation?.state==='expired')throw Error('上次操作的結果仍無法確認；未完成操作已保留，不會自動重做模型決策。請保留操作識別碼供診斷。');
}
},[acceptWorld,focusTrace,worldEndpoint,accountScope]);
const handlePlayingChange=useCallback((next:boolean)=>{playingRef.current=next;setPlaying(next);},[]);
const stopAuto=useCallback((message?:string)=>{autoRef.current=false;setAutomatic(false);if(message)setNotice(message);},[]);
const refresh=useCallback(async()=>{if(busyRef.current)return;stopAuto();busyRef.current=true;setBusy(true);setError('');try{await readLatest();}catch(e){setError((e as Error).message);}finally{busyRef.current=false;setBusy(false);}},[stopAuto,readLatest]);
async function manageKey(operation:'set-model-key'|'clear-model-key',provider?:'openai'|'openrouter'){
if(busyRef.current||(!provider&&mode==='demo'))return;stopAuto();busyRef.current=true;setBusy(true);setError('');setNotice('');
try{const operationScope=scopeRef.current.slice('quiet-hours:pending:'.length);if(!operationScope)throw Error('請先讀取原帳號設定。');const r=await fetch(worldEndpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({operationScope,operation,mode:provider?(provider==='openai'?'openai':'ai'):mode,...(operation==='set-model-key'?{key:provider?adjudicationKey:key}: {})})});if(r.status===401)setSignInRequired(true);const d=await readWorldResponse<{operationScope:string;modelKeys:ModelKeyStatus;modelKeyStorageAvailable:boolean;error?:string}>(r);if(!r.ok)throw Error(d.error);if(!mountedRef.current)return;if(d.operationScope!==operationScope)throw Error('原帳號已變更，輸入未同步。');setModelKeys(d.modelKeys);setKeyStorageAvailable(d.modelKeyStorageAvailable);setKey('');setAdjudicationKey('');setNotice(operation==='set-model-key'?'Key 已加密保存。同帳號在本站的其他瀏覽器也可使用，最長 14 天。':'Key 已清除。同帳號在本站的所有瀏覽器都會停止新的模型呼叫。');}catch(e){setError((e as Error).message);}finally{busyRef.current=false;setBusy(false);}}
useEffect(()=>{mountedRef.current=true;return ()=>{mountedRef.current=false;autoRef.current=false;};},[]);
useEffect(()=>{let mounted=true;queueMicrotask(()=>{if(mounted)void refresh();});return ()=>{mounted=false;};},[refresh]);
const batchRef=useRef(false);
const [batchProgress,setBatchProgress]=useState('');
async function act(...args:Parameters<typeof actStep>):Promise<boolean>{
 if(batchRef.current||(args[0]==='advance'&&playingRef.current))return false;
 const count=args[0]==='advance'&&!args[4]?Number(minutes)/5:1;
 batchRef.current=true;
 try{
  for(let step=0;step<count;step++){
   if(!mountedRef.current)return false;
   if(step&&document.visibilityState!=='visible'){setNotice('分頁已離開前景，快轉停在已儲存步驟。');return false;}
   if(count>1)setBatchProgress(`快轉 ${step+1}/${count}：每步獨立儲存，失敗保留已完成進度。`);
   if(!await actStep(...args))return false;
  }
  return true;
 }finally{batchRef.current=false;setBatchProgress('');}
}
async function actStep(operation:string,budget?:BudgetLimits,price?:PriceInput,adjudication?:AdjudicationConfig,replay?:ReplayAdvance,cityStart?:{city?:CityDraft;expectedVersion:number;characterSetup?:import('@/lib/character-attributes').CharacterSetup;target?:string},bodyNeeds?:BodyNeedsSetup[],mentalOpenings?:MentalAdoption):Promise<boolean>{
if(busyRef.current)return false;
if(replay||['enable-mental-energy','set-character-sense-limits','enable-body-needs','adopt-character-attributes','enter-acceptance','exit-acceptance','start-city'].includes(operation))stopAuto();
if(pendingOperation&&operation!=='resume'){setError('請先按「重試未完成操作」確認上一個操作的結果。');return false;}
busyRef.current=true;setBusy(true);setError('');setNotice('');
try{
if(!scopeRef.current)throw Error('請先重新讀取世界。');
const storageKey=scopeRef.current;
const saved=sessionStorage.getItem(storageKey);
const payload=saved||JSON.stringify(replay?{...replay,operationScope:storageKey.slice('quiet-hours:pending:'.length)}:{operationScope:storageKey.slice('quiet-hours:pending:'.length),operationId:`${Date.now()}:${crypto.randomUUID()}`,worldContext:world?.contextId,operation,...cityStart,...(bodyNeeds?{bodyNeeds}:{}),...(mentalOpenings?{mentalOpenings}:{}),minutes:operation==='advance'?5:Number(minutes),...(operation==='advance'?{timeContract:'five-minute-v1'}:{}),mode,model:mode!=='demo'?model:undefined,target:['adopt-character-attributes','set-character-sense-limits'].includes(operation)?cityStart?.target:['direct','takeover','return-control'].includes(operation)?'owner':interventionTarget,text,...(budget?{limits:budget}:{}),...(price?{price}:{}),...(adjudication?{adjudication}:{}),action:operation==='direct'?{type:directType,...(directTarget?{target:directTarget}:{}),...(directContent?{content:directContent}:{})}:undefined});
// Persist before sending; reloading or a lost response must not create a new ID.
sessionStorage.setItem(storageKey,payload);setPendingOperation(true);
const sent=JSON.parse(payload) as {operation:string;operationId:string};
operation=sent.operation;focusTrace(sent.operationId);
const deadline=Date.now()+15000;
let r:Response|undefined,d:{accountPlayer?:PlayerAccountView;world?:World;version?:number;error?:string;scopeMismatch?:boolean;contextMismatch?:boolean;operationSettled?:boolean;clientUpdateRequired?:boolean;modelSettingsRequired?:boolean;retryable?:boolean;limitReached?:boolean;operationUncertain?:boolean;stopReason?:StopReason;decisionTraceStatus?:{status:string;gap?:string;lastKnownStage?:string}}|undefined;
let transportError:Error|undefined;
while(Date.now()<deadline&&mountedRef.current){
try{r=await fetch(worldEndpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',[timePolicyHeader]:roundTimePolicy.version},body:payload,signal:AbortSignal.timeout(roundClientMs)});if(r.status===401)setSignInRequired(true);d=await readWorldResponse<NonNullable<typeof d>>(r);if(!r.ok&&typeof d.error!=='string')throw new WorldResponseError(r.status,'application/json');}
catch(e){transportError=e instanceof WorldResponseError?e:undefined;if(e instanceof WorldResponseError&&e.status===401)throw e;r=undefined;d=undefined;}
if(!mountedRef.current)return false;
if(r&&d&&!d.retryable)break;
setNotice('世界正處理另一個回合或連線中斷，正在等待後重試…');
await new Promise(resolve=>setTimeout(resolve,1000));
}
if(d?.decisionTraceStatus)setTraceResponseStatus({operationId:sent.operationId,...d.decisionTraceStatus});
if(!r||!d||d.retryable)throw Error(transportError?.message||'等待逾時：另一個回合可能仍在處理。未完成操作已保留，請按「重試未完成操作」。');
if(d.clientUpdateRequired)throw Error(d.error);
if(d.contextMismatch){sessionStorage.removeItem(storageKey);setPendingOperation(false);await readLatest();throw Error(d.error);}
if(d.scopeMismatch){await readLatest();throw Error(d.error);}
acceptWorld(d);
if(r.status===401){setSignInRequired(true);throw Error(d.error);}
if(d.operationUncertain||(!d.operationSettled&&![400,403,422].includes(r.status)))throw Error(`${d.error||'暫時無法確認操作結果。'} 未完成操作已保留，請按「重試未完成操作」。`);
sessionStorage.removeItem(storageKey);setPendingOperation(false);
await readLatest();
if(!r.ok){if(d.modelSettingsRequired)setModelPanel(true);throw Error(reasonLabel(d.stopReason)+d.error);}
setSignInRequired(false);if(d.limitReached)stopAuto();if(operation==='intervene')setText('');if(operation==='start-city')setPage('observation');setNotice(operation==='set-character-sense-limits'?'感官硬限制已保存。':operation==='adopt-character-attributes'?'基本屬性已導入；重載不會重新抽取。':replay?'原操作結果已重讀，沒有新增回合。':operation==='start-city'?'城市已開始。':operation==='enter-acceptance'?'已進入獨立驗收場景；原世界已暫存，自動運行保持暫停。':operation==='exit-acceptance'?'已返回原世界；驗收用量保留，自動運行保持暫停。':operation==='set-adjudication'?'裁定配置已保存；AI 決策與裁定共用玩家預算。':operation==='set-price'?'自訂單價已保存；只適用之後的模型請求。':operation==='set-budget'?'玩家預算已保存；提高或解除限制不會自動恢復。':operation==='reset'?'世界已重置為初始狀態；角色、事件、記憶、習慣與意圖都從頭開始，用量統計保留。':d.limitReached?'玩家預算已達上限，自動運行已暫停。':operation==='advance'?'回合已儲存':operation==='direct'?'店主的單次指定已儲存；下一回合優先執行。':operation==='takeover'?'已接管店主；沒有指定行動時會待命，其他角色繼續生活。':operation==='return-control'?'已交還控制權；下一回合由店主重新判斷意圖與行動。':`${target==='all'?'所有角色':world?.characters.find(c=>c.id===target)?.name||'角色'} 已收到；再推進一次時間，會做出行動或回覆。`);
return !d.limitReached;}catch(e){stopAuto();setError((e as Error).message);return false;}finally{busyRef.current=false;setBusy(false);}}

useEffect(()=>{const onVisibility=()=>{if(document.visibilityState!=='visible'&&autoRef.current)stopAuto('分頁已離開前景，自動運行已暫停。');if(document.visibilityState==='visible')void refresh();};document.addEventListener('visibilitychange',onVisibility);return ()=>document.removeEventListener('visibilitychange',onVisibility);},[refresh,stopAuto]);
useEffect(()=>{if(!automatic||busy||playing||!world)return;const timer=setTimeout(()=>{if(autoRef.current&&document.visibilityState==='visible')void act('advance');},Number(intervalSeconds)*1000);return ()=>clearTimeout(timer);},[automatic,busy,playing,world,intervalSeconds,minutes,mode,model,limits]);
useEffect(()=>{if(mode==='demo')return;const providers=new Set<'openai'|'openrouter'>([mode==='openai'?'openai':'openrouter']);if(savedAdjudicationProvider)providers.add(savedAdjudicationProvider);const timers=[...providers].flatMap(provider=>{const status=modelKeys[provider];if(!status.configured||!status.expiresAt)return [];return [setTimeout(()=>{setModelKeys(previous=>({...previous,[provider]:{configured:false,expiresAt:status.expiresAt}}));stopAuto('已保存的 Key 已到期，自動運行已暫停。');},Math.max(0,status.expiresAt-Date.now()))];});return ()=>timers.forEach(clearTimeout);},[mode,modelKeys,savedAdjudicationProvider,stopAuto]);
const startAuto=()=>{if(mode!=='demo'&&(limits.calls===null||limits.tokens===null)&&!window.confirm('開始無上限自動運行？可能持續產生 API 費用；站主服務預算、前景與故障停止仍然有效。'))return;autoRef.current=true;setAutomatic(true);setError('');setNotice(`已開始自動推進：每 ${intervalSeconds} 秒推進 ${minutes} 分鐘。`);};
function selectCharacter(id:string){setSelected(id);setTarget(id);}
function interactWithCharacter(){if(!character)return;setTarget(character.id);setPage('observation');requestAnimationFrame(()=>document.getElementById(!world?.configuration&&character.id==='owner'?'owner-control':'intervention')?.focus());}
function showCharacterAnalysis(){setAnalysisFromProfile(page==='profile');showAnalysis('character');}
const directTargets=world&&character?(directType==='move'?[...locations.filter(l=>l.id!==character.location).map(l=>({value:l.id,label:l.name})),...regions.filter(r=>r.location===character.location&&r.id!==regionOf(character)).map(r=>({value:r.id,label:r.name}))]:directType==='door'?doors.filter(d=>d.regions.includes(regionOf(character))).map(d=>({value:d.id,label:d.name})):directType==='observe'?[...observationTargets(world,character).regions.map(r=>({value:r.id,label:r.name})),...observationTargets(world,character).people.map(c=>({value:c.id,label:c.name}))]:directType==='phone'?(world.objects||[]).filter(o=>o.kind==='phone'&&o.lifecycle==='active'&&(o.holder===character.id||o.region===regionOf(character))).map(o=>({value:o.id,label:o.label})):directType==='work'?[{value:'tidy',label:'整理桌面'},{value:'craft',label:'畫髮飾樣式'},{value:'craft-easy-challenge',label:'簡單設計挑戰（DC 8）'},{value:'craft-challenge',label:'設計挑戰（DC 12）'},{value:'craft-expert-challenge',label:'專家設計挑戰（DC 16）'},{value:'study-craft',label:'研究髮飾參考（限 Vera 房間）'}]:['say','shout','persuade'].includes(directType)?[...(['say','shout'].includes(directType)?[{value:'observer',label:'觀察者'}]:[]),...world.characters.filter(c=>c.id!==character.id&&canSee(world,character,regionOf(c))).map(c=>({value:c.id,label:c.name}))]:directType==='message'?world.characters.filter(c=>c.id!==character.id).map(c=>({value:c.id,label:c.name})):[]):[];
const usage=accountPlayer?.usage||(world?currentUsage(world):null);
const costUnresolved=unresolvedUsageRecovery||(accountPlayer?.unknownAccountingRanges??0)>0;
const effectivePrices=accountPlayer?.prices||world?.modelPrices||[];
const modelKey=mode==='demo'?'demo':`${mode}:${model}`;
const nextCalls=world&&mode!=='demo'?plannedCalls(world,Number(minutes),modelKey):0;
const keyStatus=modelKeys[mode==='openai'?'openai':'openrouter'];
const keyReady=keyStatus.configured&&!!keyStatus.expiresAt;
const adjudicationStatus=savedAdjudication?modelKeys[savedAdjudication.provider]:undefined;
const adjudicationReady=!!(savedAdjudication?.model.trim()&&adjudicationStatus?.configured&&adjudicationStatus.expiresAt);
const canAdvance=!!world&&!batchProgress&&!busy&&!pendingOperation&&!playing&&!signInRequired&&(mode==='demo'||!!(keyReady&&model.trim()&&adjudicationReady&&(!modelPreferences||modelRoleReady(modelPreferences,'npc')&&modelRoleReady(modelPreferences,'adjudication'))));
const evidenceEndpoint=worldEndpoint+(worldEndpoint.includes('?')?'&':'?')+'operationScope='+encodeURIComponent(evidenceScope.slice('quiet-hours:pending:'.length));
const accountSettingsPath=saveId&&accountScope?boundPath('/settings',accountScope,{save:saveId}):undefined;
const builtNote=environment.builtAtLabel!=='unknown'?` · 建置於 ${environment.builtAtLabel}`:'';
return <main>{batchProgress&&<p role="status" data-time-batch>{batchProgress}</p>}{pendingOperation&&<section className="panel" role="status"><p>有一個尚未確認結果的操作；重試會沿用原本的識別碼。</p><Button disabled={busy||signInRequired} onClick={()=>void act('resume')}>重試未完成操作</Button></section>}<header className="topbar"><button type="button" onClick={()=>setPage('observation')} className="brand"><span className="brand-mark"><Moon size={21}/></span><span>Quiet Hours<small>{saveName||'NPC 觀察室'}</small></span></button><div className="header-right">{templateNavigation}<span className="environment-badge" title={`目前環境與建置的提交短碼${builtNote}`}>{environment.caption}</span><span className="edition">{displayName} · 已登入</span><form method="post" action="/api/auth/logout" onSubmit={()=>{stopAuto();setKey('');}}><Button variant="ghost" type="submit">登出</Button></form></div></header>
{saveId&&<SaveNavigation owner={accountScope} saveId={saveId} view={page} onNavigate={()=>stopAuto()} onViewChange={next=>{setUtility(null);if(next==='analysis')setAnalysisFromProfile(false);setPage(next);}}/>}
{!saveId&&<nav className="world-navigation" aria-label="觀察室分頁">{([{id:'observation',label:'觀察'},{id:'settings',label:'設定'},{id:'analysis',label:'分析'}] as const).map(item=><Button key={item.id} variant={page===item.id?'default':'ghost'} aria-current={page===item.id?'page':undefined} onClick={()=>setPage(item.id)}>{item.label}</Button>)}</nav>}

{adjudicationFailure&&<AdjudicationFailureDetails failure={adjudicationFailure}/>}
{world&&<AcceptanceSceneStatus world={world}/>}
{modelPanel&&<ModelSettingsPanel originalAccountScope={accountScope?'account-operations:'+accountScope:undefined} saveId={saveId} onClose={()=>setModelPanel(false)} onSaved={()=>{void fetch('/api/model-settings?accountScope='+encodeURIComponent('account-operations:'+accountScope)+(saveId?'&save='+encodeURIComponent(saveId):'')).then(async r=>{if(!r.ok)return;const next=await r.json() as ModelSettingsView;if(!mountedRef.current||next.accountScope!=='account-operations:'+accountScope)throw Error('原帳號已變更');setModelPreferences(next);setModelKeys(next.modelKeys);if(next.effective.npc){setModel(next.effective.npc.model);setMode(previous=>previous==='demo'?previous:next.effective.npc!.provider==='openai'?'openai':'ai');}if(next.effective.adjudication)setWorld(previous=>previous?{...previous,adjudication:next.effective.adjudication}:previous);}).catch(()=>setError('模型設定已保存，但暫時無法讀回；原操作未重送。'));}}/>}

<div hidden={page!=='settings'||modelPreferences?.source==='account'||modelPreferences?.source==='save'}><section className="settings panel"><div><h2>決策方式</h2><p>規則模式可以直接使用。AI 先規劃活動，活動延續期間不再呼叫；新訊息或活動完成後重新規劃。OpenAI 直連使用你的 API 額度，與 ChatGPT 訂閱分開計費。</p></div><div className="settings-fields"><label>模式<Picker label="決策方式" value={mode} onChange={v=>{stopAuto();setMode(v);setKey('');setModel(modelPreferences?.effective.npc?.model||(v==='openai'?'gpt-6-luna':''));if(v!=='demo'&&(!modelPreferences||!modelRoleReady(modelPreferences,'npc')||!modelRoleReady(modelPreferences,'adjudication')))setModelPanel(true);}} disabled={busy} items={[{value:'demo',label:'規則模式'},{value:'openai',label:'OpenAI 直連'},{value:'ai',label:'OpenRouter AI'}]}/></label>{mode!=='demo'&&<><label>模型{mode==='openai'?<Picker label="OpenAI 模型" value={model} onChange={v=>{stopAuto();setModel(v);}} disabled={busy} items={[{value:'gpt-6-luna',label:'GPT-6 Luna · 推薦'},{value:'gpt-6.1-sol',label:'GPT-6.1 Sol'}]}/>:<input value={model} onChange={e=>{stopAuto();setModel(e.target.value);}} placeholder="供應商／模型名稱" autoComplete="off" disabled={busy}/>}</label><label>{mode==='openai'?'OpenAI':'OpenRouter'} API Key<input type="password" value={key} onChange={e=>{stopAuto();setKey(e.target.value);}} placeholder={keyReady?'已保存；貼上新 Key 可替換':'貼上你的 API Key，然後按保存'} autoComplete="off" maxLength={4096} disabled={busy||!keyStorageAvailable}/></label></>}</div>{mode!=='demo'&&<><div className="key-management"><span role="status">{!keyStorageAvailable?'Key 保存服務尚未設定完成':keyReady?`已設定 · 到期 ${new Date(keyStatus.expiresAt!).toLocaleString('zh-TW')}`:'尚未設定，或 Key 已到期／清除'}</span><div className="key-actions"><Button onClick={()=>void manageKey('set-model-key')} disabled={busy||signInRequired||!key.trim()||!keyStorageAvailable}>{keyReady?'替換 Key（14 天）':'保存 Key（14 天）'}</Button><Button variant="outline" onClick={()=>void manageKey('clear-model-key')} disabled={busy||signInRequired||!keyStatus.expiresAt}>清除已存 Key</Button><Button variant="ghost" onClick={()=>void refresh()} disabled={busy}>重新檢查 Key</Button></div></div><p className="settings-note">Key 會加密保存，供同一 GitHub 帳號在本站的瀏覽器共用，保存或替換成功後固定保存 14 天，讀取、使用、重新整理及重新登入不延長期限。登入仍為 24 小時，到期須重新登入才能繼續使用未到期的 Key。舊 Key 需重新保存才適用 14 天。保存後輸入欄會清空；重新整理可讀取設定狀態。登出只結束目前登入；清除會停止所有瀏覽器後續的模型呼叫，已送出的請求仍可能完成。<a href={mode==='openai'?'https://platform.openai.com/api-keys':'https://openrouter.ai/settings/keys'} target="_blank" rel="noreferrer">取得 API Key</a></p></>}</section></div>
<div hidden={page!=='settings'||modelPreferences?.source==='account'||modelPreferences?.source==='save'}><section className="settings panel" aria-label="天上意志裁定配置"><div><h2>天上意志 · 世界裁定</h2><p>裁定承接本輪行動提案，與 NPC 決策分開設定。裁定使用你的 API Key，與 NPC 共用玩家預算；保存設定不會呼叫模型。</p></div><div className="settings-fields"><label>裁定服務<select aria-label="裁定服務" value={adjudicationProvider} disabled={busy} onChange={e=>{stopAuto();setAdjudicationProvider(e.target.value as 'openai'|'openrouter');setAdjudicationKey('');}}><option value="openai">OpenAI</option><option value="openrouter">OpenRouter</option></select></label><label>裁定模型<input aria-label="裁定模型" value={adjudicationModel} onChange={e=>{stopAuto();setAdjudicationModel(e.target.value);}} autoComplete="off" maxLength={120} disabled={busy}/></label><label>裁定服務 API Key<input aria-label="裁定服務 API Key" type="password" value={adjudicationKey} onChange={e=>{stopAuto();setAdjudicationKey(e.target.value);}} autoComplete="off" maxLength={4096} placeholder="同服務可沿用已保存的 Key" disabled={busy||!keyStorageAvailable}/></label></div><div className="key-actions"><Button onClick={()=>void act('set-adjudication',undefined,undefined,{provider:adjudicationProvider,model:adjudicationModel.trim()})} disabled={busy||pendingOperation||signInRequired||!adjudicationModel.trim()}>保存裁定配置</Button><Button variant="outline" onClick={()=>void manageKey('set-model-key',adjudicationProvider)} disabled={busy||signInRequired||!adjudicationKey.trim()||!keyStorageAvailable}>{modelKeys[adjudicationProvider].configured?'替換裁定服務 Key（14 天）':'保存裁定服務 Key（14 天）'}</Button><Button variant="outline" onClick={()=>void manageKey('clear-model-key',adjudicationProvider)} disabled={busy||signInRequired||!modelKeys[adjudicationProvider].expiresAt}>清除裁定服務 Key</Button></div><p role="status">{savedAdjudication?`已保存裁定：${savedAdjudication.provider}／${savedAdjudication.model}`:'尚未保存裁定配置'} · {modelKeys[adjudicationProvider].configured&&modelKeys[adjudicationProvider].expiresAt?'此服務已有 Key，可與 NPC 共用':'此服務尚無有效 Key'}</p><p className="settings-note">Key 與 NPC 按服務共用，保存或替換成功後在本站加密保存 14 天；讀取、使用、重新整理及重新登入不延長期限。登入仍為 24 小時，舊 Key 需重新保存才適用 14 天；清除同一服務的 Key 也會停止使用該服務的 NPC 後續呼叫。</p></section></div>
{page!=='city'&&mode!=='demo'&&(!keyReady||!model.trim()||!adjudicationReady||!!modelPreferences&&(!modelRoleReady(modelPreferences,'npc')||!modelRoleReady(modelPreferences,'adjudication')))&&<p role="status" className="settings-note">AI 模式尚未就緒：請確認 NPC、天上意志的模型與有效 Key，再推進世界。<Button variant="ghost" onClick={()=>{stopAuto();setModelPanel(true);}}>完成模型與 Key 設定</Button></p>}<section className={`world-toolbar ${page==='analysis'?'analysis-toolbar':''}`} hidden={page==='city'||page==='profile'}>
 <div><div className="eyebrow">{page==='analysis'?'世界分析':'世界時間'} · DAY {world?Math.floor(world.minute/1440)+1:'01'} · 第 {world?.turn??0} 回合</div><div className="clock">{world?timeLabel(world.minute):'21:00'}<span>{page==='analysis'?'閱讀已保存的世界':'生活繼續。'}</span></div></div>
 <div className="advance"><Button variant="ghost" aria-expanded={utility==='runtime'} aria-controls="world-runtime" onClick={e=>openUtility('runtime',e.currentTarget)}><Radio size={14}/>{mode==='demo'?'規則模式':'AI 模式'} · 運行設定</Button>
 {saveId&&<Button variant="ghost" aria-expanded={utility==='save'} aria-controls="world-save-tools" onClick={e=>openUtility('save',e.currentTarget)}>管理存檔</Button>}
 {automatic?<Button variant="outline" onClick={()=>stopAuto('已暫停。正在處理的回合仍會完成。')}><Pause size={16}/>暫停自動</Button>:<Button variant="outline" disabled={!canAdvance} onClick={startAuto}><Play size={15}/>開始自動</Button>}
 <Button className="advance-button" disabled={!canAdvance||automatic} onClick={()=>act('advance')}>{busy?<Loader2 className="spin" size={17}/>:<Play size={16}/>} {busy?'處理中…':playing?'角色行動中…':'下一回合'}</Button></div>
 </section>
 {automatic&&<div role="status" className="running-status">自動推進中 · 每 {intervalSeconds} 秒推進 {minutes} 分鐘；離開分頁或發生錯誤時暫停。{(page==='profile'||page==='city')&&<Button variant="outline" onClick={()=>stopAuto('已暫停。正在處理的回合仍會完成。')}><Pause size={16}/>暫停自動</Button>}</div>}
 {saveId&&saveName&&accountScope&&world&&<section id="world-save-tools" hidden={utility!=='save'} className="panel world-tool-panel" aria-label="目前存檔管理"><div className="analysis-section-heading"><div><h2>管理「{saveName}」</h2><p>第 {world.turn} 回合已保存。可另存一份目前進度，繼續不同的發展。</p></div><Button variant="ghost" onClick={closeUtility}>關閉存檔管理</Button></div><SaveActions accountScope={accountScope} save={{id:saveId,name:saveName,version:worldVersion,turn:world.turn,minute:world.minute}} disabled={busy||pendingOperation||playing} onBeforeAction={()=>stopAuto()}/></section>}
 <section id="world-runtime" hidden={utility!=='runtime'&&page!=='settings'} className="panel world-tool-panel" aria-label="運行設定"><div className="analysis-section-heading"><div><h2>運行設定</h2><p>選擇決策方式與推進節奏。切換模式不會推進世界。</p></div>{page!=='settings'&&<Button variant="ghost" onClick={closeUtility}>關閉運行設定</Button>}</div>
 <div className="runtime-grid"><section aria-label="目前模型來源"><h3>模型與運行模式</h3><div className="space-y-2"><p>模型生效來源：{modelPreferences?modelSourceLabel[modelPreferences.source]:'正在讀取'}{modelPreferences?.effective.npc?` · NPC ${modelPreferences.effective.npc.model}`:''}{modelPreferences?.effective.adjudication?` · 天上意志 ${modelPreferences.effective.adjudication.model}`:''}</p><Button type="button" variant="outline" onClick={()=>{stopAuto();setModelPanel(true);}}>設定帳號／存檔模型</Button><Button type="button" variant="outline" disabled={busy||pendingOperation} onClick={()=>{stopAuto();setMode(modelPreferences?.effective.npc?.provider==='openrouter'?'ai':'openai');if(!modelPreferences||!modelRoleReady(modelPreferences,'npc')||!modelRoleReady(modelPreferences,'adjudication'))setModelPanel(true);}}>使用 AI 模式</Button><Button type="button" variant="outline" disabled={busy||pendingOperation} onClick={()=>{stopAuto();setMode('demo');}}>使用規則模式</Button></div><p className="hint">{mode==='demo'?'規則模式不呼叫模型。':'AI 模式使用已保存的模型與 Key，並受玩家預算限制。'} 運行模式與節奏僅供本次頁面使用；模型設定另行保存。</p></section><section className="automation" aria-label="自動運行與用量"><div className="automation-heading"><div><h2>{automatic?'自動運行中':'自動推進'}</h2><p>{automatic?`每 ${intervalSeconds} 秒推進 ${minutes} 分鐘，等待角色行動完成後繼續。`:'按開始才會自動推進；離開分頁或發生錯誤時暫停。'}</p></div><Button className="auto-button" variant={automatic?'outline':'default'} disabled={!automatic&&!canAdvance} onClick={()=>{if(automatic)stopAuto('已暫停。正在處理的回合仍會完成。');else startAuto();}}>{automatic?<Pause size={16}/>:<Play size={16}/>} {automatic?'暫停自動':'開始自動'}</Button></div><div className="automation-fields"><label>每回合推進<Picker label="推進時間間隔" value={minutes} onChange={setMinutes} disabled={busy||automatic||pendingOperation} items={[{value:'5',label:'5 分鐘'},{value:'15',label:'15 分鐘（3 步）'},{value:'30',label:'30 分鐘（6 步）'}]}/></label><label>推進速度<Picker label="自動推進速度" value={intervalSeconds} onChange={setIntervalSeconds} disabled={busy||automatic||pendingOperation} items={[{value:'10',label:'每 10 秒'},{value:'30',label:'每 30 秒'},{value:'60',label:'每分鐘'}]}/></label></div></section></div>
 {accountSettingsPath?<a className="settings-link" href={accountSettingsPath} onClick={()=>stopAuto()}>到帳號設定調整模型、預算與單價</a>:<Button variant="link" onClick={()=>{closeUtility();setPage('settings');}}>調整預算與價格</Button>}
 {world&&<details className="advanced-tools"><summary>進階：驗收場景</summary><AcceptanceSceneControls world={world} disabled={busy||pendingOperation||playing||automatic||signInRequired} onSwitch={operation=>act(operation)}/></details>}
 </section>
 {world&&<section hidden={page!=='settings'||!!accountSettingsPath} className="panel world-tool-panel"><h2>玩家預算</h2><BudgetControls key={`${limits.calls}:${limits.tokens}`} limits={limits} automatic={automatic} disabled={busy||pendingOperation||signInRequired} onApply={next=>act('set-budget',next)}/>{(limits.calls===null||limits.tokens===null)&&<p className="usage-note">玩家預算含無上限：手動與自動共用用量，可能產生 API 費用。</p>}</section>}

{page==='observation'&&saveId&&world?.turn===0&&<aside className="journey-note turn-zero" role="status"><strong>世界已保存 · 第 0 回合</strong><p>人物與場景已就位。先看看此刻的世界；準備好後按「下一回合」，才會開始生活。離開後可從存檔頁繼續。</p></aside>}
<div className="feedback" hidden={page!=='observation'&&!error&&!notice} aria-live="polite">{error?<div className="error" role="alert">{error}<Button variant="link" onClick={()=>showAnalysis('traces')}>分析詳情</Button><Button variant="ghost" onClick={refresh} disabled={busy}>重新載入</Button>{signInRequired&&<a href={signInPath} target="_top" className="auth-retry">用 GitHub 重新登入</a>}</div>:notice?<span><Check size={14}/>{notice}</span>:<span>{mode==='demo'?'規則模式：不呼叫模型。':'AI 模式：角色自行決定，活動延續時不重問。'}每一步都會保存。</span>}</div>
{page==='observation'&&world&&usage&&<p className="compact-cost">{costUnresolved&&<>中斷操作用量待核對，費用有未確認範圍 · </>}{accountPlayer?'帳號（含人物製作）':'本世界'}本小時 {usage.calls} 次 AI 呼叫 · {costSummary(usage).hour.complete&&!costUnresolved?`估算 USD ${costSummary(usage).hour.knownUsd.toPrecision(3)}`:costSummary(usage).hour.knownUsd>0?`部分估算 USD ${costSummary(usage).hour.knownUsd.toPrecision(3)}`:'費用未知／無法完整估算'} <Button variant="link" onClick={()=>showAnalysis('usage')}>費用與停止詳情</Button></p>}
{page==='analysis'&&<section className="analysis-intro"><div><h1 ref={analysisHeading} tabIndex={-1}>理解這個世界</h1><p>從人物近況開始，依需要查看生活紀錄、費用或操作來源。</p></div><Button variant="outline" onClick={()=>setPage(analysisFromProfile?'profile':'observation')}>{analysisFromProfile?'返回人物檔案':'返回觀察'}</Button></section>}
{page==='analysis'&&<nav className="analysis-nav" aria-label="分析分類">{([
 {id:'character',label:'人物分析',note:'近況、需求與內在生活'},
 {id:'world',label:'世界紀錄',note:'行動、感知與物件'},
 {id:'usage',label:'用量與費用',note:'預算、估算與停止原因'},
 {id:'traces',label:'操作追溯',note:'模型決策與技術證據'}
] as const).map(item=><button key={item.id} aria-label={item.label} aria-pressed={analysisSection===item.id} aria-controls={'analysis-'+item.id} onClick={()=>setAnalysisSection(item.id)}><strong>{item.label}</strong><span>{item.note}</span></button>)}</nav>}
<div id="analysis-usage" className="analysis-usage" hidden={page!=='analysis'||analysisSection!=='usage'}>{world&&usage&&<section className="panel world-tool-panel" aria-label="玩家用量"><div className="analysis-section-heading"><h2>本小時用量</h2>{accountSettingsPath?<a className="settings-link" href={accountSettingsPath} onClick={()=>stopAuto()}>到帳號設定調整預算與單價</a>:<Button variant="outline" onClick={()=>setPage('settings')}>調整預算與價格</Button>}</div><div className="usage-grid"><div><span>本小時 AI 呼叫</span><strong>{usage.calls} <small>/ {limits.calls===null?'無上限':limits.calls}</small></strong></div><div><span>已回報 token</span><strong>{(usage.inputTokens+usage.outputTokens).toLocaleString()} <small>/ {limits.tokens===null?'無上限':limits.tokens.toLocaleString()}</small></strong></div><div><span>延續活動省下的決策</span><strong>{world?.aiUsage?.savedDecisions??0} <small>次</small></strong></div><div><span>下一回合預計詢問</span><strong>{nextCalls} <small>名角色</small></strong></div></div><p className="usage-note">輸入 {usage.inputTokens.toLocaleString()} · 輸出 {usage.outputTokens.toLocaleString()} · 累計 {usage.totalCalls} 次 AI 呼叫。{usage.unknownCalls>0?`另有 ${usage.unknownCalls} 次未收到供應商用量。`:''} 到達門檻後停止新請求，單次回覆可能超過 token 門檻。規則模式不使用 API。</p></section>}</div>
<div hidden={page!=='analysis'||analysisSection!=='usage'}>{world&&<section className="panel analysis-notice" aria-label="付費方與限制"><p>玩家自付聊天：使用自己的模型 Key；手動、自動與回想後續接共用玩家預算。供應商額度／速率及技術期限仍生效。</p><p>站主共用回想服務：Embedding、索引與搜尋有獨立站主預算；玩家選無上限也不會解除。{ownerUsage.enabled===false?'目前未啟用。':ownerUsage.ownerUnits?`本月（${ownerUsage.month} UTC）保守用量：Embedding ${ownerUsage.ownerUnits.embedding}、索引 ${ownerUsage.ownerUnits.index}、搜尋 ${ownerUsage.ownerUnits.search}；已知 Embedding 輸入 ${ownerUsage.knownEmbeddingInputTokens??0} tokens。這些用量不是玩家聊天費用。`:'用量暫時未知。'}</p></section>}
</div><div hidden={(page!=='settings'||!!accountSettingsPath)&&(page!=='analysis'||analysisSection!=='usage')}>{world&&usage&&<CostPanel unresolvedUsageRecovery={costUnresolved} view={page==='settings'?'settings':'analysis'} key={`${mode}:${model}:${effectivePrices.map(p=>p.id).join(',')}`} usage={usage} prices={effectivePrices} provider={mode==='openai'?'openai':'openrouter'} model={model} disabled={busy||pendingOperation||signInRequired} onApply={price=>act('set-price',undefined,price)}/>}
</div><div hidden={page!=='analysis'||analysisSection!=='usage'}>{world&&usage&&<ForecastPanel key={`${world?.contextId||'primary'}:${mode}:${model}:${intervalSeconds}:${minutes}:${effectivePrices.map(p=>p.id).join(',')}`} usage={currentUsage(world)} minute={world.minute} automatic={automatic} provider={mode==='demo'?'demo':mode==='openai'?'openai':'openrouter'} model={model} price={effectivePrices.find(p=>p.provider===(mode==='openai'?'openai':'openrouter')&&p.model===model)}/>}
</div>
<div id="analysis-traces" className="analysis-traces" hidden={page!=='analysis'||analysisSection!=='traces'}><p className="analysis-context-note">僅供觀察者核對已發生的操作。原始識別碼與技術紀錄保留在這裡，內容不會交給 NPC。</p>{page==='analysis'&&evidenceScope&&<OperationEvidenceDetails worldEndpoint={evidenceEndpoint} key={`${evidenceScope}:${world?.contextId}`} evidence={operationEvidence} recent={recentOperations} disabled={busy||pendingOperation||playing||automatic||signInRequired} onReplay={payload=>act('advance',undefined,undefined,undefined,payload)}/>}
{page==='analysis'&&world&&evidenceScope&&<DecisionTraces worldEndpoint={evidenceEndpoint} key={`trace:${evidenceScope}:${world.contextId}:${traceFocusOperationId||operationEvidence?.operationId}`} operationId={traceFocusOperationId||operationEvidence?.operationId} lastResponse={traceResponseStatus}/>}
</div>
{world&&<div className="analysis-workspace" id="analysis-world" hidden={page!=='analysis'||analysisSection!=='world'}><WorldAnalysis world={world}/></div>}
{world&&character&&<div className="analysis-workspace" id="analysis-character" hidden={page!=='analysis'||analysisSection!=='character'}><CharacterAnalysis world={world} character={character} onSelect={selectCharacter} onProfile={()=>setPage('profile')} busy={busy||pendingOperation||playing||signInRequired} onEnableMental={items=>act('enable-mental-energy',undefined,undefined,undefined,undefined,undefined,undefined,items)} onEnableNeeds={setup=>act('enable-body-needs',undefined,undefined,undefined,undefined,undefined,setup)}/></div>}




{page==='profile'&&world&&character&&<CharacterProfile world={world} key={character.id} character={character} onBack={()=>setPage('observation')} onInteract={interactWithCharacter} onAnalysis={showCharacterAnalysis} disabled={busy||pendingOperation||signInRequired} onAdoptAttributes={world.acceptance?undefined:setup=>act(character.attributes?'set-character-sense-limits':'adopt-character-attributes',undefined,undefined,undefined,undefined,{characterSetup:setup,target:character.id,expectedVersion:versionRef.current})}/>}{!world?<section className="panel loading"><Loader2 className={busy?'spin':''}/><p>{busy?'正在讀取你的世界…':'世界尚未載入'}</p></section>:page!=='city'&&<div className="workspace" hidden={page!=='observation'}><div className="main-column"><div hidden={page!=='observation'}><section className="world-view panel"><div className="section-head"><h1>此刻的世界</h1><span><Eye size={15}/>觀察者視角</span></div><PixelWorld world={world} selected={activeCharacterId} onSelect={selectCharacter} onPlayingChange={handlePlayingChange}/><div className="world-footer"><span>{world.characters.length} 個角色 · {locations.length} 個地點</span><span><Clock size={14}/>已走過 {world.turn} 個回合{saveId&&(originalOpeningAvailable?<a href={boundPath('/new',accountScope,{restart:saveId})} onClick={()=>stopAuto()}>從原始開局另建世界</a>:<small>原始開局不可用；既有進度仍可續玩。</small>)}</span></div></section>
<RoundLog world={world} selected={activeCharacterId}/></div></div>
<aside className="side-column"><div className="status-wrap" hidden={page!=='observation'}><CharacterStatusBoard world={world} selected={activeCharacterId} onSelect={selectCharacter}/></div><section className="character panel character-focus" hidden={page!=='observation'} aria-label="角色近況">{character&&<><div className="identity"><Initial c={character}/><div><h2>{character.name}</h2><span>{whereabouts(world,character)}</span></div><span className="status-mood">{character.mood}</span></div><p className="focus-activity">{character.activity||'活動內容未記錄'}{activityStatus(world,character)&&<small> · {activityStatus(world,character)}</small>}</p><dl className="focus-feelings"><dt>本人的感受</dt><dd>{[feelingOf(character),...(character.needs?bodyFeelings(character).map(item=>item.feeling):[])].filter(Boolean).join('；')||'精神電量與身體需求尚未啟用。'}</dd>{pendingInterventions(world,character).length>0&&<><dt>等待下一回合回應</dt><dd>{pendingInterventions(world,character).at(-1)?.text}</dd></>}</dl><p className="hint">角色只知道自己的感受；數值只給觀察者看。</p><div className="profile-actions"><Button onClick={interactWithCharacter}>互動</Button><Button variant="outline" onClick={()=>setPage('profile')}>人物檔案</Button><Button variant="outline" onClick={showCharacterAnalysis}>查看角色分析</Button></div></>}</section>{page==='observation'&&!world.configuration&&character?.id==='owner'&&<section id="owner-control" tabIndex={-1} className="intervene panel" aria-label="店主直接控制"><div className="section-head"><h2>店主直接控制</h2><Brain size={17}/></div><p className="hint">{character.control?.mode==='taken-over'?'由你暫時控制。'+(character.control?.pending?'已保存指定，等待下一回合。':character.control?.active?'正在執行指定活動；完成後待命。':'店主待命，其他角色繼續生活。'):character.control?.pending?'已保存單次指定，等待下一回合。':character.control?.active?'正在執行指定活動；完成後恢復自主生活。':'目前自主生活。單次指定會優先取代下一個活動，保留意圖。'}</p><Button type="button" variant="outline" disabled={busy||pendingOperation||playing||signInRequired} onClick={()=>void act(character.control?.mode==='taken-over'?'return-control':'takeover')}>{character.control?.mode==='taken-over'?'交還控制權':'暫時接管店主'}</Button>{character.control?.mode==='taken-over'&&<p className="hint">交還會結束指定活動、取消尚未執行的指定；保留意圖與實際經歷，下回合重新自主判斷。</p>}<form onSubmit={e=>{e.preventDefault();void act('direct');}}><label>指定行動<Picker label="店主指定行動" value={directType} onChange={v=>{setDirectType(v as Action['type']);setDirectTarget('');setDirectContent('');}} disabled={busy||pendingOperation||playing} items={[{value:'phone',label:'手機資料操作'},{value:'rest',label:'休息'},{value:'observe',label:'主動查探'},{value:'work',label:'工作'},{value:'move',label:'移動'},{value:'door',label:'開關門'},{value:'say',label:'說話'},{value:'shout',label:'大聲說話'},{value:'persuade',label:character.attributes?'說服（d100）':'說服（D20）'},{value:'message',label:'傳訊息'},{value:'reflect',label:'思考'}]}/></label>{directTargets.length>0&&<label>對象／工作<Picker label="店主行動對象" value={directTarget} onChange={setDirectTarget} disabled={busy||pendingOperation||playing} items={directTargets}/></label>}{directType==='observe'&&<label>查探方式<Picker label="查探方式" value={directContent||'sight'} onChange={setDirectContent} disabled={busy||pendingOperation||playing} items={[{value:'sight',label:'仔細查看'},{value:'hearing',label:'專注聆聽'}]}/></label>}{directType==='door'&&<label>門的操作<Picker label="門的操作" value={directContent} onChange={setDirectContent} disabled={busy||pendingOperation||playing} items={[{value:'open',label:'打開'},{value:'close',label:'關上'}]}/></label>}{['phone','say','shout','persuade','message','reflect'].includes(directType)&&<><label htmlFor="direct-content">{directType==='phone'?'手機操作JSON（例如 {"collection":"memos","operation":"list"}）':'指定內容'}</label><textarea id="direct-content" value={directContent} onChange={e=>setDirectContent(e.target.value)} maxLength={500} rows={3}/></>}<Button type="submit" variant="outline" disabled={busy||pendingOperation||playing||signInRequired||(directTargets.length>0&&!directTargets.some(t=>t.value===directTarget))||(directType==='door'&&(!directTarget||!['open','close'].includes(directContent)))||(['phone','say','shout','persuade','message','reflect'].includes(directType)&&!directContent.trim())}>單次指定下一行動</Button><p className="hint">這是直接選定店主行動。休息、工作、查探及思考持續約 60 分鐘。查探只取得當前線索，相同方法與條件沿用結果；要靠近請先移動，要看門後請先開門。一般介入仍讓 NPC 自行判斷。</p></form></section>}
<section className="intervene panel" hidden={page!=='observation'}><div className="section-head"><h2>輕輕介入</h2><MessageSquare size={17}/></div><form onSubmit={e=>{e.preventDefault();void act('intervene');}}><label>誰會知道？<Picker label="事件知情對象" value={interventionTarget} onChange={setTarget} disabled={busy} items={[...world.characters.map(c=>({value:c.id,label:`只對 ${c.name} 說`})),{value:'all',label:'所有人的共同事件'}]}/></label><label htmlFor="intervention">你想說的話或發生的事</label><textarea id="intervention" value={text} onChange={e=>setText(e.target.value)} placeholder={world.configuration?'例如：窗外開始下雨了。':'例如：咖啡館明天下午有一場小型手作活動。'} maxLength={500} rows={3}/><div className="intervene-bottom"><span>{text.length} / 500</span><Button type="submit" variant="outline" disabled={busy||pendingOperation||playing||!text.trim()}>加入事件</Button></div><p className="hint">{world.configuration?'':'規則模式支援「回家」「去咖啡館」「休息」等基本要求。'}AI 模式會自行選擇行動或回覆；單獨說的話只讓該角色知情，要再推進一回合才會看到反應。</p></form></section></aside></div>}
<footer className="bottom-note">QUIET HOURS <span>{world?.configuration?'規則模式不呼叫模型，AI 模式才會產生模型決策':'非小說正史的測試場景 · 規則模式使用固定範例，AI 模式才會產生模型決策'}</span><span>{environment.caption}{builtNote}</span></footer></main>;}

