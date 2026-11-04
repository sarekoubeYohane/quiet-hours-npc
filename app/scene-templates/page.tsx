import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getGitHubUser } from '@/lib/auth';
import SceneTemplateEditor from '@/components/scene-template-editor';

export const dynamic = 'force-dynamic';

export default async function SceneTemplatesPage() {
  if (!await getGitHubUser()) redirect('/');
  return <main>
    <nav className="world-navigation" aria-label="場景範本導覽"><Link href="/">回到觀察室</Link></nav>
    <SceneTemplateEditor/>
  </main>;
}
