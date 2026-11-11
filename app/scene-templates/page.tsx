import {openingReturnPath} from '@/lib/bound-navigation';
import {requireNavigationOwner} from '@/lib/bound-navigation-server';
import Link from 'next/link';
import SaveNavigation from '@/components/save-navigation';
import { redirect } from 'next/navigation';
import { getGitHubUser } from '@/lib/auth';
import SceneTemplateEditor from '@/components/scene-template-editor';

export const dynamic = 'force-dynamic';

export default async function SceneTemplatesPage({searchParams}:{searchParams:Promise<{save?:string;returnTo?:string;owner?:string}>}) {
  const user=await getGitHubUser();if (!user) redirect('/');
  const params=await searchParams;requireNavigationOwner(user.userId,params.owner,'/scene-templates',{save:params.save,returnTo:params.returnTo});const save=params.save;const returnTo=openingReturnPath(params.returnTo,user.userId);
  return <main className="authoring-page">
    <SaveNavigation owner={user.userId} saveId={typeof save==='string'?save:undefined}/>
    {returnTo&&<Link href={returnTo}>返回本次開局（保留已選內容）</Link>}
    <SceneTemplateEditor returnTo={returnTo} key={user.userId} originalAccountScope={'account-operations:'+user.userId}/>
  </main>;
}
