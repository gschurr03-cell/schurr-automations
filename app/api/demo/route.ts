import {demoScenario,DEMO_SERVICES,type DemoService} from '@/lib/response-policy';
import {privateJson} from '@/lib/inquiries';
export function GET(request:Request){
  const params=new URL(request.url).searchParams,service=params.get('service')||'calls',situation=params.get('situation')||'new';
  if(!DEMO_SERVICES.includes(service as DemoService)||!['new','pricing','booking','handoff','no-consent','stop'].includes(situation))return privateJson({ok:false,error:'Choose a sample from the demo.'},400);
  return privateJson({ok:true,mode:'scripted_preview',...demoScenario(service as DemoService,situation)});
}
