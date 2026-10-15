import type {OfferId,ClientProfile} from './client-templates';
export const INSTALL_FIELDS=[
 ['origin','Client website origin','https://client.example'],['nativeOrigin','Additional deployment origin (optional)','https://client-host.example'],
 ['deploymentRef','Separate deployment reference',''],['databaseRef','Separate database reference',''],['ownerAccount','CRM approval owner email',''],
 ['senderEmail','Verified sending address to connect','alerts@notify.client.example'],['voiceAgentId','Voice agent reference (when created)',''],['inboundNumber','Dedicated inbound number','+1'],
 ['transferNumber','Transfer destination (if separately implemented)',''],['calendarRef','External calendar reference (optional)',''],
 ['googleLocationRef','Google business location reference',''],['searchProperty','Search Console property',''],['destinationRef','Application destination reference',''],
] as const;
export const INSTALL_CAPABILITIES={voice:'Phone receptionist',nativeBooking:'Native appointments',liveTransfer:'Live transfer (connection work required)',externalCalendar:'External calendar (connection work required)',googleReviews:'Review invitations',searchReporting:'Search reporting',customWrites:'Application writes (adapter required)',sms:'SMS (connection work required)'} as const;
export type InstallScope=Record<keyof typeof INSTALL_CAPABILITIES,'prepare'|'deferred'>;
export type InstallationTarget=Record<typeof INSTALL_FIELDS[number][0],string>&{scope:InstallScope};
export type ClientInstallation={clientId:string;revision:number;briefRevision:number;target:InstallationTarget;updatedAt:string;stale:boolean};
export function emptyInstallationTarget():InstallationTarget{return {...Object.fromEntries(INSTALL_FIELDS.map(([k])=>[k,''])),scope:Object.fromEntries(Object.keys(INSTALL_CAPABILITIES).map(k=>[k,'deferred']))} as InstallationTarget;}
export function installationNeeds(t:InstallationTarget){return INSTALL_FIELDS.filter(([k])=>['origin','deploymentRef','databaseRef','ownerAccount','senderEmail'].includes(k)&&!t[k]).map(([,label])=>label);}
export const capabilityOffer:Record<keyof InstallScope,OfferId>={voice:'calls',nativeBooking:'calls',liveTransfer:'calls',externalCalendar:'calls',googleReviews:'reviews',searchReporting:'reviews',customWrites:'coding',sms:'calls'};

export type PreparationProfile=Pick<ClientProfile,'businessName'|'contactName'|'services'|'website'|'alertEmail'|'replyEmail'|'timezone'|'publicPhone'>;
export function preparationNeeds(t:InstallationTarget,p:PreparationProfile){const needed:string[]=[...installationNeeds(t)];
 for(const [key,label] of [['businessName','Client business name'],['contactName','Client approval owner'],['services','Approved services'],['website','Approved website'],['alertEmail','Staff alert inbox'],['replyEmail','Customer reply inbox'],['timezone','Timezone']] as const)if(!p[key]?.trim())needed.push(label);
 if(p.businessName&&(/^[\s]*schurr automations[\s]*$/i.test(p.businessName)||/[\r\n<>]/.test(p.businessName)))needed.push('A valid separate client business name');
 if(p.website&&t.origin)try{if(new URL(p.website).origin!==new URL(t.origin).origin)needed.push('Matching approved website and installation origin');}catch{needed.push('Valid matching website and installation origin');}
 if(['19857710552','19852328337','9857710552','9852328337'].includes((p.publicPhone||'').replace(/\D/g,'')))needed.push('A separate client public phone number');return needed;
}
