import {privateJson,RequestError,routeError} from './inquiries';

export type OutreachRead='prospects'|'total'|'counts'|'campaigns'|'drafts'|'draft_counts'|'activity'|'suppressions'|'sender';
class OutreachReadError extends Error {constructor(read:OutreachRead,cause:unknown){super('Outreach read failed.',{cause});this.read=read;}readonly read:OutreachRead;}
export async function outreachRead<T>(read:OutreachRead,pending:Promise<T>):Promise<T>{try{return await pending;}catch(error){throw new OutreachReadError(read,error);}}
export function logOutreachFailure(error:unknown,operation:'page'|'api'){
 const messages:string[]=[];let cause=error;for(let i=0;i<5&&cause instanceof Error;i++){messages.push(cause.message);cause=cause.cause;}const message=messages.join(' ');
 const category=/expression tree|parser stack|too many sql variables/i.test(message)?'query_shape':/timeout|timed out|maximum.*duration|time limit/i.test(message)?'timeout':/too many.*(quer|subrequest)|query limit/i.test(message)?'query_limit':/no such (table|column)|has no column/i.test(message)?'schema':/locked|busy|overload/i.test(message)?'database_busy':/memory|too (big|large)|size limit/i.test(message)?'size_limit':/SQLITE|D1_ERROR|database/i.test(message)?'database':'unexpected';
 // Only bounded labels leave this function; never log SQL, contacts or payloads.
 console.error('Outreach operation failed.',{operation,category,...(error instanceof OutreachReadError?{read:error.read}:{})});
}
export function outreachError(error:unknown){
 if(error instanceof RequestError)return routeError(error);
 logOutreachFailure(error,'api');
 return privateJson({ok:false,error:'The workspace could not finish this request. Try again; existing drafts are preserved.'},503);
}
