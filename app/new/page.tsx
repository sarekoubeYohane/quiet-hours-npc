import {requireNavigationOwner} from '@/lib/bound-navigation-server';
import {redirect} from 'next/navigation';
import {getGitHubUser} from '@/lib/auth';
import OpeningWizard from '@/components/opening-wizard';
import SiteHeader from '@/components/site-header';
import {currentEnvironment} from '@/lib/environment';
export const dynamic='force-dynamic';
export default async function NewWorldPage({searchParams}:{searchParams:Promise<{draft?:string;restart?:string;owner?:string}>}) {
 const user=await getGitHubUser();if(!user)redirect('/');
 const query=await searchParams;requireNavigationOwner(user.userId,query.owner,'/new',{draft:query.draft,restart:query.restart});
 return <OpeningWizard key={user.userId} owner={user.userId} draftId={query.draft} restartSaveId={query.restart} header={<SiteHeader environment={currentEnvironment()} displayName={user.displayName}/>}/>;
}
