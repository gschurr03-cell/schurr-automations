import { getOwnerAccess } from '@/lib/owner';
import { privateJson, routeError } from '@/lib/inquiries';
import { listLeads, leadCsvRow, type LeadFilters } from '@/lib/crm';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const access = await getOwnerAccess();
    if (!access) return privateJson({ ok: false, error: 'Sign in to export your leads.' }, 401);
    if (!access.allowed || !access.configured) return privateJson({ ok: false, error: 'This account does not have access.' }, 403);
    const query = new URL(request.url).searchParams;
    const filters: LeadFilters = { q: query.get('q') || '', stage: query.get('stage') || '', source: query.get('source') || '' };
    let page = await listLeads(filters, 100);
    let finished = false, first = true;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (finished) { controller.close(); return; }
        let chunk = first ? '\uFEFFID,Name,Business,Email,Phone,Preferred contact,Service,Source,Stage,Estimated monthly USD,Estimated setup USD,Created UTC,Updated UTC\r\n' : '';
        first = false;
        chunk += page.items.map(leadCsvRow).join('');
        controller.enqueue(encoder.encode(chunk));
        if (!page.nextCursor) { finished = true; controller.close(); return; }
        try { page = await listLeads({ ...filters, cursor: page.nextCursor }, 100); }
        catch { finished = true; controller.error(new Error('Export interrupted. Please download it again.')); }
      },
      cancel() { finished = true; },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="schurr-crm-leads.csv"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { return routeError(error); }
}
