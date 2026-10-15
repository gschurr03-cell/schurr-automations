import {env} from 'cloudflare:workers';
import {privateJson,readJson,routeError,RequestError} from '@/lib/inquiries';
import {syncGmailReplies} from '@/lib/gmail-replies';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
 const configured=(env as unknown as {GMAIL_SYNC_RUNNER_SECRET?:string}).GMAIL_SYNC_RUNNER_SECRET;
 if(!configured||configured.length<32)throw new RequestError(503,'Background Gmail checks are not configured.');
 const header=request.headers.get('authorization')||'';if(header.length>1000||!header.startsWith('Bearer '))throw new RequestError(401,'Unauthorized.');
 const hash=async(value:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),[a,b]=await Promise.all([hash(configured),hash(header.slice(7))]);let difference=0;for(let i=0;i<a.length;i++)difference|=a[i]^b[i];if(difference)throw new RequestError(401,'Unauthorized.');
 const body=await readJson(request,256);if(Object.keys(body).length)throw new RequestError(400,'Send an empty JSON object.');
 const result=await syncGmailReplies();return privateJson({ok:true,checked:result.checked,imported:result.imported,remaining:result.remaining});
}catch(e){return routeError(e);}}
