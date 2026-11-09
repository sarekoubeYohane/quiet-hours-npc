import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getGitHubUser } from '@/lib/auth';
import SaveNavigation from '@/components/save-navigation';
export const dynamic='force-dynamic';
export default async function AccountSettingsPage(){
  if(!await getGitHubUser())redirect('/');
  return <main><h1>設定</h1><SaveNavigation/><section className="panel" style={{padding:24}}><p>世界的規則模式及模型設定可在選定存檔後調整。</p><Link href="/">選擇存檔</Link></section></main>;
}
