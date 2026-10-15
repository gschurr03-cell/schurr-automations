import { checkOrigin, readJson, recordMetric, routeError, validateMetric } from '@/lib/inquiries';
import { enforceRequestLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const event = await readJson(request, 1024);
    validateMetric(event);
    await enforceRequestLimit(request, 'metric');
    await recordMetric(event);
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return routeError(error); }
}
