import { checkOrigin, issueInquiryToken, privateJson, routeError } from '@/lib/inquiries';
import { enforceRequestLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const origin = checkOrigin(request, false);
    await enforceRequestLimit(request, 'token');
    return privateJson(await issueInquiryToken(origin, new URL(request.url).searchParams.get('key')));
  } catch (error) { return routeError(error); }
}
