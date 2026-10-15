#!/usr/bin/env node
'use strict';
// Offline archive checker only. This module never loads application code, an env
// file, Worker bindings, credentials, a network client or a production database.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const schema=require('../lib/operational-backup-schema.json');
const quote=value=>'"'+value.replace(/"/g,'""')+'"';
const secretPattern=/(?:\b(?:re_|whsec_|sk-|key_)[A-Za-z0-9_-]{16,}|\bBearer\s+\S+|-----BEGIN[^\n]*PRIVATE KEY)/i;
const isObject=value=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
function exactKeys(value,names,label){if(!isObject(value)||Object.keys(value).length!==names.length||names.some(name=>!Object.hasOwn(value,name)))throw Error('Unexpected fields in '+label+'.');}
function validateBackup(value){
 exactKeys(value,['format','version','schemaId','scope','createdAt','counts','tables'],'backup');
 if(value.format!==schema.format||value.version!==schema.version||value.schemaId!==schema.schemaId||value.scope!==schema.scope)throw Error('Unknown operational backup format or schema. Use the matching reviewed application version.');
 if(typeof value.createdAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.createdAt)||!Number.isFinite(Date.parse(value.createdAt)))throw Error('Invalid backup creation time.');
 if(Buffer.byteLength(JSON.stringify(value),'utf8')>schema.limits.maxJsonBytes)throw Error('Backup exceeds the JSON size limit.');
 const names=schema.tables.map(t=>t.name);exactKeys(value.tables,names,'tables');exactKeys(value.counts,names,'counts');let total=0,rawBytes=0;
 for(const table of schema.tables){const rows=value.tables[table.name];if(!Array.isArray(rows)||rows.length>schema.limits.maxRowsPerTable||!Number.isSafeInteger(value.counts[table.name])||value.counts[table.name]!==rows.length)throw Error('Invalid row count for '+table.name+'.');total+=rows.length;if(total>schema.limits.maxRows)throw Error('Backup exceeds the row limit.');
  for(const row of rows){exactKeys(row,table.columns.map(c=>c.name),table.name+' record');for(const column of table.columns){const v=row[column.name];if(v===null){if(!column.nullable)throw Error('Null required field in '+table.name+'.');continue;}if(column.type==='integer'){if(!Number.isSafeInteger(v))throw Error('Invalid integer in '+table.name+'.');rawBytes+=Buffer.byteLength(String(v));}else if(column.type==='text'){if(typeof v!=='string'||v.includes('\u0000'))throw Error('Invalid text in '+table.name+'.');const bytes=Buffer.byteLength(v);if(bytes>schema.limits.maxCellBytes)throw Error('Oversized field in '+table.name+'.');rawBytes+=bytes;if(secretPattern.test(v))throw Error('Possible credential in operational content. Remove it before backing up.');}else throw Error('Unsupported trusted column type.');}
   for(const [column,kind]of Object.entries(table.jsonColumns)){let parsed;try{parsed=JSON.parse(row[column]);}catch{throw Error('Malformed JSON field in '+table.name+'.');}if(kind==='object'?!isObject(parsed):!Array.isArray(parsed))throw Error('Wrong JSON shape in '+table.name+'.');}
  }
 }
 if(rawBytes>schema.limits.maxRawBytes)throw Error('Backup exceeds the raw content limit.');
 return value;
}
const disabledBooking=()=>({enabled:false,title:'Restored archive; booking disabled',timezone:'America/Denver',duration:30,buffer:10,notice:120,horizon:30,hours:Array.from({length:7},()=>({enabled:false,start:'09:00',end:'17:00'})),handoffNumber:'',handoffEnabled:false});
function safeRow(table,input){const row={...input};
 switch(table){
  case 'gmail_outbox':
   // Immutable MIME, message IDs, timestamps, receipts and attempt facts remain
   // historical evidence. No lease or pending dispatch survives this archive.
   row.lock_token='';row.lock_until=0;
   if(['prepared','sending','failed','pending'].includes(row.status)){
    row.status=row.status==='sending'||row.first_attempt_at>0||row.attempts>0?'uncertain':'cancelled';
    row.last_error='Offline operational restore: Gmail sending is inactive. '+row.last_error;
   }
   break;
  case 'website_callbacks':if(['pending','dispatching','accepted','uncertain'].includes(row.status)){row.status='stopped';row.last_error='Offline restore: callbacks inactive.';}break;
  case 'gmail_queues':row.status='cancelled';row.active_key=null;row.lease_token='';row.lease_until=0;row.reason='Offline restore: queue cancelled; sending inactive.';break;
  case 'gmail_queue_items':if(['pending','dispatching','held'].includes(row.status))row.status='cancelled';row.lease_token='';break;
  case 'gmail_replies':row.import_token='';break;
  case 'crm_settings':row.setup_complete=0;break;
  case 'monitoring_settings':row.alerts_enabled=0;row.runner_expected=0;row.baseline_hash='';row.baseline_agent_id='';row.baseline_agent_version=null;row.baseline_at='';row.last_runner_at='';row.revision++;break;
  case 'monitoring_checks':row.configuration_hash=null;row.checks=JSON.stringify(JSON.parse(row.checks).map(check=>({...check,status:'unknown',summary:'Offline operational restore: historical observation; current health has not been checked.'})));break;
  case 'monitoring_calls':if(Object.hasOwn(row,'observation_revision'))row.reconciled_revision=row.observation_revision;break;
  case 'monitoring_call_events':row.receipt_token='';break;
  case 'monitoring_alerts':
   // No sender, recipient, immutable delivery body or live retry permission survives.
   row.payload='{}';row.payload_hash='';row.retryable=0;
   if(['pending','sending','failed'].includes(row.status)){row.status=row.first_attempt_at>0||row.attempts>0?'uncertain':'cancelled';row.last_error='Offline operational restore: delivery is inactive. '+row.last_error;}
   break;
  case 'booking_settings':row.config=JSON.stringify({...JSON.parse(row.config),enabled:false,handoffEnabled:false});row.revision++;break;
  case 'automation_settings':row.chat_enabled=0;row.google_eligibility='unconfirmed';row.search_console_property='';row.revision++;break;
  case 'client_setups':row.revision++;break;
  case 'outreach_campaigns':if(row.status==='active')row.status='paused';break;
  case 'outreach_prospects':if(row.status==='ready')row.status='paused';break;
  case 'outreach_drafts':if(['draft','approved'].includes(row.status))row.status='stopped';break;
  case 'automation_runs':if(['draft','approved'].includes(row.status))row.status='cancelled';break;
  case 'response_jobs':if(row.status==='needs_review')row.status='paused';break;
  case 'response_followups':if(row.status==='open'){row.status='cancelled';row.reason='Offline operational restore: follow-up is inactive. '+row.reason;}break;
  case 'owner_alerts':if(['pending','sending','failed'].includes(row.status)){row.status=row.first_attempt_at>0?'uncertain':'cancelled';row.last_error='Offline operational restore: delivery is inactive. '+row.last_error;}break;
  case 'customer_first_emails':row.retryable=0;if(['pending','sending','failed'].includes(row.status)){row.status=row.first_attempt_at>0?'uncertain':'cancelled';row.last_error='Offline operational restore: delivery is inactive. '+row.last_error;}break;
  case 'review_requests':row.retryable=0;if(['draft','sending','failed'].includes(row.status)){row.status=row.first_attempt_at>0?'stopped':'cancelled';row.last_error='Offline operational restore: delivery is inactive. '+row.last_error;}break;
 }
 if(Object.hasOwn(row,'revision')&&!Number.isSafeInteger(row.revision))throw Error('Invalid restored revision.');
 return row;
}
function trustedMigrations(root){const files=fs.readdirSync(path.join(root,'drizzle')).filter(name=>/^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();if(files.length!==schema.migrations.length||files.some((name,i)=>name!==schema.migrations[i].name))throw Error('Trusted migration list differs from this backup schema. Regenerate and review the contract.');return schema.migrations.map(item=>{const sql=fs.readFileSync(path.join(root,'drizzle',item.name),'utf8');if(createHash('sha256').update(sql).digest('hex')!==item.sha256)throw Error('Trusted migration hash mismatch: '+item.name);return sql;});}
function contained(child,parent){const relative=path.relative(parent,child);return !relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));}
function restoreBackup(backup,destination,{migrationRoot=path.resolve(__dirname,'..')}={}){
 validateBackup(backup);const migrations=trustedMigrations(migrationRoot),root=fs.realpathSync(migrationRoot),parent=fs.realpathSync(path.dirname(path.resolve(destination))),dest=path.join(parent,path.basename(destination));
 if(!dest.endsWith('.sqlite')||contained(dest,root)||dest.split(path.sep).some(part=>['.wrangler','.openai','dist'].includes(part)))throw Error('Choose a new .sqlite file in an isolated directory outside the application checkout and runtime folders.');
 // O_EXCL prevents replacing any existing file, including a symlink or database.
 const fd=fs.openSync(dest,'wx',0o600);fs.closeSync(fd);let db;
 try{db=new DatabaseSync(dest);db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE;');for(const sql of migrations)db.exec(sql);
  db.exec("CREATE TABLE operational_restore_metadata (id TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE operational_restore_changes (table_name TEXT NOT NULL, record_key TEXT NOT NULL, original_record TEXT NOT NULL, restored_record TEXT NOT NULL, PRIMARY KEY(table_name,record_key)); BEGIN; PRAGMA defer_foreign_keys=ON;");
  const archive=db.prepare('INSERT INTO operational_restore_changes(table_name,record_key,original_record,restored_record) VALUES(?,?,?,?)');
  let restoredRows=0;
  for(const table of schema.tables){for(const original of backup.tables[table.name]){const row=safeRow(table.name,original),columns=Object.keys(row);db.prepare(`INSERT INTO ${quote(table.name)} (${columns.map(quote).join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).run(...columns.map(c=>row[c]));restoredRows++;
    if(JSON.stringify(row)!==JSON.stringify(original)){const key=JSON.stringify(table.columns.filter(c=>c.primaryKey).sort((a,b)=>a.primaryKey-b.primaryKey).map(c=>original[c.name]));archive.run(table.name,key,JSON.stringify(original),JSON.stringify(row));}
   }}
  const now=new Date().toISOString();
  // Explicit inactive singletons close first-run environment-seed fallback holes.
  db.prepare("INSERT INTO booking_settings(id,config,revision,updated_at) VALUES('main',?,1,?) ON CONFLICT(id) DO NOTHING").run(JSON.stringify(disabledBooking()),now);
  db.prepare("INSERT INTO automation_settings(id,profile,chat_enabled,google_eligibility,search_console_property,revision,updated_at) VALUES('business','{}',0,'unconfirmed','',1,?) ON CONFLICT(id) DO NOTHING").run(now);
  if(schema.tables.some(table=>table.name==='monitoring_settings'))db.prepare("INSERT INTO monitoring_settings(id,alerts_enabled,runner_expected,created_at,updated_at) VALUES('monitoring',0,0,?,?) ON CONFLICT(id) DO NOTHING").run(now,now);
  const metadata={format:schema.format,version:schema.version,schemaId:schema.schemaId,sourceCreatedAt:backup.createdAt,restoredAt:now,scope:schema.scope,mode:'OFFLINE_INSPECTION_ONLY',instructions:'Never attach this archive to a Worker, production service, live environment, provider credentials or runtime secrets. Connection and launch evidence must be re-established in a separately reviewed migration.',omittedTables:schema.omittedTables,omittedColumns:Object.fromEntries(schema.tables.filter(t=>t.omittedColumns.length).map(t=>[t.name,t.omittedColumns])),sourceCounts:backup.counts,restoredRows};
  for(const [key,value]of Object.entries(metadata))db.prepare('INSERT INTO operational_restore_metadata(id,value) VALUES(?,?)').run(key,JSON.stringify(value));
  if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Backup relationships failed foreign-key validation.');
  const integrity=db.prepare('PRAGMA integrity_check').all();if(integrity.length!==1||Object.values(integrity[0])[0]!=='ok')throw Error('Restored archive failed integrity validation.');
  db.exec('COMMIT');db.close();db=null;return {destination:dest,restoredRows,mode:'OFFLINE_INSPECTION_ONLY',schemaId:schema.schemaId};
 }catch(error){if(db){try{db.exec('ROLLBACK');}catch{}try{db.close();}catch{}}for(const name of [dest,dest+'-journal',dest+'-wal',dest+'-shm']){try{fs.unlinkSync(name);}catch(e){if(e.code!=='ENOENT')throw Error('Restore failed; an incomplete local archive could not be removed.');}}throw Error('Restore rejected: '+error.message);}
}
function readBackup(filename){const fd=fs.openSync(filename,'r');try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size>schema.limits.maxJsonBytes)throw Error('Backup must be a regular JSON file within the size limit.');const data=fs.readFileSync(fd);if(data.length>schema.limits.maxJsonBytes)throw Error('Backup exceeds the size limit.');return validateBackup(JSON.parse(data.toString('utf8')));}finally{fs.closeSync(fd);}}
if(require.main===module){try{const args=process.argv.slice(2);if(args.length!==4||args[0]!=='--input'||args[2]!=='--output')throw Error('Usage: node scripts/restore-operational-backup.cjs --input backup.json --output /isolated/new-archive.sqlite');const result=restoreBackup(readBackup(args[1]),args[3]);console.log(JSON.stringify(result,null,2));console.log('Offline inspection only. Do not mount this database with application code, live environment variables or provider credentials.');}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={validateBackup,restoreBackup,readBackup,safeRow};
