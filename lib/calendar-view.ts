// Civil dates stay in UTC for arithmetic; event grouping uses the saved calendar timezone.
export function calendarDate(ms:number,timezone:string){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(ms);
 const part=(name:string)=>parts.find(p=>p.type===name)!.value;
 return `${part('year')}-${part('month')}-${part('day')}`;
}
export function calendarMonth(value:unknown,fallback:string){return typeof value==='string'&&/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(value)?value:fallback.slice(0,7);}
export function shiftCalendarMonth(month:string,offset:number){const date=new Date(month+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+offset);return date.toISOString().slice(0,7);}
export function calendarDays(month:string){
 const first=new Date(month+'-01T12:00:00Z'),start=new Date(first);start.setUTCDate(1-first.getUTCDay());
 const last=new Date(first);last.setUTCMonth(last.getUTCMonth()+1,0);
 const count=Math.ceil((first.getUTCDay()+last.getUTCDate())/7)*7;
 return Array.from({length:count},(_,i)=>{const date=new Date(start);date.setUTCDate(start.getUTCDate()+i);return date.toISOString().slice(0,10);});
}
export function calendarWindow(month:string){const days=calendarDays(month);return {days,
 // Pad by a full day for every IANA UTC offset and DST midnight transitions.
 from:Date.parse(days[0]+'T00:00:00Z')-86400000,
 to:Date.parse(days[days.length-1]+'T00:00:00Z')+2*86400000};}
export function calendarDayLabel(day:string,options:Intl.DateTimeFormatOptions={weekday:'long',month:'long',day:'numeric'}){return new Intl.DateTimeFormat('en-US',{...options,timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'));}
export function calendarTime(ms:number,timezone:string,showZone=false){return new Intl.DateTimeFormat('en-US',{timeZone:timezone,hour:'numeric',minute:'2-digit',...(showZone?{timeZoneName:'short' as const}:{})}).format(ms);}
export function calendarDayItems<T extends {start:number;end:number}>(items:T[],day:string,timezone:string){return items.filter(a=>calendarDate(a.start,timezone)<=day&&calendarDate(a.end-1,timezone)>=day);}

export function calendarDayGroups<T extends {start:number;end:number}>(items:T[],days:string[],timezone:string){
 const groups:Record<string,T[]>={};for(const day of days)groups[day]=[];
 for(const item of items){const first=calendarDate(item.start,timezone),last=calendarDate(item.end-1,timezone);for(const day of days)if(first<=day&&last>=day)groups[day].push(item);}
 return groups;
}
