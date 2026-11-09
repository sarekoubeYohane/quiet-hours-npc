import {redirect} from 'next/navigation';
import {getGitHubUser} from '@/lib/auth';
import OpeningWizard from '@/components/opening-wizard';
export const dynamic='force-dynamic';
export default async function NewWorldPage({searchParams}:{searchParams:Promise<{draft?:string;restart?:string}>}) {
 const user=await getGitHubUser();if(!user)redirect('/');
 const query=await searchParams;
 return <OpeningWizard key={user.userId} owner={user.userId} draftId={query.draft} restartSaveId={query.restart}/>;
}
