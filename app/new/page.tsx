import {redirect} from 'next/navigation';
import {getGitHubUser} from '@/lib/auth';
import OpeningWizard from '@/components/opening-wizard';
export const dynamic='force-dynamic';
export default async function NewWorldPage({searchParams}:{searchParams:Promise<{draft?:string;restart?:string}>}) {
 if(!await getGitHubUser())redirect('/');
 const query=await searchParams;
 return <OpeningWizard draftId={query.draft} restartSaveId={query.restart}/>;
}
