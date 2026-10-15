'use client';
import {useRouter} from 'next/navigation';
import type {FormEvent,MouseEvent,ReactNode} from 'react';

// Same-page history navigation keeps the surrounding draft forms mounted.
export function HistoryFilter({action,children}:{action:string;children:ReactNode}){
 const router=useRouter();
 function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  const query=new URLSearchParams();
  for(const [name,value] of new FormData(event.currentTarget))if(typeof value==='string')query.append(name,value);
  const target=new URL(action,'https://history.local');target.search=query.toString();
  router.push(target.pathname+target.search+target.hash);
 }
 return <form className="crm-form" method="get" action={action} onSubmit={submit}>{children}</form>;
}

export function HistoryLink({href,current,children}:{href:string;current?:boolean;children:ReactNode}){
 const router=useRouter();
 function navigate(event:MouseEvent<HTMLAnchorElement>){
  if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  event.preventDefault();router.push(href);
 }
 return <a href={href} aria-current={current?'page':undefined} onClick={navigate}>{children}</a>;
}
