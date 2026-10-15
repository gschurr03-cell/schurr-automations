import {scheduleWebsiteCallback} from '@/lib/website-callbacks';
import { checkOrigin, database, existingInquiryReceipt, privateJson, readJson, routeError, saveInquiry, validateInquiry, verifyInquiryToken } from '@/lib/inquiries';
import { enforceRequestLimit } from '@/lib/rate-limit';
import { scheduleOwnerAlert } from '@/lib/owner-alerts';
import { scheduleCustomerEmail } from '@/lib/customer-email';

export const dynamic = 'force-dynamic';
async function savedFollowups(receipt:string){
 const read=async(query:string)=>{try{return (await database().prepare(query).bind(receipt).first<{status:string}>())?.status||null;}catch{return null;}};
 const [emailStatus,callbackStatus,ownerAlertStatus]=await Promise.all([read('SELECT status FROM customer_first_emails WHERE id=?'),read('SELECT status FROM website_callbacks WHERE id=?'),read('SELECT status FROM owner_alerts WHERE id=?')]);
 return {emailStatus,callbackStatus,ownerAlertStatus};
}

export async function POST(request: Request) {
  try {
    const origin = checkOrigin(request);
    const input = validateInquiry(await readJson(request));
    await verifyInquiryToken(input.token, origin, input.submissionKey);
    const existing = await existingInquiryReceipt(input);
    if (existing) {scheduleOwnerAlert(existing);if(input.automaticEmailConsent)scheduleCustomerEmail(existing);if(input.automaticCallConsent)scheduleWebsiteCallback(existing);return privateJson({ ok: true, receipt: existing,...await savedFollowups(existing) });}
    await enforceRequestLimit(request, 'inquiry');
    const result = await saveInquiry(input);
    scheduleOwnerAlert(result.receipt);if(input.automaticEmailConsent)scheduleCustomerEmail(result.receipt);if(input.automaticCallConsent)scheduleWebsiteCallback(result.receipt);
    return privateJson({ ok: true, receipt: result.receipt,...await savedFollowups(result.receipt) }, result.duplicate ? 200 : 201);
  } catch (error) { return routeError(error); }
}
