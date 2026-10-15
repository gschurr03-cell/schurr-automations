import { CRMShell, crmContext, AccessDenied, Unavailable, CRMForm, ContactFields } from '../../crm-ui';
export const dynamic='force-dynamic';
export const metadata={title:'Add lead | Schurr CRM'};
export default async function NewLead() {
  const {access,settings}=await crmContext('/manage/leads/new');
  return <CRMShell active="/manage/leads" title="Add a lead" description="Capture a conversation and its next opportunity." access={access} settings={settings} actions={<a href="/manage/leads" className="crm-button crm-button-secondary">Back to leads</a>}>{!access.allowed?<AccessDenied access={access}/>:!settings?<Unavailable/>:<section className="crm-panel crm-form-panel"><CRMForm action="createLead" submitLabel="Create lead"><ContactFields create/></CRMForm><p className="crm-help">Manual entries are not marked as website submissions and do not imply contact consent.</p></section>}</CRMShell>;
}
