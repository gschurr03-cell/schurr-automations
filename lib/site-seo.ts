import home from '@/site-html/index.html?raw';
import how from '@/site-html/how-it-works/index.html?raw';
import why from '@/site-html/why-automation/index.html?raw';
import about from '@/site-html/meet-gavin/index.html?raw';
import demo from '@/site-html/demo.html?raw';
import privacy from '@/site-html/privacy/index.html?raw';
import calls from '@/site-html/solutions/ai-receptionist/index.html?raw';
import custom from '@/site-html/solutions/custom-automation/index.html?raw';
import website from '@/site-html/solutions/websites-chatbots/index.html?raw';
import seo from '@/site-html/solutions/local-seo-reviews/index.html?raw';
import dealers from '@/site-html/industries/used-car-dealers/index.html?raw';
import checklist from '@/site-html/resources/inquiry-checklist/index.html?raw';
import {getAutomationSettings,saveOperation,operationId} from './automation-desk';
export const SEO_PAGES=[{path:'/',html:home},{path:'/how-it-works/',html:how},{path:'/why-automation/',html:why},{path:'/meet-gavin/',html:about},{path:'/demo/',html:demo},{path:'/privacy/',html:privacy},{path:'/solutions/ai-receptionist/',html:calls},{path:'/solutions/custom-automation/',html:custom},{path:'/solutions/websites-chatbots/',html:website},{path:'/solutions/local-seo-reviews/',html:seo},{path:'/industries/used-car-dealers/',html:dealers},{path:'/resources/inquiry-checklist/',html:checklist}];
export function inspectSeoPages(pages=SEO_PAGES){
 const titles=pages.map(p=>p.html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim()||'');
 return pages.map((p,i)=>({path:p.path,title:titles[i],checks:[
  {name:'Descriptive page title',pass:titles[i].length>10&&titles[i].length<100},
  {name:'Unique title',pass:titles.filter(t=>t===titles[i]).length===1},
  {name:'Page description',pass:/<meta\s+name="description"\s+content="[^\"]{40,}"/i.test(p.html)},
  {name:'One main heading',pass:(p.html.match(/<h1(?:\s|>)/gi)||[]).length===1},
  {name:'Correct canonical URL',pass:p.html.includes(`rel="canonical" href="https://schurrautomations.com${p.path}"`)},
  {name:'Indexing allowed in page',pass:!/<meta[^>]*name="robots"[^>]*content="[^\"]*noindex/i.test(p.html)},
  {name:'Organization structured data',pass:p.html.includes('application/ld+json')&&p.html.includes('"@type":"Organization"')},
  {name:'Mobile viewport',pass:/name="viewport"/.test(p.html)},
 ]}));
}
export async function runSeoAudit(eventKey:unknown){const id=operationId(eventKey),settings=await getAutomationSettings(),pages=inspectSeoPages();const output={scope:'Technical checks of the page source included in this deployment. Not Google indexing, rankings, Core Web Vitals or a live crawl.',checkedAt:new Date().toISOString(),pages,passed:pages.reduce((n,p)=>n+p.checks.filter(c=>c.pass).length,0),total:pages.reduce((n,p)=>n+p.checks.length,0),sitemap:'https://schurrautomations.com/sitemap.xml',nextSteps:['Verify the Search Console property and submit the sitemap','Review search queries and service-page performance after data arrives','Confirm actual service area and Google profile eligibility before local listing work']};return {id:await saveOperation('seo',id,{},output,settings.revision),output};}
