import {changeAppointment,cancelOwnerAppointment} from '@/lib/appointment-actions';
import {getOwnerAccess} from '@/lib/owner';
import {checkOrigin,privateJson,readJson,routeError,RequestError} from '@/lib/inquiries';
import {availableSlots,appointmentCalendar,saveBookingSetup,createAppointment} from '@/lib/booking';
import {createFollowup,finishFollowup,recordReply} from '@/lib/followups';
import {syncVoiceOperations} from '@/lib/retell';
export const dynamic='force-dynamic';
async function access(){const owner=await getOwnerAccess();if(!owner)throw new RequestError(401,'Sign in to manage appointments.');if(!owner.allowed)throw new RequestError(403,'This account does not have access.');}
export async function GET(request:Request){try{await access();const query=new URL(request.url).searchParams;if(query.has('calendar'))return new Response(await appointmentCalendar(query.get('calendar')),{headers:{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="schurr-appointment.ics"','Cache-Control':'private, no-store'}});return privateJson({ok:true,...await availableSlots(query.get('date'),true,query.get('exclude')||undefined)});}catch(error){return routeError(error);}}
export async function POST(request:Request){try{const origin=checkOrigin(request);await access();const data=await readJson(request,16000);let result:unknown;
 switch(data.action){case 'change_appointment':result=await changeAppointment({...data,action:data.change});break;case 'settings':result=await saveBookingSetup(data);break;case 'book':result=await createAppointment(data);break;case 'cancel_booking':result=await cancelOwnerAppointment(data);break;case 'followup':result=await createFollowup(data);break;case 'finish_followup':await finishFollowup(data);break;case 'reply':await recordReply(data);break;case 'sync_voice':result=await syncVoiceOperations(origin);break;default:throw new RequestError(400,'Choose a scheduling action.');}return privateJson({ok:true,result});}catch(error){return routeError(error);}}
