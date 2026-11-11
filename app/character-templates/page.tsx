import {openingReturnPath} from '@/lib/bound-navigation';
import {requireNavigationOwner} from '@/lib/bound-navigation-server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import SaveNavigation from '@/components/save-navigation';
import SiteHeader from '@/components/site-header';
import { currentEnvironment } from '@/lib/environment';
import CharacterDraftEditor from '@/components/character-draft-editor';
import CharacterTemplateEditor from '@/components/character-template-editor';
import { getGitHubUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function CharacterTemplatesPage({ searchParams }: { searchParams: Promise<{ save?: string;returnTo?:string;owner?:string }> }) {
  const user = await getGitHubUser().catch(() => null);
  if (!user) redirect('/');
  const params=await searchParams;requireNavigationOwner(user.userId,params.owner,'/character-templates',{save:params.save,returnTo:params.returnTo});const returnTo=openingReturnPath(params.returnTo,user.userId);
  return (
    <main className="authoring-page">
      <SiteHeader environment={currentEnvironment()} displayName={user.displayName}/>
      <SaveNavigation owner={user.userId} saveId={(await searchParams).save} />
      <h1 className="page-title">人物</h1>
      {returnTo&&<Link href={returnTo}>返回本次開局（保留已選內容）</Link>}
      <div className="pt-6"><CharacterDraftEditor returnTo={returnTo} key={'drafts:'+user.userId} originalAccountScope={'account-operations:'+user.userId}/><details className="mt-6"><summary>管理人物範本（進階）</summary><p className="hint">範本只是可重複使用的文字來源，不能直接放進世界；要用時在上方「或從範本開始」複製成草稿。</p><CharacterTemplateEditor key={'templates:'+user.userId} originalAccountScope={'account-operations:'+user.userId}/></details></div>
    </main>
  );
}
