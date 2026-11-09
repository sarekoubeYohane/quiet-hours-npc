import PlayerAccountSettings from '@/components/player-account-settings';
import ModelSettingsPanel from '@/components/model-settings-panel';
import { redirect } from 'next/navigation';
import { getGitHubUser } from '@/lib/auth';
import SaveNavigation from '@/components/save-navigation';
export const dynamic='force-dynamic';
export default async function AccountSettingsPage(){
  const user=await getGitHubUser();if(!user)redirect('/');
  return <main><h1>設定</h1><SaveNavigation/><ModelSettingsPanel key={'models:'+user.userId} originalAccountScope={'account-operations:'+user.userId}/><PlayerAccountSettings key={user.userId} owner={user.userId}/></main>;
}
