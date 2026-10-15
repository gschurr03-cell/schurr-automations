 'use client';
import {useEffect} from 'react';
export default function OpenSection(){useEffect(()=>{const reveal=()=>{const id=window.location.hash.slice(1);if(!['gmail','sending','access','website-followup'].includes(id))return;const el=document.getElementById(id);if(el instanceof HTMLDetailsElement){el.open=true;el.scrollIntoView({block:'start'});}};reveal();window.addEventListener('hashchange',reveal);return()=>window.removeEventListener('hashchange',reveal);},[]);return null;}
