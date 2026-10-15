import { getOwnerAccess } from '@/lib/owner';
import { checkOrigin, privateJson, readJson, routeError, RequestError } from '@/lib/inquiries';
import { mutateCrm } from '@/lib/crm';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const access = await getOwnerAccess();
    if (!access) return privateJson({ ok: false, error: 'Your session has ended. Open the CRM login in a new tab, sign in, then return here and try again.' }, 401);
    if (!access.allowed || !access.configured) return privateJson({ ok: false, error: 'This account does not have access to this workspace.' }, 403);
    const result = await mutateCrm(await readJson(request, 24 * 1024));
    return privateJson({ ok: true, ...result });
  } catch (error) {
    if(error instanceof RequestError && error.status!==503) return routeError(error);
    console.error('CRM save could not be confirmed.');
    return privateJson({ok:false,error:'Your save could not be confirmed. Keep this form open and try again.'},503);
  }
}
