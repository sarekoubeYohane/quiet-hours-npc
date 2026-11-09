import {requireNavigationOwner} from '@/lib/bound-navigation-server';
import { redirect } from 'next/navigation';
import { getGitHubUser,githubSignInPath } from '@/lib/auth';
import { currentEnvironment } from '@/lib/environment';
import { bindWorldSave,listWorldSaves } from '@/lib/world-saves';
import WorldApp from '@/components/world-app';
export const dynamic='force-dynamic';
export default async function ObservePage({searchParams}:{searchParams:Promise<{save?:string;view?:string;owner?:string}>}) {
  const user=await getGitHubUser();if(!user)redirect('/');
  const query=await searchParams;requireNavigationOwner(user.userId,query.owner,'/observe',{save:query.save,view:query.view});if(!query.save||typeof query.save!=='string')redirect('/');
  try{await bindWorldSave(user.userId,new Request('https://internal.invalid/?save='+encodeURIComponent(query.save)));}catch{redirect('/');}
  const save=(await listWorldSaves(user.userId)).find(save=>save.id===query.save);
  if(!save)redirect('/');
  return <WorldApp key={user.userId+':'+save.id+':'+(query.view||'observation')} accountScope={user.userId} saveId={save.id} saveName={save.name} originalOpeningAvailable={save.originalOpeningAvailable} initialView={query.view==='analysis'||query.view==='settings'?query.view:'observation'} signInPath={githubSignInPath} displayName={user.displayName} environment={currentEnvironment()}/>;
}
