'use client';
import { useRef, useState, type ReactNode, type FormEvent } from 'react';
export default function CRMForm({ action, children, className = '', submitLabel = 'Save changes', compact = false, stayOnPage = false }: { action: string; children: ReactNode; className?: string; submitLabel?: string; compact?: boolean; stayOnPage?: boolean }) {
  const mutationId = useRef<string | null>(null);
  const [pending,setPending] = useState(false);
  const [error,setError] = useState('');
  const [fieldErrors,setFieldErrors] = useState<Record<string,string>>({});
  const [loginRequired,setLoginRequired] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(pending) return;
    const form = event.currentTarget;
    mutationId.current ||= crypto.randomUUID();
    const payload: Record<string,unknown> = { action, mutationId: mutationId.current };
    new FormData(form).forEach((value,key) => { payload[key]=value; });
    setPending(true); setError(''); setFieldErrors({}); setLoginRequired(false);
    try {
      const response=await fetch('/api/manage/crm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const result=await response.json() as {ok?:boolean;error?:string;fieldErrors?:Record<string,string>;redirect?:string};
      if(!response.ok || !result.ok) {
        setError(result.error || 'Your changes could not be saved. Please try again.');
        setFieldErrors(result.fieldErrors || {}); setLoginRequired(response.status===401);
        // Rejected requests were not committed. Preserve input and allow corrections.
        if(response.status>=400 && response.status<500 && response.status!==409) mutationId.current=null;
        return;
      }
      if(stayOnPage) { const current=new URL(window.location.href); current.searchParams.set('saved','updated'); window.location.assign(current.pathname+current.search); }
      else if(typeof result.redirect==='string' && result.redirect.startsWith('/manage') && !result.redirect.startsWith('//')) window.location.assign(result.redirect);
      else window.location.reload();
    } catch { setError('The connection was interrupted. Your entries are still here. Try saving again; an already saved change will not be duplicated.'); }
    finally { setPending(false); }
  }
  return <form method="post" action="/api/manage/crm" onSubmit={submit} className={`crm-form ${compact?'crm-form-compact':''} ${className}`}>
    <fieldset disabled={pending}>{children}</fieldset>
    {error && <div className="crm-alert crm-alert-error" role="alert" tabIndex={-1}><p>{error}</p>{Object.keys(fieldErrors).length>0 && <ul>{Object.entries(fieldErrors).map(([key,value])=><li key={key}>{key.replace(/([A-Z])/g,' $1')}: {value}</li>)}</ul>}{loginRequired&&<a href="/login" target="_blank" rel="noopener">Open CRM login</a>}{error.includes('another tab')&&<a href="" onClick={e=>{e.preventDefault();window.location.reload();}}>Reload this record</a>}</div>}
    <button className={compact?'crm-button crm-button-small crm-button-secondary':'crm-button'} type="submit" disabled={pending}>{pending?'Saving…':submitLabel}</button>
    <noscript><p className="crm-alert">Enable JavaScript to save changes in the CRM.</p></noscript>
  </form>;
}
