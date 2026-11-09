import Link from 'next/link';
import SaveNavigation from '@/components/save-navigation';
import { redirect } from 'next/navigation';
import { getGitHubUser } from '@/lib/auth';
import SceneTemplateEditor from '@/components/scene-template-editor';

export const dynamic = 'force-dynamic';

export default async function SceneTemplatesPage({searchParams}:{searchParams:Promise<{save?:string;returnTo?:string}>}) {
  if (!await getGitHubUser()) redirect('/');
  const params=await searchParams;const save=params.save;const returnTo=typeof params.returnTo==='string'&&/^\/new\?draft=[0-9a-f-]{36}$/.test(params.returnTo)?params.returnTo:undefined;
  return <main>
    <SaveNavigation saveId={typeof save==='string'?save:undefined}/>
    {returnTo&&<Link href={returnTo}>返回本次開局（保留已選內容）</Link>}
    <SceneTemplateEditor/>
  </main>;
}
