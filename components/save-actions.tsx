'use client';
import {useCallback,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {useRouter} from 'next/navigation';
import type {WorldSave} from '@/lib/world-saves';
import type {SaveManagementInput,SaveOperationResult} from '@/lib/save-management';
import {Button} from './ui/button';

type Source=Pick<WorldSave,'id'|'name'|'version'|'turn'|'minute'>;
const changed='quiet-hours:save-operation';
const copyNameKey=(accountScope:string,saveId:string)=>'quiet-hours:saves:name:'+JSON.stringify([accountScope,saveId]);
function useSaveOperation(accountScope:string,onBefore?:()=>void) {
  const storageKey='quiet-hours:saves:pending:'+accountScope;
  const router=useRouter(),busyRef=useRef(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const subscribe=useCallback((listener:()=>void)=>{window.addEventListener(changed,listener);return()=>window.removeEventListener(changed,listener);},[]);
  const raw=useSyncExternalStore(subscribe,()=>sessionStorage.getItem(storageKey),()=>null);
  const pending=useMemo(()=>{try{return raw?JSON.parse(raw) as SaveManagementInput:null;}catch{return null;}},[raw]);
  function persist(value:SaveManagementInput|null){if(value)sessionStorage.setItem(storageKey,JSON.stringify(value));else sessionStorage.removeItem(storageKey);window.dispatchEvent(new Event(changed));}
  async function finish(result:SaveOperationResult){
    if(result.operation==='delete'&&result.externalCleanup==='pending')persist(pending);
    else persist(null);
    window.dispatchEvent(new Event('quiet-hours:saves-changed'));
    router.push(result.operation==='copy'?'/observe?save='+encodeURIComponent(result.save.id):'/');
  }
  async function submit(input:SaveManagementInput,recover=false) {
    if(busyRef.current)return;
    const existing=sessionStorage.getItem(storageKey);
    if(existing&&!recover&&existing!==JSON.stringify(input)){setError('請先恢復上一個存檔操作。');return;}
    if(input.operation==='copy')sessionStorage.setItem(copyNameKey(accountScope,input.saveId),input.name);
    busyRef.current=true;onBefore?.();setBusy(true);setError('');persist(input);
    try {
      if(recover){const response=await fetch('/api/saves?operationId='+encodeURIComponent(input.operationId),{credentials:'same-origin'});const value=await response.json() as {operation?:SaveOperationResult;error?:string};if(!response.ok)throw Error(value.error||'尚無法讀取原操作。');if(value.operation&&!(value.operation.operation==='delete'&&value.operation.externalCleanup==='pending')){await finish(value.operation);return;}}
      const response=await fetch('/api/saves',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
      const value=await response.json() as SaveOperationResult&{error?:string};
      if(!response.ok){if([400,403,404,409,410].includes(response.status))persist(null);throw Error(value.error||'尚無法確認操作結果；請恢復原操作。');}
      // Keep the exact confirmed request when external cleanup needs recovery.
      if(value.operation==='delete'&&value.externalCleanup==='pending'){persist(input);window.dispatchEvent(new Event('quiet-hours:saves-changed'));router.push('/');return;}
      await finish(value);
    }catch(cause){setError((input.operation==='copy'?`另存名稱「${input.name}」仍保留。 `:'')+(cause instanceof Error?cause.message:'連線中斷；輸入與原操作仍保留，請恢復原操作。'));}
    finally{busyRef.current=false;setBusy(false);}
  }
  return {pending,busy,error,submit};
}
export function SaveOperationRecovery({accountScope}:{accountScope:string}) {
  const {pending,busy,error,submit}=useSaveOperation(accountScope);
  if(!pending)return error?<p role="alert">{error}</p>:null;
  return <section className="panel" style={{padding:20}} aria-label="恢復存檔操作"><p>上一個存檔操作尚待確認。恢復會讀取原操作，不另建副本或重送模型。若故事已刪除，剩餘的外部記憶索引清理也會沿原操作完成。</p><Button disabled={busy} onClick={()=>void submit(pending,true)}>恢復原存檔操作</Button>{error&&<p role="alert">{error}</p>}</section>;
}
export default function SaveActions({save,accountScope,disabled=false,onBeforeAction}:{save:Source;accountScope:string;disabled?:boolean;onBeforeAction?:()=>void}) {
  const nameKey=copyNameKey(accountScope,save.id);
  const subscribe=useCallback((listener:()=>void)=>{window.addEventListener(changed,listener);return()=>window.removeEventListener(changed,listener);},[]);
  const storedName=useSyncExternalStore(subscribe,()=>sessionStorage.getItem(nameKey),()=>null);
  const name=storedName??save.name+' 副本';
  const setName=(value:string)=>{sessionStorage.setItem(nameKey,value);window.dispatchEvent(new Event(changed));};
  const {pending,busy,error,submit}=useSaveOperation(accountScope,onBeforeAction);
  const ownPending=pending?.saveId===save.id?pending:null;
  const locked=disabled||busy||!!pending;
  return <section aria-label={save.name+'的存檔管理'} style={{display:'grid',gap:12,padding:'16px 0'}}>
    <label>另存名稱<input aria-label={save.name+'的另存名稱'} maxLength={80} value={ownPending?.operation==='copy'?ownPending.name:name} disabled={locked} onChange={event=>setName(event.target.value)}/></label>
    <div style={{display:'flex',gap:12,flexWrap:'wrap'}}><Button variant="outline" disabled={locked||!name.trim()} onClick={()=>void submit({operation:'copy',operationId:crypto.randomUUID(),saveId:save.id,expectedVersion:save.version,name:name.trim()})}>另存目前進度</Button>
    <Button variant="destructive" disabled={locked} onClick={()=>{onBeforeAction?.();if(window.confirm(`永久刪除「${save.name}」？\n已走過 ${save.turn} 個回合，世界時間 ${save.minute} 分鐘。\n這份世界將永久刪除，無法復原；其他存檔、人物與場景保留。`))void submit({operation:'delete',operationId:crypto.randomUUID(),saveId:save.id,expectedVersion:save.version});}}>刪除存檔</Button>
    {ownPending&&<Button disabled={busy} onClick={()=>void submit(ownPending,true)}>恢復此存檔操作</Button>}</div>{error&&<p role="alert">{error} 請重新讀取存檔進度後核對；未保存的名稱仍保留。</p>}
  </section>;
}
