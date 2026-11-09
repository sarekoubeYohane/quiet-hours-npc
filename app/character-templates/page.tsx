import Link from 'next/link';
import { redirect } from 'next/navigation';
import SaveNavigation from '@/components/save-navigation';
import CharacterDraftEditor from '@/components/character-draft-editor';
import CharacterTemplateEditor from '@/components/character-template-editor';
import { getGitHubUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function CharacterTemplatesPage({ searchParams }: { searchParams: Promise<{ save?: string }> }) {
  const user = await getGitHubUser().catch(() => null);
  if (!user) redirect('/');
  return (
    <main>
      <header className="topbar">
        <h1>人物範本</h1>
        <Link className="auth-retry" href="/">返回觀察室</Link>
      </header>
      <SaveNavigation saveId={(await searchParams).save} />
      <div className="pt-6"><CharacterDraftEditor /><details className="mt-6"><summary>文字範本來源庫（與建角草稿分開）</summary><CharacterTemplateEditor /></details></div>
    </main>
  );
}
