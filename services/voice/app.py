"""Single-instance, inbound-only Schurr receptionist gateway. Disabled by default."""
import asyncio
import os
import re
import time
from urllib.parse import parse_qs, urlsplit
from xml.etree.ElementTree import Element, SubElement, tostring
from fastapi import FastAPI, HTTPException, Request, WebSocket
from fastapi.responses import Response
from twilio.request_validator import RequestValidator
from loguru import logger
from security import make_ticket, valid_ticket

# Pipecat debug logs can include spoken text; production gateway emits no transcript logs.
logger.remove()
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
active_calls = set()
used_tickets = {}
REQUIRED = ['TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_PHONE_NUMBER','GOOGLE_API_KEY','GEMINI_LIVE_MODEL','PUBLIC_VOICE_ORIGIN','SCHURR_SITE_ORIGIN','VOICE_INGEST_SECRET']


def configuration():
    config = {key: os.getenv(key, '').strip() for key in REQUIRED}
    if os.getenv('VOICE_ENABLED') != 'true' or any(not value for value in config.values()):
        raise HTTPException(503, 'Voice service is not activated.')
    for key in ('PUBLIC_VOICE_ORIGIN','SCHURR_SITE_ORIGIN'):
        value = urlsplit(config[key])
        if value.scheme != 'https' or not value.hostname or value.username or value.password or value.query or value.fragment or value.path not in ('','/'):
            raise HTTPException(503, 'Voice service configuration is incomplete.')
        config[key] = config[key].rstrip('/')
    if len(config['VOICE_INGEST_SECRET']) < 32:
        raise HTTPException(503, 'Voice service configuration is incomplete.')
    return config


@app.get('/health')
async def health():
    return {'ok': True, 'service': 'schurr-voice', 'liveCallVerified': False}


@app.post('/twilio/inbound')
async def inbound(request: Request):
    config = configuration()
    if request.url.query:
        raise HTTPException(400, 'Query parameters are not supported.')
    if request.headers.get('content-type','').split(';')[0] != 'application/x-www-form-urlencoded':
        raise HTTPException(415)
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 16384:
            raise HTTPException(413)
    form = parse_qs(body.decode('utf-8'), keep_blank_values=True, max_num_fields=100)
    if any(len(value) != 1 for value in form.values()):
        raise HTTPException(400)
    fields = {key: value[0] for key,value in form.items()}
    validator = RequestValidator(config['TWILIO_AUTH_TOKEN'])
    if not validator.validate(config['PUBLIC_VOICE_ORIGIN']+'/twilio/inbound', fields, request.headers.get('x-twilio-signature','')):
        raise HTTPException(403)
    call_sid = fields.get('CallSid','')
    if fields.get('AccountSid') != config['TWILIO_ACCOUNT_SID'] or fields.get('To') != config['TWILIO_PHONE_NUMBER'] or fields.get('Direction') != 'inbound' or not re.fullmatch(r'CA[0-9a-fA-F]{32}',call_sid):
        raise HTTPException(403)
    root = Element('Response')
    SubElement(root,'Say').text = 'You have reached the Schurr Automations AI receptionist. Our voice providers process this conversation. Please do not share sensitive information.'
    stream = SubElement(SubElement(root,'Connect'),'Stream',url=config['PUBLIC_VOICE_ORIGIN'].replace('https://','wss://',1)+'/twilio/media')
    SubElement(stream,'Parameter',name='ticket',value=make_ticket(call_sid,config['VOICE_INGEST_SECRET']))
    SubElement(root,'Say').text = 'Thank you for calling. If you still need help, contact Gavin directly at 9 8 5, 2 3 2, 8 3 3 7.'
    SubElement(root,'Hangup')
    return Response(tostring(root,encoding='unicode'),media_type='application/xml')


@app.websocket('/twilio/media')
async def media(websocket: WebSocket):
    try:
        config = configuration()
    except HTTPException:
        await websocket.close(code=1008)
        return
    if websocket.url.query:
        await websocket.close(code=1008)
        return
    validator = RequestValidator(config['TWILIO_AUTH_TOKEN'])
    public_url = config['PUBLIC_VOICE_ORIGIN']+'/twilio/media'
    # Twilio's upgrade uses the public HTTPS request URL; trailing slash is an
    # officially documented normalization. Only fixed configured origins are used.
    signature = websocket.headers.get('x-twilio-signature','')
    if not any(validator.validate(url,{},signature) for url in (public_url, public_url+'/', public_url.replace('https://','wss://',1), public_url.replace('https://','wss://',1)+'/')):
        await websocket.close(code=1008)
        return
    await websocket.accept()
    call_sid = None
    owns_slot = False
    try:
        connected = await asyncio.wait_for(websocket.receive_json(),10)
        started = await asyncio.wait_for(websocket.receive_json(),10)
        start = started.get('start',{})
        call_sid = start.get('callSid','')
        ticket = start.get('customParameters',{}).get('ticket','')
        now = time.time()
        for old in list(used_tickets):
            if used_tickets[old] < now:
                del used_tickets[old]
        if connected.get('event') != 'connected' or started.get('event') != 'start' or start.get('accountSid') != config['TWILIO_ACCOUNT_SID'] or not re.fullmatch(r'CA[0-9a-fA-F]{32}',call_sid) or not re.fullmatch(r'MZ[0-9a-fA-F]{32}',start.get('streamSid','')) or not valid_ticket(ticket,call_sid,config['VOICE_INGEST_SECRET']) or ticket in used_tickets or call_sid in active_calls or len(active_calls) >= 4:
            await websocket.close(code=1008)
            return
        used_tickets[ticket] = now + 120
        active_calls.add(call_sid)
        owns_slot = True
        from bot import run_call
        await run_call(websocket,call_sid,start['streamSid'],config)
    except Exception:
        # No raw provider exceptions, credentials, audio, or caller details in logs.
        pass
    finally:
        if owns_slot:
            active_calls.discard(call_sid)
        try:
            await websocket.close()
        except RuntimeError:
            pass
