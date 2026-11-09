import ModelSettingsPanel from '@/components/model-settings-panel';
import { redirect } from 'next/navigation';
import { getGitHubUser } from '@/lib/auth';
import SaveNavigation from '@/components/save-navigation';
export const dynamic='force-dynamic';
export default async function AccountSettingsPage(){
  if(!await getGitHubUser())redirect('/');
  return <main><h1>設定</h1><SaveNavigation/><ModelSettingsPanel/></main>;
}
