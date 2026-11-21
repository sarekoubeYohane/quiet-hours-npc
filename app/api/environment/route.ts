import { currentEnvironment, testSiteNpcPrompt } from '@/lib/environment';

export const dynamic = 'force-dynamic';

// Public and unauthenticated: it only names the environment and the commit it runs,
// so a deploy can be verified from the outside without a login.
export async function GET() {
  const npcDecisionPrompt = testSiteNpcPrompt()?.match(/^NPC 決策 system prompt 草稿 (v[\d.]+)（/m)?.[1];
  return Response.json({ ...currentEnvironment(), npcDecisionPrompt }, { headers: { 'Cache-Control': 'no-store' } });
}
