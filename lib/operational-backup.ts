import {database,RequestError} from './inquiries';
import schema from './operational-backup-schema.json';
// This contract is generated from trusted checkout migrations at development time.
// Neither table names nor SQL can come from a request or the downloaded backup.
const quote=(name:string)=>'"'+name.replace(/"/g,'""')+'"';
const literal=(name:string)=>"'"+name.replace(/'/g,"''")+"'";
const encoder=new TextEncoder();
const secretPattern=/(?:\b(?:re_|whsec_|sk-|key_)[A-Za-z0-9_-]{16,}|\bBearer\s+\S+|-----BEGIN[^\n]*PRIVATE KEY)/i;
const limitError=()=>new RequestError(413,'Operational backup exceeds the safe export limit. Nothing was truncated or downloaded. Arrange a larger reviewed export.');
export async function operationalBackup():Promise<string>{
 const l=schema.limits;
 const stats=schema.tables.map(table=>{const sizes=table.columns.map(c=>`length(CAST(COALESCE(${quote(c.name)},'') AS BLOB))`);return `SELECT ${literal(table.name)} AS table_name,count(*) AS row_count,COALESCE(sum(${sizes.join('+')}),0) AS byte_count,COALESCE(max(max(${sizes.join(',')})),0) AS max_cell FROM ${quote(table.name)}`;}).join(' UNION ALL ');
 const data=schema.tables.map(table=>`SELECT ${literal(table.name)} AS table_name,json_object(${table.columns.flatMap(c=>[literal(c.name),quote(c.name)]).join(',')}) AS row_json FROM ${quote(table.name)} WHERE (SELECT ok FROM allowed)=1`).join(' UNION ALL ');
 // One read transaction includes preflight totals, every row and FK verification.
 // Oversized snapshots return only the bounded statistics, never a partial export.
 const query=`WITH stats AS MATERIALIZED (${stats}),allowed AS MATERIALIZED (SELECT CASE WHEN sum(row_count)<=${l.maxRows} AND max(row_count)<=${l.maxRowsPerTable} AND sum(byte_count)<=${l.maxRawBytes} AND max(max_cell)<=${l.maxCellBytes} THEN 1 ELSE 0 END AS ok FROM stats) SELECT '__stats' AS table_name,json_group_array(json_object('name',table_name,'rows',row_count,'bytes',byte_count,'maxCell',max_cell)) AS row_json FROM stats UNION ALL ${data}`;
 const result=await database().batch([database().prepare(query),database().prepare('PRAGMA foreign_key_check')]);
 if(result[1]?.results?.length)throw new RequestError(503,'Operational backup was not created because database relationships need review.');
 const rows=result[0]?.results;
 if(!rows||typeof rows[0]?.row_json!=='string'||rows[0]?.table_name!=='__stats')throw new RequestError(503,'Operational backup snapshot could not be verified.');
 const counts=JSON.parse(rows[0].row_json) as {name:string;rows:number;bytes:number;maxCell:number}[];
 if(counts.length!==schema.tables.length||counts.some(c=>c.rows>l.maxRowsPerTable||c.maxCell>l.maxCellBytes)||counts.reduce((n,c)=>n+c.rows,0)>l.maxRows||counts.reduce((n,c)=>n+c.bytes,0)>l.maxRawBytes)throw limitError();
 const tables:Record<string,Record<string,string|number|null>[]>=Object.fromEntries(schema.tables.map(t=>[t.name,[]]));
 for(const item of rows.slice(1)){
  if(typeof item.table_name!=='string'||!Object.hasOwn(tables,item.table_name)||typeof item.row_json!=='string')throw new RequestError(503,'Operational backup contained an unexpected record.');
  const row=JSON.parse(item.row_json) as Record<string,string|number|null>,table=schema.tables.find(t=>t.name===item.table_name)!;
  for(const column of table.columns){const value=row[column.name];if(value===null? !column.nullable : column.type==='integer'? !Number.isSafeInteger(value):typeof value!=='string')throw new RequestError(503,'Operational backup contains a record that needs review.');if(typeof value==='string'&&value.includes('\u0000'))throw new RequestError(409,'An operational record contains unsupported text. Review it before exporting.');if(typeof value==='string'&&secretPattern.test(value))throw new RequestError(409,'A possible credential is stored in an operational text field. Remove it before exporting. No backup was downloaded.');}
  for(const [column,kind]of Object.entries(table.jsonColumns)){let parsed:unknown;try{parsed=JSON.parse(String(row[column]));}catch{throw new RequestError(409,'An operational JSON record needs review before export.');}if(kind==='array'?!Array.isArray(parsed):!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new RequestError(409,'An operational JSON record has an unsupported shape.');}
  tables[item.table_name].push(row);
 }
 for(const count of counts)if(tables[count.name]?.length!==count.rows)throw new RequestError(503,'Operational backup was incomplete. No partial download was created.');
 const output=JSON.stringify({format:schema.format,version:schema.version,schemaId:schema.schemaId,scope:schema.scope,createdAt:new Date().toISOString(),counts:Object.fromEntries(counts.map(c=>[c.name,c.rows])),tables});
 if(encoder.encode(output).byteLength>l.maxJsonBytes)throw limitError();
 return output;
}
