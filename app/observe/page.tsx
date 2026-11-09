import { redirect } from 'next/navigation';
import { getGitHubUser,githubSignInPath } from '@/lib/auth';
import { currentEnvironment } from '@/lib/environment';
import { bindWorldSave,listWorldSaves } from '@/lib/world-saves';
import WorldApp from '@/components/world-app';
export const dynamic='force-dynamic';
export default async function ObservePage({searchParams}:{searchParams:Promise<{save?:string;view?:string}>}) {
  const user=await getGitHubUser();if(!user)redirect('/');
  const query=await searchParams;if(!query.save||typeof query.save!=='string')redirect('/');
  try{await bindWorldSave(user.userId,new Request('https://internal.invalid/?save='+encodeURIComponent(query.save)));}catch{redirect('/');}
  const save=(await listWorldSaves(user.userId)).find(save=>save.id===query.save);
  if(!save)redirect('/');
  return <WorldApp key={save.id+':'+(query.view||'observation')} saveId={save.id} saveName={save.name} initialView={query.view==='analysis'||query.view==='settings'?query.view:'observation'} signInPath={githubSignInPath} displayName={user.displayName} environment={currentEnvironment()}/>;
}
