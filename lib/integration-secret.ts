import {env} from 'cloudflare:workers';
import {RequestError} from './inquiries';
const encoder=new TextEncoder();
type Purpose='retell'|'lead-alerts'|'gmail'|'gmail-config';
const contextFor=(purpose:Purpose)=>`schurr/${purpose}/api-key/v1`;
async function key(context:string) {
  const secret=(env as unknown as {INQUIRY_SIGNING_SECRET?:string}).INQUIRY_SIGNING_SECRET;
  if(!secret||secret.length<32)throw new RequestError(503,'Secure connection storage is not configured.');
  const material=await crypto.subtle.importKey('raw',encoder.encode(secret),'HKDF',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:encoder.encode('schurr-integrations-v1'),info:encoder.encode(context)},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
const base64=(bytes:Uint8Array)=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));
const bytes=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export async function encryptIntegrationSecret(secret:string,purpose:Purpose='retell') {
  const context=contextFor(purpose);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(context)},await key(context),encoder.encode(secret));
  return `v1.${base64(iv)}.${base64(new Uint8Array(ciphertext))}`;
}
export async function decryptIntegrationSecret(value:string,purpose:Purpose='retell') {
  const context=contextFor(purpose);
  try {
    const [version,iv,ciphertext,...extra]=value.split('.');
    if(version!=='v1'||extra.length||bytes(iv).length!==12)throw new Error('Invalid encrypted credential');
    return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv),additionalData:encoder.encode(context)},await key(context),bytes(ciphertext)));
  } catch {throw new RequestError(503,purpose==='retell'?'Reconnect the Retell key in receptionist setup.':purpose==='gmail'||purpose==='gmail-config'?'Reconnect Gmail in the Mailbox settings.':'Reconnect the email key in receptionist setup.');}
}
