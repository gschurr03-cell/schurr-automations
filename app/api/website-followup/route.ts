import {websiteCallbackSetup} from '@/lib/website-callbacks';
import {customerEmailSetup} from '@/lib/customer-email';
import {privateJson} from '@/lib/inquiries';
export const dynamic='force-dynamic';
export async function GET(){const [callbacks,email]=await Promise.allSettled([websiteCallbackSetup(),customerEmailSetup()]);return privateJson({callbacksEnabled:callbacks.status==='fulfilled'&&callbacks.value.enabled,emailEnabled:email.status==='fulfilled'&&email.value.enabled});}
