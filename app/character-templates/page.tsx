import Link from 'next/link';
import { redirect } from 'next/navigation';
import CharacterTemplateEditor from '@/components/character-template-editor';
import { getGitHubUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function CharacterTemplatesPage() {
  const user = await getGitHubUser().catch(() => null);
  if (!user) redirect('/');
  return (
    <main>
      <header className="topbar">
        <h1>人物範本</h1>
        <Link className="auth-retry" href="/">返回觀察室</Link>
      </header>
      <div className="pt-6"><CharacterTemplateEditor /></div>
    </main>
  );
}
