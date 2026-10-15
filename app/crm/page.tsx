import { redirect } from 'next/navigation';
import { getOwnerAccess } from '@/lib/owner';
export const dynamic='force-dynamic';
export default async function CRMEntry() {
  const access=await getOwnerAccess();
  redirect(access?.allowed?'/manage':'/login');
}
