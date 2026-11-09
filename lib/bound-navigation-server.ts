import {redirect} from 'next/navigation';
import {boundPath,navigationOwnerMatches} from './bound-navigation';
export function requireNavigationOwner(actualOwner:string,expectedOwner:unknown,path:string,params:Record<string,string|undefined>={}){
  if(expectedOwner===undefined)redirect(boundPath(path,actualOwner,params));
  if(!navigationOwnerMatches(actualOwner,expectedOwner))redirect('/?accountChanged=1');
}
