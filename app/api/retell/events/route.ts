import {waitUntil} from 'cloudflare:workers';
import {reconcileMonitoringCall} from '@/lib/monitoring';
import {privateJson,routeError} from '@/lib/inquiries';
import {receiveRetellEvent} from '@/lib/monitoring-calls';
export const dynamic='force-dynamic';
// Incident bookkeeping follows a durable receipt and never authorizes caller actions.
// Webhooks never authorize client sends, bookings or account changes.
export async function POST(request:Request){try{const result=await receiveRetellEvent(request);if(result.callId){const task=reconcileMonitoringCall(result.callId).catch(()=>{console.error('Call incident reconciliation is pending.');});try{waitUntil(task);}catch{void task;}}return privateJson(result);}catch(error){return routeError(error);}}

