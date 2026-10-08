import { currentEnvironment } from '@/lib/environment';

export const dynamic = 'force-dynamic';

// Public and unauthenticated: it only names the environment and the commit it runs,
// so a deploy can be verified from the outside without a login.
export async function GET() {
  return Response.json(currentEnvironment(), { headers: { 'Cache-Control': 'no-store' } });
}
