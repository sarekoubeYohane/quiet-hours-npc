import {requireNavigationOwner} from '@/lib/bound-navigation-server';
import PlayerAccountSettings from '@/components/player-account-settings';
import ModelSettingsPanel from '@/components/model-settings-panel';
import { redirect } from 'next/navigation';
import { getGitHubUser } from '@/lib/auth';
import SaveNavigation from '@/components/save-navigation';
export const dynamic='force-dynamic';
export default async function AccountSettingsPage({searchParams}:{searchParams:Promise<{owner?:string}>}){
  const user=await getGitHubUser();if(!user)redirect('/');
  requireNavigationOwner(user.userId,(await searchParams).owner,'/settings');
  return <main><h1>設定</h1><SaveNavigation owner={user.userId}/><ModelSettingsPanel key={'models:'+user.userId} originalAccountScope={'account-operations:'+user.userId}/><PlayerAccountSettings key={user.userId} owner={user.userId}/></main>;
}
