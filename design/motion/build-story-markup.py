"""Build page-specific workflow stories; preserve forms and the bespoke About page."""
from pathlib import Path
from html import escape
import re
import xml.etree.ElementTree as ET
from service_scenes import receptionist, website, search, demo
from process_scenes import automation, approach, evidence

CUSTOM_SCENES = dict(receptionist=receptionist, website=website, search=search, demo=demo, automation=automation, approach=approach, evidence=evidence)

ROOT = Path(__file__).resolve().parents[2]
MARK = 'M-5 2.45H-1.75C.1 2.45 .5 .55 2.35 .55H5V-.55H2.35C.5-.55 .1-2.45-1.75-2.45H-5V-1.35H-1.75C-.3-1.35 .1 0 1.65 0C.05 0-.5-.55-1.75-.55H-5V.55H-1.75C-.5 .55 .05 0 1.65 0C.1 0-.3 1.35-1.75 1.35H-5Z'

# Ordinary interface symbols, drawn as paths so labels remain genuine text.
ICONS = {
    'call':'M-13-17l-8 8c-2 2 1 12 10 21s19 12 21 10l8-8-10-8-6 4c-5-3-8-6-11-11l4-6Z',
    'web':'M-22-16H22V18H-22ZM-22-7H22M-15-12h2m5 0h2M-13 1H11M-13 7H4',
    'message':'M-21-16H21V13H-3L-15 22V13H-21ZM-12-6H12M-12 2H6',
    'record':'M-17-22H9L19-12V22H-17ZM9-22V-12H19M-8-3H10M-8 5H10M-8 13H4',
    'followup':'M-23-15H23V16H-23ZM-22-14L0 3 22-14M8 24h14m-5-5 5 5-5 5',
    'calendar':'M-21-16H21V22H-21ZM-21-5H21M-11-23V-10M11-23V-10M-9 9l6 6L12 1',
    'team':'M-6-11a9 9 0 1 0 0-.1M-21 21v-6c0-11 28-11 28 0v6M14-15a7 7 0 0 1 0 14M17 6c6 1 9 5 9 11v4',
    'check':'M-20 0l13 13L21-15',
    'search':'M8-4a15 15 0 1 0 0 .1M6 7L22 23',
    'star':'M0-22L7-6 24-4 11 8 15 25 0 16-15 25-11 8-24-4-7-6Z',
    'clock':'M21 0a21 21 0 1 0 0 .1M0-12V0L11 7',
    'branch':'M-23 0H-9C2 0-2-16 9-16H22M-9 0C2 0-2 16 9 16H22M15-23l7 7-7 7M15 9l7 7-7 7',
    'target':'M23 0a23 23 0 1 0 0 .1M12 0a12 12 0 1 0 0 .1M0 0H25M19-6l6 6-6 6',
    'chart':'M-22-22V23H24M-11 12V2M0 12V-9M11 12V-19',
    'tools':'M-22-13H22M-22 12H22M-10-21V-5M11 4V20',
    'person':'M10-12a10 10 0 1 0 0 .1M-21 22v-5c0-14 42-14 42 0v5',
}

def text(x,y,value,cls='workflow-node-label',anchor='middle'):
    return f'<text x="{x}" y="{y}" class="{cls}" text-anchor="{anchor}">{escape(value)}</text>'

def defs(prefix):
    return f'''<defs>
<linearGradient id="{prefix}-face" x1="0" y1="0" x2=".85" y2="1"><stop stop-color="#333238"/><stop offset=".47" stop-color="#222127"/><stop offset="1" stop-color="#18171d"/></linearGradient>
<linearGradient id="{prefix}-edge" x1="0" y1="0" x2=".65" y2="1"><stop stop-color="#c4c2ca"/><stop offset=".19" stop-color="#727079"/><stop offset=".48" stop-color="#424047"/><stop offset=".76" stop-color="#98909f"/><stop offset="1" stop-color="#504c58"/></linearGradient>
<linearGradient id="{prefix}-metal" x1="0" y1="0" x2="1" y2=".15"><stop stop-color="#e2e1e8"/><stop offset=".35" stop-color="#bcb6c7"/><stop offset=".63" stop-color="#ae80d3"/><stop offset="1" stop-color="#8450bf"/></linearGradient>
<linearGradient id="{prefix}-active" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#caa0ec"/><stop offset=".5" stop-color="#8450bf"/><stop offset="1" stop-color="#5e3e78"/></linearGradient>
<radialGradient id="{prefix}-halo"><stop stop-color="#9c69c9" stop-opacity=".2"/><stop offset="1" stop-color="#8450bf" stop-opacity="0"/></radialGradient>
<filter id="{prefix}-shadow" x="-40%" y="-40%" width="180%" height="220%"><feDropShadow dx="0" dy="12" stdDeviation="8" flood-color="#000" flood-opacity=".44"/></filter>
<filter id="{prefix}-light" x="-250%" y="-250%" width="600%" height="600%"><feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>'''

def node(prefix,key,x,y,label,icon,activation,detail=''):
    icon_art=(f'<path d="{MARK}" transform="scale(5.6 -5.6)" fill="url(#{prefix}-metal)" stroke="none"/>' if icon=='fusion' else f'<path d="{ICONS[icon]}" fill="none" stroke="#d8d3e0" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>')
    extent=max(62, len(label)*4.7, len(detail)*3.75) + 10
    # Six pixels of chassis depth, a cut metal rim, and a recessed graphite face.
    # The silhouette is deliberately angular; no soft toy-like rounded blocks.
    return f'''<g class="workflow-node" data-workflow-node="" data-node-key="{key}" data-x="{x}" data-extent="{extent}" data-label-extent="{max(62,len(label)*4.7)+10}" data-from="{activation}" transform="translate({x} {y})">
<ellipse cx="0" cy="10" rx="79" ry="68" fill="url(#{prefix}-halo)"/>
<g filter="url(#{prefix}-shadow)"><path d="M-52-31L-45-38H45L52-31V32L45 39H-45L-52 32Z" transform="translate(0 6)" fill="#0c0b10" stroke="#37323f" stroke-width="1"/>
<path d="M-52-31L-45-38H45L52-31V32L45 39H-45L-52 32Z" fill="url(#{prefix}-face)" stroke="url(#{prefix}-edge)" stroke-width="1.3"/>
<path d="M-48-29L-43-34H43L48-29V29L43 34H-43L-48 29Z" fill="none" stroke="#514b5b" stroke-width=".55"/>
<path d="M-43-34H43M-48-28V19" fill="none" stroke="#e2dee8" stroke-opacity=".12" stroke-width="1"/></g>
<g class="workflow-node-active" opacity="0"><path d="M-52-31L-45-38H45L52-31V32L45 39H-45L-52 32Z" fill="#8450bf" fill-opacity=".09" stroke="url(#{prefix}-active)" stroke-width="1.5"/><path d="M-18 35H18" stroke="#bf90e7" stroke-width="2.4"/></g>
<g class="workflow-icon">{icon_art}</g>
<g class="workflow-node-check" opacity="0" transform="translate(37 -23)"><circle r="6.5" fill="#382444" stroke="#ae84cd" stroke-width=".7"/><path d="M-3 0l2 2.2L3.4-2.4" fill="none" stroke="#dfc5f2" stroke-width="1.15"/></g>
{text(0,69,label)}{text(0,89,detail,'workflow-node-detail') if detail else ''}
</g>'''

def connection(prefix,key,d,start,end):
    pid=f'{prefix}-path-{key}'
    return f'''<path d="{d}" class="workflow-wire" fill="none" stroke="#52465e" stroke-width="1.15"/>
<path id="{pid}" d="{d}" class="story-trace workflow-trace" fill="none" stroke="#b785df" stroke-width="1.9" stroke-linecap="round" pathLength="1" data-story-trace="" data-from="{start}" data-to="{end}"/>
<circle class="workflow-packet" r="3.1" fill="#e3c4ff" filter="url(#{prefix}-light)" opacity="0" data-story-packet="" data-path="{pid}" data-from="{start}" data-to="{end}"/>'''

GRAPHS={
'home':dict(inputs=[('Call','call'),('Website','web'),('Message','message')],center=('AI qualifies','fusion'),branches=[('Customer record','record'),('Follow-up','followup')],result=('Appointment','calendar'),outcome=('Team notified','team'),details=['Understand the request','Details in the right place','A clear next step','Confirmed','Ready to help']),
'receptionist':dict(inputs=[('Questions','message'),('Service request','call'),('Availability','clock')],center=('AI receptionist','fusion'),branches=[('Useful answers','record'),('Next step','branch')],result=('Appointment','calendar'),outcome=('Team informed','team'),details=['Listen and understand','Approved information','Route or arrange','When appropriate','The context comes too']),
'website':dict(inputs=[('Search','search'),('Recommendation','star'),('Direct visit','web')],center=('Your website','web'),branches=[('Clear offer','target'),('Useful answers','message')],result=('New inquiry','followup'),outcome=('Team ready','team'),details=['A confident first impression','Why choose you','What they need to know','Interest becomes a conversation','Respond with context']),
'automation':dict(inputs=[('Customer','person'),('Request','message'),('Your tools','tools')],center=('Your workflow','fusion'),branches=[('Record updated','record'),('Action prepared','branch')],result=('Next step','check'),outcome=('Team handoff','team'),details=['The agreed process','One source of context','The right next action','The work keeps moving','Nothing lost between tools']),
'search':dict(inputs=[('Service search','search'),('Local intent','target'),('Recommendation','star')],center=('Your business','web'),branches=[('Clear information','record'),('Customer reviews','star')],result=('Get in touch','call'),outcome=('Your response','message'),details=['Be easy to understand','Services and location','Real customer experience','A useful next step','Start a useful conversation']),
'approach':dict(inputs=[('Your goals','target'),('Your operation','team'),('Your tools','tools')],center=('Map the flow','fusion'),branches=[('Build and connect','branch'),('Review the rules','record')],result=('Test together','check'),outcome=('Launch','target'),details=['Understand the real work','The agreed scope','The right boundaries','Complete scenarios','A clear handoff']),
'about':dict(inputs=[('Your goals','target'),('Your team','team'),('Your tools','tools')],center=('Gavin Schurr','person'),branches=[('Design and build','tools'),('Work together','message')],result=('Launch','check'),outcome=('Support','branch'),details=['One direct point of contact','Fit the business','Keep the feedback close','Review together','Refine what matters']),
'evidence':dict(inputs=[('Missed inquiries','call'),('Manual work','record'),('Slow follow-up','clock')],center=('Find the gap','search'),branches=[('Connect the steps','fusion'),('Set the baseline','chart')],result=('Measure','chart'),outcome=('Review','check'),details=['Look at your own operation','Make follow-through deliberate','Agree what success means','Track your result','Decide what comes next'])
}

def graph(kind,prefix):
    data=GRAPHS[kind]
    art='<g data-story-camera="">'
    art+=text(18,29,'INQUIRY' if kind in ('home','receptionist') else 'THE START','workflow-section-label','start')
    art+=text(910,29,'THE OUTCOME','workflow-section-label')
    art+='<path d="M18 443H962" stroke="#332a3d" stroke-width=".7"/>'
    for x in [70,280,490,700,910]:art+=f'<path d="M{x} 438V448" stroke="#5c486c" stroke-width=".8"/>'
    for i,y in enumerate([85,230,345]):
        art+=connection(prefix,f'in-{i}',f'M122 {y}H155C190 {y} 190 230 228 230',.005+i*.017,.18+i*.012)
    art+=connection(prefix,'qualify-record','M332 230H358C392 230 394 125 429 125H438',.21,.41)
    art+=connection(prefix,'qualify-followup','M332 230H358C392 230 394 335 429 335H438',.24,.51)
    art+=connection(prefix,'record-book','M542 125H569C607 125 605 230 638 230H648',.43,.735)
    art+=connection(prefix,'followup-book','M542 335H569C607 335 605 230 638 230H648',.53,.735)
    art+=connection(prefix,'book-team','M752 230H858',.755,.935)
    for i,(label,icon) in enumerate(data['inputs']):art+=node(prefix,f'source-{i}',70,[85,230,345][i],label,icon,0)
    art+=node(prefix,'qualify',280,230,*data['center'],.18,data['details'][0])
    for i,(label,icon) in enumerate(data['branches']):art+=node(prefix,['record','followup'][i],490,[125,335][i],label,icon,[.41,.51][i],data['details'][1+i])
    art+=node(prefix,'result',700,230,*data['result'],.735,data['details'][3])
    art+=node(prefix,'outcome',910,230,*data['outcome'],.935,data['details'][4])
    return art+'</g>'

STORIES={
 'home': dict(kicker='One connected customer journey', overview='An inquiry arrives, its details reach the right tools, and the customer gets a confirmed next step.', steps=[('Receive','Be there when interest is fresh.','Calls, website visits, and messages become one clear customer conversation.'),('Connect','Every detail reaches the right place.','Capture the request, update your records, and prepare the follow-up.'),('Book','Carry the opportunity through.','Agree the next step, update the calendar, and keep your team informed.')]),
 'receptionist':dict(kicker='From first ring to next step',overview='A call is answered, the request is captured, and the next step is arranged.',steps=[('Answer','The conversation starts.','Answer approved questions and understand what the caller needs.'),('Understand','Turn the conversation into useful details.','Capture the request and send the right information to your team and tools.'),('Arrange','Give the caller a clear next step.','Help qualified callers book or route the conversation to the right person.')]),
 'website':dict(kicker='A website with a clear purpose',overview='A visitor understands the offer, sees a clear action, and starts an inquiry.',steps=[('Understand','Make your value easy to see.','A clear offer, confident presentation, and a page built around your customer.'),('Choose','Make the next move obvious.','Give interested visitors a focused, useful way to reach you.'),('Inquire','Start a useful conversation.','Capture enough detail to help your team respond well.')]),
 'automation':dict(kicker='One opportunity, carried through',overview='Disconnected tools become a coordinated process with a complete customer record.',steps=[('Map','Find where the work gets stuck.','Map the handoffs between your people, customer details, quotes, and calendar.'),('Connect','Move the details with the customer.','Connect the agreed tools and route each request to the right next action.'),('Continue','Give the team a complete picture.','Keep the customer record, next step, and team handoff together.')]),
 'search':dict(kicker='From search to consideration',overview='A customer searches, finds a useful answer, and knows how to get in touch.',steps=[('Search','Meet a moment of intent.','Help customers understand where you work and the services you provide.'),('Answer','Give them a useful answer.','Make your business information clear, consistent, and easy to consider.'),('Contact','Make it easy to get in touch.','Connect discovery to a useful page and a clear inquiry path.')]),
 'approach':dict(kicker='From understanding to launch',overview='We map the business need, connect the process, and test it before launch.',steps=[('Understand','Start with the operation.','Understand your customers, your tools, and the gap worth solving.'),('Build','Build around the real workflow.','Connect the steps with a clear scope and an agreed purpose.'),('Test','Check the complete journey.','Review real scenarios and handoffs together before launch.')]),
 'about':dict(kicker='Work directly with Gavin',overview='Your business goals shape the build, followed by ongoing review and support.',steps=[('Listen','The business comes first.','Your goals and the way your team works shape the project.'),('Build','Work directly with the person building it.','From the first conversation to the finished workflow, you work with Gavin.'),('Support','Keep improving what matters.','Review the work, refine the details, and keep the next step clear.')]),
 'evidence':dict(kicker='See the process behind the numbers',overview='Find a gap between inquiry and action, connect the next steps, then measure the outcome.',steps=[('Identify','Find the gap in the journey.','An inquiry only creates an opportunity if the next step happens.'),('Connect','Make the follow-through deliberate.','Build a clear path between the request, your records, and your team.'),('Measure','Measure your own result.','Agree a baseline and success measures, then review the outcome together.')])
}

def final_scene(markup, progress=1):
    """Static end state remains useful before JS and with scripts disabled."""
    def smooth(value):
        value=max(0,min(1,value));return value*value*(3-2*value)
    root=ET.fromstring('<g>'+markup+'</g>')
    for el in root.iter():
        d=el.attrib
        if 'data-story-trace' in d:
            amount=max(0,min(1,(progress-float(d['data-from']))/max(.001,float(d['data-to'])-float(d['data-from']))))
            el.set('style', f'stroke-dashoffset:{1-amount}')
        if 'data-story-reveal' in d or 'data-story-window' in d:
            enter=smooth((progress-float(d['data-from']))/max(.001,float(d['data-to'])-float(d['data-from'])))
            leave=smooth((progress-float(d['data-until']))/max(.001,float(d['data-end'])-float(d['data-until']))) if 'data-until' in d else 0
            el.set('style',f'opacity:{enter*(1-leave)}')
        if 'data-story-motion' in d:
            amount=smooth((progress-float(d['data-from']))/max(.001,float(d['data-to'])-float(d['data-from'])))
            def lerp(key,default):
                first=float(d.get('data-from-'+key,default));last=float(d.get('data-to-'+key,default));return first+(last-first)*amount
            el.set('transform',f'translate({lerp("x",0)} {lerp("y",0)}) scale({lerp("scale",1)})')
        if 'data-story-packet' in d:el.set('style','opacity:0')
    return ET.tostring(root,encoding='unicode')

STORIES['demo']=dict(kicker='Hear it. See the handoff.',overview='An example caller explains a request, the receptionist confirms details, and the team receives a useful handoff.',steps=[('Listen','Hear the customer’s request.','The conversation starts with the service and help they need.'),('Confirm','Make the details clear.','Approved questions capture the information needed for a useful next step.'),('Handoff','Give your team the context.','Pass along the request and the agreed follow-up. Try the real phone demo below.')])

def figure(kind,prefix,home=False):
    data=STORIES[kind]
    custom=kind in CUSTOM_SCENES
    viewport='0 0 680 460' if custom else '-25 0 1060 460'
    art=final_scene(CUSTOM_SCENES[kind](prefix)) if custom else defs(prefix)+graph(kind,prefix)
    svg=f'<svg viewBox="{viewport}" data-story-viewport="" aria-hidden="true" focusable="false">{art}</svg>'
    buttons=''.join(f'<button type="button" data-story-step="{i}" data-progress="{progress}" data-title="{escape(title,quote=True)}" data-description="{escape(desc,quote=True)}" aria-pressed="{"true" if i==0 else "false"}" hidden>{escape(label)}</button>' for i,((label,title,desc),progress) in enumerate(zip(data['steps'],[.28,.65,1])))
    h='h2' if home else 'h3'
    overview='' if custom else '<button type="button" data-story-overview hidden>View full workflow</button>'
    return f'''<figure class="workflow-story {'home-story' if home else ''}" data-workflow-story data-story-kind="{kind}" data-story-fixed="{str(custom).lower()}" data-story-mode="once" aria-label="{escape(data['overview'],quote=True)}"><div class="story-meta"><span>{escape(data['kicker'])}</span><span class="story-illustrative">Illustrative workflow</span></div><div class="story-screen">{svg}</div><figcaption class="story-copy"><{h} data-story-headline>{escape(data['steps'][2 if custom else 0][1])}</{h}><p data-story-summary>{escape(data['steps'][2 if custom else 0][2])}</p></figcaption><div class="story-controls"><div class="story-steps" aria-label="Story chapters">{buttons}</div><div class="story-playback">{overview}<button type="button" data-story-pause aria-pressed="false" hidden>Pause motion</button></div></div><p class="story-accessible">Illustrative workflow. {escape(data['overview'])}</p><span class="story-accessible" data-story-announcement aria-live="polite" aria-atomic="true"></span></figure>'''

def matching_end(s,start,tag):
    depth=0
    for m in re.finditer(r'</?'+tag+r'\b[^>]*>',s[start:]):
        depth += -1 if m.group().startswith('</') else 1
        if depth==0:return start+m.end()
    raise ValueError(f'Unclosed {tag}')

PAGES={
 'solutions/ai-receptionist/index.html':('receptionist','One conversation. A useful next step.','A receptionist should do more than pick up. It should understand the request and help move it forward.'),
 'solutions/websites-chatbots/index.html':('website','From a first impression to a first conversation.','Every visual choice supports the same goal: help the right customer understand you and take the next step.'),
 'solutions/custom-automation/index.html':('automation','Make the handoffs feel seamless.','Customer details should move with the work, from the first request to the team carrying it through.'),
 'solutions/local-seo-reviews/index.html':('search','Be useful at the moment they are looking.','Help customers find clear information, consider your business, and know how to reach you.'),
 'how-it-works/index.html':('approach','A clear path from conversation to launch.','Understand the business first. Build the right connection. Check the complete journey.'),
 'why-automation/index.html':('evidence','The value is in what happens next.','Find the gap, improve the process, and measure the result against your own starting point.'),
 'demo.html':('demo','A conversation becomes useful information.','Hear how a caller can ask questions, explain a request, and reach a clear next step.')
}

if __name__=='__main__':
    for relative,(kind,title,description) in PAGES.items():
        p=ROOT/'site-html'/relative;s=p.read_text()
        content=f'<section class="container motion-section" data-motion-section aria-label="{escape(title,quote=True)}"><div class="motion-section-copy"><span class="eyebrow">See the flow</span><h2>{escape(title)}</h2><p>{escape(description)}</p><a href="/book">Talk through your workflow</a></div>{figure(kind,"story-"+kind)}</section>'
        found=re.search(r'<section\b[^>]*\bdata-motion-section[^>]*>',s)
        if found:
            start=found.start();end=matching_end(s,start,'section');s=s[:start]+content+s[end:]
        else:
            start=s.index('<section',s.index('<main'));end=matching_end(s,start,'section');s=s[:end]+content+s[end:]
        p.write_text(s)
    p=ROOT/'site-html/index.html';s=p.read_text();start=s.index('<div class="signal-visual">');end=matching_end(s,start,'div')
    s=s[:start]+'<div class="signal-visual">'+figure('home','home-story',True)+'</div>'+s[end:]
    s=s.replace('<link rel="stylesheet" href="/signal-journey.css">','')
    s=re.sub(r'<script[^>]*src="/signal-journey.js"[^>]*></script>','',s)
    p.write_text(s)
    for p in (ROOT/'site-html').rglob('*.html'):
        if p.relative_to(ROOT/'site-html').as_posix() == 'meet-gavin/index.html':
            continue
        s=p.read_text()
        if 'href="/narrative-motion.css"' not in s:s=s.replace('</head>','<link rel="stylesheet" href="/narrative-motion.css"></head>')
        s=re.sub(r'<script[^>]*src="/workflow-stories.js"[^>]*></script>','',s)
        s=s.replace('</body>','<script src="/workflow-stories.js" defer></script></body>')
        if 'class="page-entry-line"' not in s:s=s.replace('</header>','</header><div class="page-entry-line" aria-hidden="true"></div>',1)
        p.write_text(s)
    # Each visual has its own composition. Review assets keep the actual timeline state.
    review_css="text{font-family:Arial,sans-serif;fill:#ebe6f0;font-weight:400}.workflow-node-label{font-size:18px}.workflow-node-detail{font-size:14px;fill:#bcb0c8}.workflow-section-label{font-size:10px;fill:#b4a2c3;letter-spacing:1.8px}.workflow-node-active{opacity:1}.workflow-packet{display:none}"
    for kind in ['home',*CUSTOM_SCENES]:
        custom=kind in CUSTOM_SCENES
        for i,progress in enumerate([.28,.65,1]):
            left,width=(0,680) if custom else [(-30,680),(270,680),(440,680)][i]
            art=final_scene(CUSTOM_SCENES[kind](kind),progress) if custom else defs(kind)+graph(kind,kind)
            p=ROOT/'design/motion'/f'{kind}-chapter-{i+1}.svg'
            p.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{left} 0 {width} 460"><style>{review_css}</style><rect x="-100" width="1250" height="460" fill="#111113"/>{art}</svg>')
        viewport='0 0 680 460' if custom else '-25 0 1060 460'
        art=final_scene(CUSTOM_SCENES[kind](kind)) if custom else defs(kind)+graph(kind,kind)
        p=ROOT/'design/motion'/f'{kind}-workflow.svg'
        p.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewport}"><style>{review_css}</style><rect x="-100" width="1250" height="460" fill="#111113"/>{art}</svg>')
    print('Built eight distinct workflow illustrations; About is authored separately.')
