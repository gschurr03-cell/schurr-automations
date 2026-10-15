"""Pipecat/Gemini pipeline. Credentials and model availability require live acceptance."""
import asyncio
from pathlib import Path
import httpx
from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.frames.frames import LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker, ProcessorUnusablePolicy
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.services.google.gemini_live.llm import GeminiLiveLLMService
from pipecat.services.llm_service import FunctionCallParams
from pipecat.serializers.twilio import TwilioFrameSerializer
from pipecat.transports.websocket.fastapi import FastAPIWebsocketTransport, FastAPIWebsocketParams
from pipecat.workers.runner import WorkerRunner
from security import signed_event


async def run_call(websocket, call_sid: str, stream_sid: str, settings: dict):
    stopped = False
    async def save(event):
        body, headers = signed_event(event, settings['VOICE_INGEST_SECRET'])
        async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
            for attempt in range(2):
                try:
                    response = await client.post(settings['SCHURR_SITE_ORIGIN'] + '/api/voice/intake', content=body, headers=headers)
                    if response.status_code in (200, 201):
                        return response.json()
                    if response.status_code < 500:
                        return {'ok': False, 'message': 'Request not saved. Confirm the details or ask Gavin for help.'}
                except httpx.HTTPError:
                    pass
                if attempt == 0:
                    await asyncio.sleep(0.3)
        return {'ok': False, 'message': 'Could not confirm saving. Ask the caller to contact Gavin directly.'}

    async def capture(params: FunctionCallParams):
        if stopped:
            await params.result_callback({'ok': False, 'message': 'Contact permission was withdrawn. Do not capture this caller.'})
            return
        args = params.arguments
        if args.get('callbackConsent') is not True:
            await params.result_callback({'ok': False, 'message': 'Ask for explicit permission first.'})
            return
        event = {key: args.get(key, '') for key in ['name','business','email','phone','service','summary','preferredContact','consentEvidence']}
        event.update(callSid=call_sid, callbackConsent=True)
        await params.result_callback(await save(event))

    async def stop_contact(params: FunctionCallParams):
        nonlocal stopped
        stopped = True
        await params.result_callback(await save({'action': 'stop', 'callSid': call_sid}))

    properties = {key: {'type': 'string'} for key in ['name','business','email','phone','summary','consentEvidence']}
    properties['service'] = {'type': 'string', 'enum': ['calls','leads','general']}
    properties['preferredContact'] = {'type': 'string', 'enum': ['email','phone','text']}
    properties['callbackConsent'] = {'type': 'boolean', 'description': 'True only after explicit permission for Gavin to reply.'}
    tools = [FunctionSchema(name='capture_lead', description='Save confirmed caller details and permission for personal follow-up. One capture per call.', properties=properties, required=list(properties), handler=capture),
             FunctionSchema(name='stop_contact', description='Withdraw permission and pause follow-up for this call.', properties={}, required=[], handler=stop_contact)]
    serializer = TwilioFrameSerializer(stream_sid=stream_sid, call_sid=call_sid, params=TwilioFrameSerializer.InputParams(auto_hang_up=False))
    transport = FastAPIWebsocketTransport(websocket=websocket, params=FastAPIWebsocketParams(audio_in_enabled=True, audio_out_enabled=True, add_wav_header=False, serializer=serializer))
    llm = GeminiLiveLLMService(api_key=settings['GOOGLE_API_KEY'], settings=GeminiLiveLLMService.Settings(model=settings['GEMINI_LIVE_MODEL'], system_instruction=Path(__file__).with_name('business.md').read_text()), tools=tools)
    context = LLMContext()
    user, assistant = LLMContextAggregatorPair(context)
    worker = PipelineWorker(Pipeline([transport.input(), user, llm, transport.output(), assistant]), params=PipelineParams(audio_in_sample_rate=16000, audio_out_sample_rate=24000), processor_unusable_policy=ProcessorUnusablePolicy.END)
    runner = WorkerRunner(handle_sigint=False)
    await runner.add_workers(worker)

    @transport.event_handler('on_client_connected')
    async def connected(transport, client):
        context.add_message({'role': 'developer', 'content': 'Introduce yourself as the Schurr Automations AI assistant and ask what the caller wants to improve.'})
        await worker.queue_frames([LLMRunFrame()])

    @transport.event_handler('on_client_disconnected')
    async def disconnected(transport, client):
        await runner.cancel()

    try:
        await asyncio.wait_for(runner.run(), timeout=600)
    finally:
        await runner.cancel()
