import {database,RequestError} from './inquiries';
import {cursorDecode,cursorEncode} from './crm';
import {MONITORING_CHECK_SUMMARIES,MONITORING_CALL_SUMMARIES,knownCheck,knownCallKind,monitoringId,monitoringHash,monitoringPayload} from './monitoring-incident-policy';

export type MonitoringIncident={id:string;incidentKey:string;source:'check'|'call';code:string;severity:'error'|'warning';summary:string;status:'open'|'acknowledged'|'resolved';acknowledgedAt:string;resolvedAt:string;resolutionKind:''|'check_pass'|'owner_closed';createdAt:string;updatedAt:string};
export type MonitoringIncidentResult={openedIds:string[];resolvedIds:string[];notificationIds:string[];skipped?:'superseded'};
const SELECT='id,incident_key AS incidentKey,source,code,severity,summary,status,acknowledged_at AS acknowledgedAt,resolved_at AS resolvedAt,resolution_kind AS resolutionKind,created_at AS createdAt,updated_at AS updatedAt';
const ENABLED="COALESCE((SELECT alerts_enabled FROM monitoring_settings WHERE id='monitoring'),0)=1";
type Statement=ReturnType<ReturnType<typeof database>['prepare']>;
async function enqueue(db:ReturnType<typeof database>,incidentId:string,summary:string,kind:'opened'|'resolved',resolution:string,now:string,guard:string,args:(string|number|null)[]=[]):Promise<Statement>{
 const payload=monitoringPayload(incidentId,summary,kind,resolution),hash=await monitoringHash(payload);
 return db.prepare(`INSERT INTO monitoring_alerts(id,incident_id,kind,payload,payload_hash,status,retryable,last_error,created_at)
 SELECT ?,?,?,?,?,CASE WHEN ${ENABLED} THEN 'pending' ELSE 'cancelled' END,CASE WHEN ${ENABLED} THEN 1 ELSE 0 END,CASE WHEN ${ENABLED} THEN '' ELSE 'Monitoring alerts were disabled when this event was recorded.' END,?
 WHERE ${guard} ON CONFLICT(incident_id,kind) DO NOTHING`).bind(crypto.randomUUID(),incidentId,kind,payload,hash,now,...args);
}
async function incident(id:string){const row=await database().prepare(`SELECT ${SELECT} FROM monitoring_incidents WHERE id=?`).bind(id).first<MonitoringIncident>();if(!row)throw new RequestError(404,'Monitoring incident not found.');return row;}
async function notifications(id:string){return (await database().prepare('SELECT id FROM monitoring_alerts WHERE incident_id=? ORDER BY created_at,id').bind(id).all<{id:string}>()).results.map(row=>row.id);}

// Persisted runs must still be latest inside the reconciliation transaction. A
// runner can lose its lease after saving; its delayed result must then be inert.
// Durable receipts also make exact old retries inert after recovery/manual closure.
export async function reconcileCheckIncidents(checks:{key:string;status:'pass'|'fail'|'unknown';summary:string}[],value:string):Promise<MonitoringIncidentResult>{
 const checkId=monitoringId(value);if(!Array.isArray(checks)||checks.length>20)throw new RequestError(400,'Choose a bounded monitoring check set.');
 const seen=new Set<string>(),input=checks.map(check=>{const key=knownCheck(check?.key);if(seen.has(key)||!['pass','fail','unknown'].includes(check.status))throw new RequestError(400,'Each monitoring check needs one valid status.');seen.add(key);return {key,status:check.status};}).sort((a,b)=>a.key.localeCompare(b.key));
 // Never persist caller/provider/model supplied summary text.
 const hash=await monitoringHash(JSON.stringify(input)),db=database(),now=new Date().toISOString();
 const receipt=()=>db.prepare('SELECT body_hash AS bodyHash,result FROM monitoring_check_receipts WHERE id=?').bind(checkId).first<{bodyHash:string;result:string}>();
 const readResult=(row:{bodyHash:string;result:string})=>{if(row.bodyHash!==hash)throw new RequestError(409,'This monitoring run was already recorded with different results.');return JSON.parse(row.result) as MonitoringIncidentResult;};
 const previous=await receipt();if(previous)return readResult(previous);
 const receiptGate='EXISTS(SELECT 1 FROM monitoring_check_receipts WHERE id=? AND body_hash=? AND applied=0)';
 // Standalone trusted callers without a persisted run retain the existing API.
 // Real saved runs are gated atomically, including equal finished_at timestamps.
 const latestGate='(NOT EXISTS(SELECT 1 FROM monitoring_checks WHERE id=?) OR ?=(SELECT id FROM monitoring_checks ORDER BY finished_at DESC,id DESC LIMIT 1))';
 const gate=receiptGate+' AND '+latestGate,gateArgs=[checkId,hash,checkId,checkId];
 const steps:Statement[]=[db.prepare("INSERT INTO monitoring_check_receipts(id,body_hash,created_at) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING").bind(checkId,hash,now)];
 for(const check of input){
  const activeKey='check:'+check.key,summary=MONITORING_CHECK_SUMMARIES[check.key];
  if(check.status==='fail'){
   const id=crypto.randomUUID();
   steps.push(db.prepare(`INSERT INTO monitoring_incidents(id,incident_key,active_key,source,code,summary,opened_check_id,last_check_id,created_at,updated_at) SELECT ?,?,?,'check',?,?,?,?,?,? WHERE ${gate} ON CONFLICT(active_key) DO NOTHING`).bind(id,activeKey,activeKey,check.key,summary,checkId,checkId,now,now,...gateArgs));
   steps.push(db.prepare(`UPDATE monitoring_incidents SET last_check_id=?,updated_at=? WHERE active_key=? AND ${gate}`).bind(checkId,now,activeKey,...gateArgs));
   steps.push(await enqueue(db,id,summary,'opened','',now,`EXISTS(SELECT 1 FROM monitoring_incidents WHERE id=?) AND ${gate}`,[id,...gateArgs]));
  }else if(check.status==='pass'){
   // Run checks must be serialized by the caller; owner closure racing this read
   // simply makes this conditional update a no-op, never a second resolution.
   const current=await db.prepare('SELECT id FROM monitoring_incidents WHERE active_key=?').bind(activeKey).first<{id:string}>();if(!current)continue;
   steps.push(db.prepare(`UPDATE monitoring_incidents SET status='resolved',active_key=NULL,resolved_at=?,resolution_kind='check_pass',resolved_check_id=?,last_check_id=?,updated_at=? WHERE id=? AND active_key=? AND ${gate}`).bind(now,checkId,checkId,now,current.id,activeKey,...gateArgs));
   steps.push(db.prepare(`UPDATE monitoring_alerts SET status='cancelled',retryable=0,last_error='The incident closed before this notification was attempted.' WHERE incident_id=? AND kind='opened' AND attempts=0 AND status='pending' AND EXISTS(SELECT 1 FROM monitoring_incidents WHERE id=? AND resolved_check_id=?) AND ${gate}`).bind(current.id,current.id,checkId,...gateArgs));
   steps.push(await enqueue(db,current.id,summary,'resolved','check_pass',now,`EXISTS(SELECT 1 FROM monitoring_incidents WHERE id=? AND resolved_check_id=? AND resolution_kind='check_pass') AND ${gate}`,[current.id,checkId,...gateArgs]));
  }
  // unknown makes no health assertion and cannot open or close an incident.
 }
 steps.push(db.prepare(`UPDATE monitoring_check_receipts SET applied=1,result=CASE WHEN ${latestGate} THEN json_object('openedIds',json((SELECT json_group_array(id) FROM monitoring_incidents WHERE opened_check_id=?)),'resolvedIds',json((SELECT json_group_array(id) FROM monitoring_incidents WHERE resolved_check_id=?)),'notificationIds',json((SELECT json_group_array(a.id) FROM monitoring_alerts a JOIN monitoring_incidents i ON i.id=a.incident_id WHERE (a.kind='opened' AND i.opened_check_id=?) OR (a.kind='resolved' AND i.resolved_check_id=?)))) ELSE json_object('openedIds',json('[]'),'resolvedIds',json('[]'),'notificationIds',json('[]'),'skipped','superseded') END WHERE id=? AND body_hash=? AND applied=0`).bind(checkId,checkId,checkId,checkId,checkId,checkId,checkId,hash));
 await db.batch(steps);const saved=await receipt();if(!saved)throw new RequestError(503,'Monitoring results could not be confirmed. Retry the same run.');return readResult(saved);
}

export async function openCallIncident(callId:string,kind:string,_summary:string){
 if(typeof callId!=='string'||!/^call_[A-Za-z0-9_-]{1,100}$/.test(callId))throw new RequestError(400,'Choose a valid provider call reference.');
 const code=knownCallKind(kind),event=await monitoringHash(callId+'\n'+code),db=database(),id=crypto.randomUUID(),key='call:'+event,now=new Date().toISOString(),summary=MONITORING_CALL_SUMMARIES[code];
 await db.batch([
  db.prepare(`INSERT INTO monitoring_incidents(id,incident_key,active_key,source,source_event,code,severity,summary,created_at,updated_at) VALUES(?,?,?,'call',?,?,?,?,?,?) ON CONFLICT(source_event) DO NOTHING`).bind(id,key,key,event,code,code==='quality_review'?'warning':'error',summary,now,now),
  await enqueue(db,id,summary,'opened','',now,'EXISTS(SELECT 1 FROM monitoring_incidents WHERE id=?)',[id]),
 ]);
 const saved=await db.prepare('SELECT id FROM monitoring_incidents WHERE source_event=?').bind(event).first<{id:string}>();if(!saved)throw new RequestError(503,'Call incident could not be confirmed.');
 return {incident:await incident(saved.id),notificationIds:await notifications(saved.id)};
}
export async function acknowledgeIncident(value:string){const id=monitoringId(value),now=new Date().toISOString();await database().prepare("UPDATE monitoring_incidents SET status='acknowledged',acknowledged_at=?,updated_at=? WHERE id=? AND status='open'").bind(now,now,id).run();return {incident:await incident(id),notificationIds:[] as string[]};}
export async function resolveIncident(value:string){
 const id=monitoringId(value),existing=await incident(id),db=database(),now=new Date().toISOString(),token=crypto.randomUUID();
 await db.batch([
  db.prepare("UPDATE monitoring_incidents SET status='resolved',active_key=NULL,resolved_at=?,resolution_kind='owner_closed',resolved_check_id=?,updated_at=? WHERE id=? AND status IN ('open','acknowledged')").bind(now,token,now,id),
  db.prepare("UPDATE monitoring_alerts SET status='cancelled',retryable=0,last_error='The incident closed before this notification was attempted.' WHERE incident_id=? AND kind='opened' AND attempts=0 AND status='pending' AND EXISTS(SELECT 1 FROM monitoring_incidents WHERE id=? AND resolved_check_id=?)").bind(id,id,token),
  await enqueue(db,id,existing.summary,'resolved','owner_closed',now,"EXISTS(SELECT 1 FROM monitoring_incidents WHERE id=? AND resolved_check_id=? AND resolution_kind='owner_closed')",[id,token]),
 ]);
 return {incident:await incident(id),notificationIds:await notifications(id)};
}
export async function listMonitoringIncidents(options:{limit?:number;cursor?:string;status?:'all'|'active'|'resolved'}={}){
 const limit=options.limit??50,status=options.status??'all';if(!Number.isInteger(limit)||limit<1||limit>100||!['all','active','resolved'].includes(status))throw new RequestError(400,'Choose a valid monitoring history page.');
 const cursor=cursorDecode(options.cursor),where:string[]=[],args:(string|number)[]=[];
 if(status==='active')where.push("status IN ('open','acknowledged')");else if(status==='resolved')where.push("status='resolved'");if(cursor){where.push('(created_at,id)<(?,?)');args.push(...cursor);}
 const db=database(),rows=(await db.prepare(`SELECT ${SELECT} FROM monitoring_incidents ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY created_at DESC,id DESC LIMIT ?`).bind(...args,limit+1).all<MonitoringIncident>()).results;
 const counts=await db.prepare("SELECT COUNT(*) AS total,COALESCE(SUM(status IN ('open','acknowledged')),0) AS active,COALESCE(SUM(status='acknowledged'),0) AS acknowledged,COALESCE(SUM(status='resolved'),0) AS resolved FROM monitoring_incidents").first<{total:number;active:number;acknowledged:number;resolved:number}>();
 const items=rows.slice(0,limit),last=items.at(-1);return {items,nextCursor:rows.length>limit&&last?cursorEncode(last.createdAt,last.id):null,counts:counts!};
}
