import {getOwnerAccess} from '@/lib/owner';
import {checkOrigin,privateJson,readJson,routeError,RequestError} from '@/lib/inquiries';
import {gmailWorkspace} from '@/lib/gmail-workspace';
import {configureGmail,startGmailConnect,disconnectGmail} from '@/lib/gmail-connection';
import {sendApprovedOutreach,reconcileGmailSend} from '@/lib/gmail-send';
import {syncGmailReplies} from '@/lib/gmail-replies';
export const dynamic='force-dynamic';
async function owner(){const access=await getOwnerAccess();if(!access)throw new RequestError(401,'Sign in to your CRM to manage Gmail.');if(!access.allowed||!access.configured)throw new RequestError(403,'This account cannot manage this mailbox.');return access;}
export async function GET(request:Request){try{await owner();return privateJson({ok:true,data:await gmailWorkspace(Number(new URL(request.url).searchParams.get('page')||1),new URL(request.url).searchParams.get('draft')||undefined)});}catch(e){return routeError(e);}}
export async function POST(request:Request){try{
 checkOrigin(request);const access=await owner(),input=await readJson(request,16384);let result:unknown;
 switch(input.action){
  case 'configure':result=await configureGmail(input);break;
  case 'connect':{const start=await startGmailConnect(request,access.email);const response=privateJson({ok:true,url:start.url});response.headers.set('Set-Cookie',start.cookie);return response;}
  case 'disconnect':if(input.confirmation!=='DISCONNECT')throw new RequestError(400,'Confirm you want to disconnect Gmail.');await disconnectGmail();break;
  case 'send':result=await sendApprovedOutreach(input);break;
  case 'reconcile':result=await reconcileGmailSend(String(input.id||''));break;
  case 'sync':result=await syncGmailReplies();break;
  default:throw new RequestError(400,'Choose a valid mailbox action.');
 }
 return privateJson({ok:true,result,data:await gmailWorkspace()});
}catch(e){return routeError(e);}}
