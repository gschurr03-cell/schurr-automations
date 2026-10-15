import {getAutomationSettings,publicAssistant} from '@/lib/automation-desk';
export const dynamic='force-dynamic';
export async function GET(){try{return Response.json(publicAssistant(await getAutomationSettings()),{headers:{'Cache-Control':'public, max-age=60','X-Content-Type-Options':'nosniff'}});}catch{return Response.json({enabled:false,questions:[],contactUrl:'/#contact'},{status:503,headers:{'Cache-Control':'no-store'}});}}
