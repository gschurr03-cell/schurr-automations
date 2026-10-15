import {getOwnerAccess} from '@/lib/owner';
import {privateJson,routeError} from '@/lib/inquiries';
import {operationalBackup} from '@/lib/operational-backup';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const access=await getOwnerAccess();
 if(!access)return privateJson({ok:false,error:'Sign in to download an operational backup.'},401);
 if(!access.allowed||!access.configured)return privateJson({ok:false,error:'This account does not have access.'},403);
 if(request.headers.get('sec-fetch-site')==='cross-site')return privateJson({ok:false,error:'Open this download from the owner workspace.'},403);
 const output=await operationalBackup();
 return new Response(output,{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="schurr-operational-backup-'+new Date().toISOString().slice(0,10)+'.json"','Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
}catch(error){return routeError(error);}}
