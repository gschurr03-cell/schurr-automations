import {AutomationNavigation,CRMShell,crmContext,AccessDenied,Unavailable,Empty,dateTime} from '../crm-ui';
import {OFFERS,RECIPES,recipesFor,type OfferId} from '@/lib/client-templates';
import {listClientSetups} from '@/lib/client-setups';
import {setupReadiness} from '@/lib/client-demo';
import {SetupForm} from './forms';
export const dynamic='force-dynamic';
export const metadata={title:'Client setups | Schurr Automations'};
export default async function Clients(){
 const {access,settings}=await crmContext('/manage/clients');let content;
 if(!access.allowed)content=<AccessDenied access={access}/>;else if(!settings)content=<Unavailable/>;else try{const data=await listClientSetups();content=<><AutomationNavigation active="/manage/clients"/>
 <div className="crm-setup-banner"><div><strong>One business brief. Reusable workflows.</strong><p>Choose the services a client bought, add their approved information, test example requests and download their setup kit. Each client’s live connections and data stay in a separate deployment.</p></div><a className="crm-button crm-button-secondary" href="#new-client">New client setup</a></div>
 <section className="crm-panel"><div className="crm-section-heading"><h2>Client setups</h2><span className="crm-help">Private to your owner account</span></div>{data.items.length?<div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Business</th><th>Services</th><th>Updated</th><th>Stage</th></tr></thead><tbody>{data.items.map(setup=><tr key={setup.id}><td><a href={`/manage/clients/${setup.id}`}>{setup.businessName}</a></td><td>{setup.offers.map(o=>OFFERS[o].name).join(' · ')}</td><td>{dateTime(setup.updatedAt,settings.timezone)}</td><td>{setupReadiness(setup.profile,setup.offers).ready} / {setupReadiness(setup.profile,setup.offers).total} templates ready to rehearse</td></tr>)}</tbody></table></div>:<Empty title="Your first client starts here">Create a business brief below. Each setup gets its own saved templates, example results and connection requirements.</Empty>}{data.hasMore&&<p className="crm-help">Showing the 200 most recently updated client setups.</p>}</section>
 <section className="crm-panel client-demo-entry"><div><p className="crm-eyebrow">READY TO PRESENT</p><h2>Demonstrate every service you offer.</h2><p>Use the filled example to show calls, website answers, review requests, local business checks, quotes and custom workflows. Every walkthrough has clear steps and examples of when work should stop.</p></div><a className="crm-button" href="/manage/clients/demo">Open guided demo</a></section>
 <section className="crm-panel client-catalog"><h2>Templates matched to your four offers</h2>{(Object.entries(OFFERS) as [OfferId,typeof OFFERS[OfferId]][]).map(([key,offer],i)=><article key={key} className="client-offer"><div><p className="crm-eyebrow">0{i+1}</p><h3>{offer.name}</h3><p>{offer.summary}</p></div><div><ul>{recipesFor([key]).map(r=><li key={r.id}>{r.name}</li>)}</ul><p className="crm-help">{offer.foundation}</p></div></article>)}</section>
 <section id="new-client" className="crm-panel"><h2>Start a client setup</h2><p className="crm-muted">Choose their package now. Fill in the background information and connections as you receive them.</p><SetupForm/></section>
 </>;}catch{content=<Unavailable/>;}
 return <CRMShell active="/manage/automations" title="Client setups" description="Reusable delivery templates for the services on your website." access={access} settings={settings}>{content}</CRMShell>;
}
