import {requireNavigationOwner} from '@/lib/bound-navigation-server';
import PlayerAccountSettings from '@/components/player-account-settings';
import ModelSettingsPanel from '@/components/model-settings-panel';
import { redirect } from 'next/navigation';
import { getGitHubUser } from '@/lib/auth';
import SaveNavigation from '@/components/save-navigation';
import SiteHeader from '@/components/site-header';
import { currentEnvironment } from '@/lib/environment';
export const dynamic='force-dynamic';
export default async function AccountSettingsPage({searchParams}:{searchParams:Promise<{owner?:string;save?:string}>}){
  const user=await getGitHubUser();if(!user)redirect('/');
  const params=await searchParams;const save=typeof params.save==='string'?params.save:undefined;
  requireNavigationOwner(user.userId,params.owner,'/settings',{save});
  return <main className="authoring-page"><SiteHeader environment={currentEnvironment()} displayName={user.displayName}/><SaveNavigation owner={user.userId} saveId={save}/><h1 className="page-title">帳號設定</h1><p className="hint">模型、API Key、預算與單價屬於帳號，所有存檔與人物製作共用。</p><ModelSettingsPanel key={'models:'+user.userId} originalAccountScope={'account-operations:'+user.userId}/><PlayerAccountSettings key={user.userId} owner={user.userId}/></main>;
}
