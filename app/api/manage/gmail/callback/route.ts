import {getOwnerAccess} from '@/lib/owner';
import {completeGmailConnect,clearGmailCookie} from '@/lib/gmail-connection';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 let connected=false;
 try{const access=await getOwnerAccess();if(access?.allowed&&access.configured){await completeGmailConnect(request,access.email);connected=true;}}catch{/* Never reflect provider codes, state, tokens or descriptions into a page or log. */}
 return new Response(null,{status:303,headers:{Location:'/manage/mail?gmail='+ (connected?'connected':'failed'),'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','Set-Cookie':clearGmailCookie()}});
}
