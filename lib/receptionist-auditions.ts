import {database,RequestError} from './inquiries';
import {auditionCatalogue,auditionHash,type AuditionEnvironment,type AuditionOutcome,type AuditionResult,type AuditionSession} from './receptionist-audition-policy';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function text(value:unknown,label:string,max:number,required=false){
 if(typeof value!=='string')throw new RequestError(400,`${label} must be text.`);
 const result=value.trim();
 if(result.length>max||(required&&!result)||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result))throw new RequestError(400,`Check ${label.toLowerCase()}.`);
 if(/(?:\b(?:re_|whsec_|sk-|key_)[A-Za-z0-9_-]{16,}|\bBearer\s+[A-Za-z0-9_.-]{15,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i.test(result))throw new RequestError(400,'Keep API keys and other credentials out of the audition log.');
 return result;
}
function score(value:unknown,label:string){if(value===null)return null;if(typeof value!=='number'||!Number.isInteger(value)||value<1||value>5)throw new RequestError(400,`${label} must be 1 to 5, or not scored.`);return value;}
function requestData(data:Record<string,unknown>){
 if(typeof data.requestKey!=='string'||!UUID.test(data.requestKey))throw new RequestError(400,'Refresh the audition form before saving.');
 if(data.confirmed!==true)throw new RequestError(400,'Confirm that these results describe tests you performed.');
 if(data.environment!=='phone'&&data.environment!=='browser')throw new RequestError(400,'Choose phone or browser.');
 if(typeof data.catalogueHash!=='string'||!/^[a-f0-9]{64}$/.test(data.catalogueHash))throw new RequestError(400,'Refresh the checklist before saving.');
 const testedAt=text(data.testedAt,'Test time',30,true),time=Date.parse(testedAt);
 if(!Number.isFinite(time)||new Date(time).toISOString()!==testedAt||time<Date.parse('2000-01-01T00:00:00.000Z')||time>Date.now()+300000)throw new RequestError(400,'Enter a valid test time that is not in the future.');
 const agentId=text(data.agentId,'Agent ID',120,true);
 if(!/^agent_[A-Za-z0-9_-]{1,100}$/.test(agentId))throw new RequestError(400,'Enter the tested agent ID from Retell.');
 if(data.agentVersion!==null&&(typeof data.agentVersion!=='number'||!Number.isSafeInteger(data.agentVersion)||data.agentVersion<0))throw new RequestError(400,'Enter the nonnegative version tested, or leave it unrecorded.');
 if(!Array.isArray(data.results)||data.results.length<1||data.results.length>50)throw new RequestError(400,'Include every checklist result.');
 const ids=new Set<string>();
 const results=data.results.map(item=>{
  if(!item||typeof item!=='object'||Array.isArray(item))throw new RequestError(400,'Check the audition results.');
  const result=item as Record<string,unknown>,id=text(result.id,'Check ID',80,true);
  if(!/^[a-z][a-z0-9_]*$/.test(id)||ids.has(id))throw new RequestError(400,'Each check needs one result.');ids.add(id);
  if(result.outcome!=='pass'&&result.outcome!=='fail'&&result.outcome!=='not_tested')throw new RequestError(400,'Choose pass, fail or not tested for each check.');
  return {id,outcome:result.outcome as AuditionOutcome,notes:text(result.notes,'Check notes',500)};
 }).sort((a,b)=>a.id.localeCompare(b.id));
 if(!results.some(result=>result.outcome!=='not_tested'))throw new RequestError(400,'Record at least one test you performed.');
 return {requestKey:data.requestKey.toLowerCase(),catalogueHash:data.catalogueHash,environment:data.environment as AuditionEnvironment,testedAt,agentId,agentVersion:data.agentVersion,configEvidence:text(data.configEvidence,'Configuration evidence',2000,true),notes:text(data.notes,'Session notes',1000),naturalness:score(data.naturalness,'Naturalness'),interruptions:score(data.interruptions,'Interruptions'),pacing:score(data.pacing,'Pacing'),results};
}
type Receipt={id:string;bodyHash:string};
export async function saveAudition(data:Record<string,unknown>,recordedBy:string){
 const input=requestData(data),bodyHash=await auditionHash(input),db=database();
 const receipt=()=>db.prepare('SELECT id,body_hash AS bodyHash FROM receptionist_audition_sessions WHERE request_key=?').bind(input.requestKey).first<Receipt>();
 const previous=await receipt();
 function result(row:Receipt){if(row.bodyHash!==bodyHash)throw new RequestError(409,'This save key already belongs to different results. The saved session was not changed.');return {id:row.id};}
 // Exact retry still works after checklist wording changes. It never rewrites evidence.
 if(previous)return {...result(previous),duplicate:true};
 const catalogue=await auditionCatalogue();
 if(input.catalogueHash!==catalogue.hash)throw new RequestError(409,'The checklist changed. Reload it and review the results before saving.');
 if(input.results.length!==catalogue.checks.length||catalogue.checks.some(check=>!input.results.some(result=>result.id===check.id)))throw new RequestError(400,'Include exactly one result for every current check.');
 const id=crypto.randomUUID(),recordedAt=new Date().toISOString();
 const statements=[db.prepare(`INSERT INTO receptionist_audition_sessions (id,request_key,body_hash,catalogue_hash,environment,tested_at,agent_id,agent_version,config_evidence,notes,naturalness,interruptions,pacing,recorded_by,recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(request_key) DO NOTHING`).bind(id,input.requestKey,bodyHash,input.catalogueHash,input.environment,input.testedAt,input.agentId,input.agentVersion,input.configEvidence,input.notes,input.naturalness,input.interruptions,input.pacing,recordedBy,recordedAt)];
 catalogue.checks.forEach((check,ordinal)=>{
  const outcome=input.results.find(result=>result.id===check.id)!;
  // Only this transaction's new session may receive results; retries cannot repair,
  // replace or append results onto an earlier session with the same request key.
  statements.push(db.prepare(`INSERT INTO receptionist_audition_results (session_id,test_id,ordinal,title,scenario,expected,outcome,notes) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM receptionist_audition_sessions WHERE id=?)`).bind(id,check.id,ordinal,check.title,check.scenario,check.expected,outcome.outcome,outcome.notes,id));
 });
 await db.batch(statements);
 const saved=await receipt();if(!saved)throw new RequestError(503,'The audition save could not be confirmed. Retry the same results.');
 return {...result(saved),duplicate:saved.id!==id};
}
const COLUMNS='id,catalogue_hash AS catalogueHash,environment,tested_at AS testedAt,agent_id AS agentId,agent_version AS agentVersion,config_evidence AS configEvidence,notes,naturalness,interruptions,pacing,recorded_by AS recordedBy,recorded_at AS recordedAt';
type SessionRow=Omit<AuditionSession,'results'>;
async function withResults(rows:SessionRow[]):Promise<AuditionSession[]>{
 if(!rows.length)return [];
 const result=await database().prepare(`SELECT session_id AS sessionId,test_id AS id,title,scenario,expected,outcome,notes FROM receptionist_audition_results WHERE session_id IN (${rows.map(()=>'?').join(',')}) ORDER BY ordinal`).bind(...rows.map(row=>row.id)).all<AuditionResult&{sessionId:string}>();
 return rows.map(row=>({...row,results:result.results.filter(result=>result.sessionId===row.id).map(({sessionId,...rest})=>rest)}));
}
export async function listAuditions(before?:string){
 const db=database();let cursor:{recordedAt:string;id:string}|null=null;
 if(before){if(!UUID.test(before))throw new RequestError(400,'Choose a valid audition history page.');cursor=await db.prepare('SELECT id,recorded_at AS recordedAt FROM receptionist_audition_sessions WHERE id=?').bind(before).first<{recordedAt:string;id:string}>();if(!cursor)throw new RequestError(400,'This audition history page is unavailable.');}
 const rows=await db.prepare(`SELECT ${COLUMNS} FROM receptionist_audition_sessions ${cursor?'WHERE (recorded_at<? OR (recorded_at=? AND id<?))':''} ORDER BY recorded_at DESC,id DESC LIMIT 11`).bind(...(cursor?[cursor.recordedAt,cursor.recordedAt,cursor.id]:[])).all<SessionRow>();
 const latest=await db.prepare(`SELECT ${COLUMNS} FROM receptionist_audition_sessions WHERE environment='phone' ORDER BY tested_at DESC,recorded_at DESC,id DESC LIMIT 1`).first<SessionRow>();
 const sessions=await withResults(rows.results.slice(0,10));
 return {sessions,next:rows.results.length>10?sessions[sessions.length-1].id:null,latestPhone:latest?(await withResults([latest]))[0]:null};
}
