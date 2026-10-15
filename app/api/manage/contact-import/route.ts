import { contactImport } from '@/lib/contact-import';
import { privateJson, routeError } from '@/lib/inquiries';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
  try { return privateJson({ok:true,...await contactImport(request)}); }
  catch(error) { return routeError(error); }
}
