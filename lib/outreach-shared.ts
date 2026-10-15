export const PROSPECT_STATUSES={needs_review:'Needs review',ready:'Ready',paused:'Paused',responded:'Responded',converted:'In sales pipeline',archived:'Archived'} as const;
export type Prospect={id:string;company:string;website:string;domain:string;address:string;postal_code:string;contact:string;email:string;phone:string;industry:string;location:string;service:string;status:string;evidence:string;source_url:string;observed_at:string;research:string;source_notes:string;research_request_id:string;contact_candidates:string;import_source:string;lead_id:string|null;revision:number;created_at:string;updated_at:string};
export type Step={subject:string;body:string;delay:number};
export type Campaign={id:string;name:string;service:string;audience:string;status:string;steps:string;revision:number;created_at:string;updated_at:string};
export type Draft={id:string;campaign_id:string;prospect_id:string;step:number;recipient:string;subject:string;body:string;status:string;approved_at:string|null;approved_revision:number|null;sender_revision:number|null;sent_at:string|null;revision:number;created_at:string;updated_at:string;company?:string;campaign?:string};
export type Sender={daily_limit?:number;window_start?:string;window_end?:string;sender_name:string;sender_email:string;postal_address:string;revision:number};
export const OUTREACH_SERVICES={calls:'Receptionist & lead response',reviews:'Google reviews',website:'Website conversion',coding:'Business automation',audit:'Chatbot integration & auditing'} as const;
export const TEMPLATE_VARIABLES=['company','contact','evidence','sender','angle','opportunity','workflow','outcome','example','task','greeting','sales_subject','sales_hook','sales_problem','sales_actions','sales_support','sales_value'] as const;
export {STARTERS} from './outreach-copy';
// A strict CSV parser accepts quoted cells/newlines and rejects ambiguous malformed input.
export function parseCsv(raw:string):Record<string,string>[] {
 if(raw.length>400000)throw Error('Use a CSV smaller than 400 KB.');
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false;
 raw=raw.replace(/^\uFEFF/,'');
 for(let i=0;i<raw.length;i++){const c=raw[i];if(quoted){if(c==='"'){if(raw[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
 if(c==='"'){if(cell||closed)throw Error('Invalid CSV quoting.');quoted=true;continue;}
 if(c===','||c==='\n'||c==='\r'){row.push(cell.trim());cell='';closed=false;if(c!==','){if(c==='\r'&&raw[i+1]==='\n')i++;if(row.some(Boolean))rows.push(row);row=[];}continue;}
 if(closed&&c.trim())throw Error('Invalid characters after a quoted CSV cell.');if(!closed)cell+=c;
 }
 if(quoted)throw Error('An opening quote has no closing quote.');row.push(cell.trim());if(row.some(Boolean))rows.push(row);
 if(rows.length<2)throw Error('Include a header and at least one business.');if(rows.length>201)throw Error('Import up to 200 businesses at a time.');
 const headers=rows.shift()!.map(h=>h.toLowerCase().replace(/[\s-]+/g,'_'));
 if(new Set(headers).size!==headers.length)throw Error('CSV column names must be unique.');
 // Recognize the upstream gosom Google Maps CSV without asking users to rename columns.
 if(headers.includes('title')&&headers.includes('category')&&headers.includes('link'))return rows.map((r,index)=>{
  if(r.length!==headers.length)throw Error(`Row ${index+2} has the wrong number of columns.`);
  const data=Object.fromEntries(headers.map((h,j)=>[h,r[j]]));let address:Record<string,string>={};try{const parsed=JSON.parse(data.complete_address||'{}');if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))address=parsed;}catch{}
  const candidates=[...new Set((data.emails||'').match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}/gi)||[])];
  return {company:data.title,website:data.website||'',phone:data.phone||'',email:candidates.length===1?candidates[0]:'',contact:'',industry:data.category||'',location:[address.city,address.state].filter(Boolean).join(', '),address:data.address||'',postal_code:address.postal_code||'',service:'coding',evidence:'',source_url:data.link||'',observed_at:'',research:`Google Maps export. Place ID: ${data.place_id||'not supplied'}. Listing: ${data.link||'not supplied'}. Website-extracted email candidates (publication and owner not yet checked): ${candidates.join(', ')||'none'}. Ratings do not establish an unmet need.`};
 });
 if(!headers.includes('company')||!['website','phone','email'].some(h=>headers.includes(h)))throw Error('Include company and at least one website, phone, or email column.');
 const allowed=['company','website','contact','email','phone','industry','location','address','postal_code','service','evidence','source_url','observed_at','research'];
 if(headers.some(h=>!allowed.includes(h)))throw Error('Use the supplied template column names.');
 return rows.map((r,index)=>{if(r.length!==headers.length)throw Error(`Row ${index+2} has the wrong number of columns.`);return Object.fromEntries(headers.map((h,j)=>[h,r[j]]));});
}
