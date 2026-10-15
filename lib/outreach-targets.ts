type Target={company?:string;industry?:string;domain?:string;website?:string};
// Owner's targeting preference: keep fast-food businesses out of agency outreach.
// Exact names/categories and dot-bounded official domains avoid excluding unrelated
// businesses such as McDonald Plumbing or Burger Roofing. History is retained.
const chains=[
 ['McDonalds','mcdonalds.com'],['Burger King','bk.com'],['Wendys','wendys.com'],['Taco Bell','tacobell.com'],
 ['KFC','kfc.com'],['Kentucky Fried Chicken','kfc.com'],['Chick fil A','chick-fil-a.com'],['Subway','subway.com'],
 ['Arbys','arbys.com'],['Popeyes','popeyes.com'],['Popeyes Louisiana Kitchen','popeyes.com'],['Sonic Drive In','sonicdrivein.com'],
 ['Jack in the Box','jackinthebox.com'],['Carls Jr','carlsjr.com'],['Hardees','hardees.com'],['Whataburger','whataburger.com'],
 ['In N Out Burger','in-n-out.com'],['Culvers','culvers.com'],['Raising Canes','raisingcanes.com'],['Raising Canes Chicken Fingers','raisingcanes.com'],
 ['Chipotle','chipotle.com'],['Chipotle Mexican Grill','chipotle.com'],['Qdoba','qdoba.com'],['Qdoba Mexican Eats','qdoba.com'],
 ['Panda Express','pandaexpress.com'],['Five Guys','fiveguys.com'],['Five Guys Burgers and Fries','fiveguys.com'],
 ['Dairy Queen','dairyqueen.com'],['Dairy Queen Grill and Chill','dairyqueen.com'],['Del Taco','deltaco.com'],
 ['Taco Johns','tacojohns.com'],['Good Times Burgers and Frozen Custard','goodtimesburgers.com'],
];
const removed=[' ',"'",'’','‘','-','_','.','\t'];
const normalize=(value:string)=>removed.reduce((s,c)=>s.split(c).join(''),value.toLowerCase());
const names=[...new Set(chains.map(([name])=>normalize(name)))],domains=[...new Set(chains.map(([,domain])=>domain))];
const categories=['fastfood','fastfoodrestaurant','fastfoodrestaurants','quickservice','quickservicerestaurant','quickservicerestaurants','qsr'];
function host(value:string){try{return new URL(value.includes('://')?value:`https://${value}`).hostname.toLowerCase().replace(/\.$/,'');}catch{return '';}}
export function excludedOutreachBusiness(p:Target){
 if(names.includes(normalize(p.company||'')))return true;
 if((p.industry||'').split(/[,;|/\n]/).some(v=>categories.includes(normalize(v))))return true;
 return [host(p.domain||''),host(p.website||'')].some(h=>domains.some(d=>h===d||h.endsWith('.'+d)));
}
const literal=(s:string)=>`'${s.replace(/'/g,"''")}'`;
function normalizedSql(expression:string){return removed.reduce((s,c)=>`replace(${s},${literal(c)},'')`,`lower(coalesce(${expression},''))`);}
export function outreachTargetSql(alias='outreach_prospects'){
 const industry=normalizedSql(`${alias}.industry`),tokens=['|','/', '\n',','].reduce((s,c)=>`replace(${s},${literal(c)},';')`,industry);
 const website=`replace(replace(lower(coalesce(${alias}.website,'')),'https://',''),'http://','')`;
 const websiteHost=`rtrim(substr(${website},1,instr(${website}||'/','/')-1),'.')`;
 const domain=`rtrim(lower(coalesce(${alias}.domain,'')),'.')`;
 const matches=[`${normalizedSql(`${alias}.company`)} IN (${names.map(literal).join(',')})`,
  `EXISTS(SELECT 1 FROM json_each(${literal(JSON.stringify(categories))}) target_category WHERE instr(';'||${tokens}||';',';'||target_category.value||';')>0)`,
  ...[domain,websiteHost].map(h=>`EXISTS(SELECT 1 FROM json_each(${literal(JSON.stringify(domains))}) target_domain WHERE ${h}=target_domain.value OR ${h} LIKE '%.'||target_domain.value)`),
 ];
 return `NOT (${matches.join(' OR ')})`;
}
