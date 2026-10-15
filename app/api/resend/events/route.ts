import {receiveCustomerEmailEvent} from '@/lib/customer-email';
import {privateJson,routeError} from '@/lib/inquiries';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{await receiveCustomerEmailEvent(request);return privateJson({ok:true});}catch(error){return routeError(error);}}
