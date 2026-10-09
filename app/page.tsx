import { Moon } from 'lucide-react';
import WorldApp from '@/components/world-app';
import { currentEnvironment } from '@/lib/environment';
import { getGitHubUser, githubSignInPath } from '@/lib/auth';
export const dynamic='force-dynamic';
export default async function Page(){
  const {user,unavailable}=await getGitHubUser().then(user=>({user,unavailable:false})).catch(()=>({user:null,unavailable:true}));
  const signInPath=githubSignInPath;
  const environment=currentEnvironment();
  if(!user)return <main className="auth-page"><section className="panel auth-card">
    <div className="brand"><span className="brand-mark"><Moon size={21}/></span><span>Quiet Hours<small>NPC 觀察室</small></span></div>
    <h1>登入你的觀察室</h1>
    <p>{unavailable?'登入服務暫時無法使用，請稍後重試。':'完成網站登入後，就能讀取你的世界、保存角色記憶，並接上模型。'}</p>
    <a href={signInPath} target="_top" className="auth-link auth-anchor">用 GitHub 登入</a>
    <p className="auth-note">請使用已受邀的 GitHub 帳號。登入後會回到這裡。</p>
    <p className="auth-note environment-note">{environment.caption}</p>
  </section></main>;
  return <WorldApp signInPath={signInPath} displayName={user.displayName} environment={environment}/>;
}
