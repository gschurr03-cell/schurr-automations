import {RequestError} from './inquiries';
export type DayHours={enabled:boolean;start:string;end:string};
export type BookingConfig={enabled:boolean;title:string;timezone:string;duration:number;buffer:number;notice:number;horizon:number;hours:DayHours[];handoffNumber:string;handoffEnabled:boolean};
export type BookingSetup={config:BookingConfig;revision:number;updatedAt:string};
export function defaultBookingConfig():BookingConfig{return {enabled:false,title:'Schurr discovery call',timezone:'America/Denver',duration:30,buffer:10,notice:120,horizon:30,hours:Array.from({length:7},(_,i)=>({enabled:i>0&&i<6,start:'09:00',end:'17:00'})),handoffNumber:'',handoffEnabled:false};}
export function text(value:unknown,label:string,max=500){if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f\u007f]/.test(value))throw new RequestError(400,`Check ${label}.`);return value.trim();}
function integer(value:unknown,min:number,max:number,label:string){const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw new RequestError(400,`Check ${label}.`);return n;}
export function validTimezone(value:unknown){const zone=text(value,'timezone',80);try{new Intl.DateTimeFormat('en',{timeZone:zone});}catch{throw new RequestError(400,'Use a valid timezone such as America/Denver.');}return zone;}
export function minute(value:unknown){if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))throw new RequestError(400,'Use valid hours.');return Number(value.slice(0,2))*60+Number(value.slice(3));}
export function cleanBookingConfig(input:unknown):BookingConfig{if(!input||typeof input!=='object')throw new RequestError(400,'Provide booking settings.');const v=input as Record<string,unknown>;if(!Array.isArray(v.hours)||v.hours.length!==7)throw new RequestError(400,'Set all seven days.');const hours=v.hours.map(day=>{if(!day||typeof day!=='object')throw new RequestError(400,'Check daily hours.');const d=day as DayHours;if(minute(d.end)<=minute(d.start))throw new RequestError(400,'Each closing time must follow its opening time.');return {enabled:d.enabled===true,start:d.start,end:d.end};});
 const handoffNumber=typeof v.handoffNumber==='string'?v.handoffNumber.trim():'';if(handoffNumber&&!/^\+[1-9]\d{7,14}$/.test(handoffNumber))throw new RequestError(400,'Use + and country code for the handoff number.');
 const config={enabled:v.enabled===true,title:text(v.title,'appointment title',100),timezone:validTimezone(v.timezone),duration:integer(v.duration,15,120,'appointment length'),buffer:integer(v.buffer,0,60,'buffer'),notice:integer(v.notice,0,10080,'minimum notice'),horizon:integer(v.horizon,1,60,'booking horizon'),hours,handoffNumber,handoffEnabled:v.handoffEnabled===true};
 if(config.enabled&&!hours.some(d=>d.enabled&&minute(d.end)-minute(d.start)>=config.duration))throw new RequestError(400,'Enable at least one day long enough for an appointment.');return config;
}
export function dateOnly(value:unknown){const date=text(value,'date',10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new RequestError(400,'Choose a valid date.');return date;}
export function localParts(ms:number,timezone:string){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(ms);const get=(type:string)=>parts.find(p=>p.type===type)!.value;return {date:`${get('year')}-${get('month')}-${get('day')}`,minutes:Number(get('hour'))*60+Number(get('minute'))};}
export function appointmentTimeLabel(start:number,timezone:string){return new Intl.DateTimeFormat('en-US',{timeZone:timezone,weekday:'long',month:'long',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'shortOffset'}).format(start);}
export function civilTime(value:unknown,timezone:string){const raw=text(value,'local date and time',16);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw))throw new RequestError(400,'Choose a local date and time.');const date=dateOnly(raw.slice(0,10)),minutes=minute(raw.slice(11));const anchor=Date.parse(raw+'Z'),matches:number[]=[];
 for(let offset=-14*60;offset<=14*60;offset+=15){const time=anchor+offset*60000,p=localParts(time,timezone);if(p.date===date&&p.minutes===minutes)matches.push(time);}
 if(matches.length!==1)throw new RequestError(400,matches.length?'That local time occurs twice when clocks change. Choose a different time.':'That local time does not exist when clocks change. Choose a different time.');return matches[0];
}
export function candidateSlots(config:BookingConfig,date:string,now=Date.now()){
 dateOnly(date);const weekday=new Date(date+'T12:00:00Z').getUTCDay(),hours=config.hours[weekday];if(!hours.enabled)return [];
 const anchor=Date.parse(date+'T00:00:00Z'),startMinute=minute(hours.start),endMinute=minute(hours.end),slots:{start:number;end:number;label:string}[]=[];
 // Iterate real UTC instants; missing DST times are never offered. Offset in the
 // label distinguishes repeated local hours. Every offered slot is unambiguous.
 const format=new Intl.DateTimeFormat('en-US',{timeZone:config.timezone,weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'shortOffset'});
 for(let start=anchor-14*3600000;start<anchor+38*3600000;start+=15*60000){if(start<now+config.notice*60000||start>now+config.horizon*86400000)continue;const local=localParts(start,config.timezone),end=start+config.duration*60000,endLocal=localParts(end,config.timezone);if(local.date!==date||endLocal.date!==date||local.minutes<startMinute||endLocal.minutes>endMinute||endLocal.minutes-local.minutes!==config.duration)continue;slots.push({start,end,label:format.format(start)});}
 return slots;
}
