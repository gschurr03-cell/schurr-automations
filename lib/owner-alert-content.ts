// This demo has one explicitly authorized recipient. Never take recipient,
// sender, URLs or headers from an inquiry, caller or webhook argument.
export const OWNER_ALERT_EMAIL='gavin@schurrautomations.com';
// Owner confirmed receipt of the prepared business-inbox test on October 2, 2026.
export const BUSINESS_INBOX_EMAIL='gavin@schurrautomations.com';
export const OWNER_ALERT_ORIGIN='https://schurr-automations.gavschurr.chatgpt.site';
export const OWNER_ALERT_FROM='Schurr Automations <alerts@notify.schurrautomations.com>';
export function ownerAlertPayload(leadId:string,lead:{name:string;business:string;email:string;phone:string;preferredContact:string;summary:string}){
  return JSON.stringify({from:OWNER_ALERT_FROM,to:[OWNER_ALERT_EMAIL],subject:'New Schurr receptionist request',text:[
    'A caller asked Gavin to follow up.',
    `Name: ${lead.name}`,lead.business?`Business: ${lead.business}`:'',
    `Preferred contact: ${lead.preferredContact}`,lead.email?`Email: ${lead.email}`:'',lead.phone?`Phone: ${lead.phone}`:'',
    `Request: ${lead.summary}`,'',`Review the request: ${OWNER_ALERT_ORIGIN}/manage/leads/${leadId}`,'',
    'Check the current request status before contacting the caller. This alert does not send them a reply or book an appointment.'
  ].filter(Boolean).join('\n')});
}

export function websiteOwnerAlertPayload(leadId:string,lead:{name:string;business:string;email:string;phone:string;service:string;preferredContact:string;message:string}){
  return JSON.stringify({from:OWNER_ALERT_FROM,to:[OWNER_ALERT_EMAIL],subject:'New Schurr website inquiry',text:[
    'A website visitor asked Gavin to follow up.',
    `Name: ${lead.name}`,lead.business?`Business: ${lead.business}`:'',
    `Service: ${lead.service}`,`Preferred contact: ${lead.preferredContact}`,lead.email?`Email: ${lead.email}`:'',lead.phone?`Phone: ${lead.phone}`:'',
    `Request: ${lead.message}`,'',`Review the request: ${OWNER_ALERT_ORIGIN}/manage/leads/${leadId}`,'',
    'Check the current request status before contacting the visitor. This alert does not send them a reply or book an appointment.'
  ].filter(Boolean).join('\n')});
}
