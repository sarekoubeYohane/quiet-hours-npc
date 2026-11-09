import SaveNavigation from '@/components/save-navigation';
import { redirect } from 'next/navigation';
import { getGitHubUser } from '@/lib/auth';
import SceneTemplateEditor from '@/components/scene-template-editor';

export const dynamic = 'force-dynamic';

export default async function SceneTemplatesPage({searchParams}:{searchParams:Promise<{save?:string}>}) {
  if (!await getGitHubUser()) redirect('/');
  const save=(await searchParams).save;
  return <main>
    <SaveNavigation saveId={typeof save==='string'?save:undefined}/>
    <SceneTemplateEditor/>
  </main>;
}
