'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
export default function ResponseActions({id,revision,draft,status}:{id:string;revision:number;draft:string;status:string}){
 const router=useRouter();const [message,setMessage]=useState(''),[pending,setPending]=useState(false);
 async function update(next:string){setPending(true);setMessage('');try{const response=await fetch('/api/manage/response',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,revision,status:next})});const body=await response.json() as {error?:string};if(!response.ok)throw new Error(body.error||'Could not save.');router.refresh();setPending(false);}catch(error){setMessage(error instanceof Error?error.message:'Please try again.');setPending(false);}}
 async function copy(){try{await navigator.clipboard.writeText(draft);setMessage('Draft copied. It has not been sent.');}catch{setMessage('Select the draft above and copy it manually.');}}
 return <><div className="crm-actions">{draft&&<button className="crm-button crm-button-secondary" onClick={copy}>Copy reply draft</button>}{status==='needs_review'&&<button className="crm-button crm-button-secondary" disabled={pending} onClick={()=>update('contacted')}>Mark handled</button>}{status!=='paused'&&<button className="crm-button crm-button-secondary" disabled={pending} onClick={()=>update('paused')}>Pause contact</button>}{status==='contacted'&&<button className="crm-button crm-button-secondary" disabled={pending} onClick={()=>update('needs_review')}>Reopen</button>}</div><p role="status" className="crm-help">{message}</p></>;
}
