import asyncio
import os
import sys
import types
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from twilio.request_validator import RequestValidator
import app as gateway
from security import make_ticket, valid_ticket

CONFIG = dict(VOICE_ENABLED='true', TWILIO_ACCOUNT_SID='AC'+'1'*32, TWILIO_AUTH_TOKEN='test-token', TWILIO_PHONE_NUMBER='+12025550111', GOOGLE_API_KEY='not-a-real-key', GEMINI_LIVE_MODEL='test-model', PUBLIC_VOICE_ORIGIN='https://voice.example.com', SCHURR_SITE_ORIGIN='https://site.example.com', VOICE_INGEST_SECRET='test-secret-'*4)
SID='CA'+'2'*32

class GatewayTests(unittest.TestCase):
    def setUp(self):
        self.env=patch.dict(os.environ,CONFIG);self.env.start()
        gateway.active_calls.clear();gateway.used_tickets.clear()
        self.client=TestClient(gateway.app)
        self.validator=RequestValidator(CONFIG['TWILIO_AUTH_TOKEN'])
    def tearDown(self):
        self.client.close();self.env.stop()
    def test_tickets_are_bound_expiring_and_tamper_proof(self):
        token=make_ticket(SID,CONFIG['VOICE_INGEST_SECRET'],1000)
        self.assertTrue(valid_ticket(token,SID,CONFIG['VOICE_INGEST_SECRET'],1100))
        for sid,secret,now in [(SID+'x',CONFIG['VOICE_INGEST_SECRET'],1100),(SID,'wrong',1100),(SID,CONFIG['VOICE_INGEST_SECRET'],1201),(SID,CONFIG['VOICE_INGEST_SECRET'],999)]:
            self.assertFalse(valid_ticket(token,sid,secret,now))
    def test_http_authentication_and_disabled_mode(self):
        fields={'AccountSid':CONFIG['TWILIO_ACCOUNT_SID'],'CallSid':SID,'To':CONFIG['TWILIO_PHONE_NUMBER'],'Direction':'inbound'}
        self.assertEqual(self.client.post('/twilio/inbound',data=fields).status_code,403)
        signature=self.validator.compute_signature(CONFIG['PUBLIC_VOICE_ORIGIN']+'/twilio/inbound',fields)
        response=self.client.post('/twilio/inbound',data=fields,headers={'X-Twilio-Signature':signature})
        self.assertEqual(response.status_code,200);self.assertIn('wss://voice.example.com/twilio/media',response.text);self.assertIn('ticket',response.text)
        with patch.dict(os.environ,{'VOICE_ENABLED':'false'}):self.assertEqual(self.client.post('/twilio/inbound',data=fields).status_code,503)
    def test_websocket_rejects_invalid_signature_before_model(self):
        with self.assertRaises(WebSocketDisconnect):
            with self.client.websocket_connect('/twilio/media'):pass
    def test_valid_call_uses_authenticated_ids_once_and_releases_slot(self):
        calls=[]
        async def fake_call(ws,sid,stream,config):calls.append((sid,stream))
        fake=types.SimpleNamespace(run_call=fake_call)
        signature=self.validator.compute_signature(CONFIG['PUBLIC_VOICE_ORIGIN']+'/twilio/media',{})
        ticket=make_ticket(SID,CONFIG['VOICE_INGEST_SECRET'])
        start={'event':'start','start':{'accountSid':CONFIG['TWILIO_ACCOUNT_SID'],'callSid':SID,'streamSid':'MZ'+'3'*32,'customParameters':{'ticket':ticket}}}
        with patch.dict(sys.modules,{'bot':fake}):
            for _ in range(2):
                with self.client.websocket_connect('/twilio/media',headers={'X-Twilio-Signature':signature}) as ws:
                    ws.send_json({'event':'connected'});ws.send_json(start)
                    with self.assertRaises(WebSocketDisconnect):ws.receive_json()
        self.assertEqual(calls,[(SID,'MZ'+'3'*32)]);self.assertFalse(gateway.active_calls)

if __name__=='__main__':unittest.main()
