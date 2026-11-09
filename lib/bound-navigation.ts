import {saveUuidPattern} from './save-identities';
/** The owner is an expected identity, never authorization to read that owner's data. */
export function boundPath(path:string,owner?:string,params:Record<string,string|undefined>={}) {
  if(!path.startsWith('/')||path.startsWith('//'))throw Error('只允許本站導覽。');
  const url=new URL(path,'https://navigation.invalid');
  for(const [key,value] of Object.entries(params))if(typeof value==='string')url.searchParams.set(key,value);
  if(owner)url.searchParams.set('owner',owner);
  return url.pathname+url.search+url.hash;
}
export function navigationOwnerMatches(owner:string,expected:unknown){return expected===undefined||expected===owner;}
/** A return link may only resume one local opening draft in the same account. */
export function openingReturnPath(value:unknown,owner:string) {
  if(typeof value!=='string'||!value.startsWith('/new?'))return;
  const url=new URL(value,'https://navigation.invalid');
  if(url.pathname!=='/new'||url.hash||url.searchParams.getAll('draft').length!==1||url.searchParams.getAll('owner').length>1||[...url.searchParams.keys()].some(key=>!['draft','owner'].includes(key)))return;
  const draft=url.searchParams.get('draft');if(!draft||!saveUuidPattern.test(draft))return;
  const expected=url.searchParams.get('owner');if(expected!==null&&expected!==owner)return;
  return boundPath('/new',owner,{draft});
}
