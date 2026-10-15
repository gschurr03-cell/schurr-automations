import { checkOrigin, privateJson, readBoundedText, RequestError, routeError } from '@/lib/inquiries';
import { validId } from '@/lib/crm';
import { getOwnerAccess } from '@/lib/owner';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const access = await getOwnerAccess();
    if (!access) return privateJson({ ok: false, error: 'Sign in to continue.' }, 401);
    if (!access.configured || !access.allowed) return privateJson({ ok: false, error: 'You do not have access to these records.' }, 403);
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/x-www-form-urlencoded') throw new RequestError(415, 'Use the inquiry management form.');
    const fields = new URLSearchParams(await readBoundedText(request, 512));
    if (fields.getAll('id').length !== 1 || [...fields.keys()].some(key => key !== 'id')) throw new RequestError(400, 'Choose one inquiry to remove.');
    const id = validId(fields.get('id'));
    // Legacy forms lead to the current, revision-checked confirmation flow.
    return new Response(null, { status: 303, headers: { Location: `/manage/leads/${id}`, 'Cache-Control': 'private, no-store' } });
  } catch (error) { return routeError(error); }
}
