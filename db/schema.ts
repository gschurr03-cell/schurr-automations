import {sql} from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Contact-free receipts survive deletion, preventing replay of a submitted form.
export const inquiryReceipts=sqliteTable('inquiry_receipts',{
  submissionKey:text('submission_key').primaryKey(),receiptId:text('receipt_id').notNull(),createdAt:text('created_at').notNull(),
});

export const inquiries = sqliteTable('inquiries', {
  id: text('id').primaryKey(),
  submissionKey: text('submission_key').notNull(),
  bodyHash: text('body_hash').notNull(),
  name: text('name').notNull(),
  business: text('business').notNull().default(''),
  email: text('email').notNull().default(''),
  phone: text('phone').notNull().default(''),
  service: text('service').notNull(),
  message: text('message').notNull(),
  preferredContact: text('preferred_contact').notNull(),
  consentAt: text('consent_at').notNull(),
  createdAt: text('created_at').notNull(),
}, table => [uniqueIndex('inquiries_submission_key_unique').on(table.submissionKey), index('inquiries_created_at_id_idx').on(table.createdAt, table.id)]);

export const dailyMetrics = sqliteTable('daily_metrics', {
  day: text('day').notNull(),
  event: text('event').notNull(),
  route: text('route').notNull(),
  service: text('service').notNull(),
  count: integer('count').notNull().default(0),
}, table => [primaryKey({ columns: [table.day, table.event, table.route, table.service] })]);

export const requestLimits = sqliteTable('request_limits', {
  bucket: text('bucket').primaryKey(),
  hits: integer('hits').notNull(),
  expiresAt: integer('expires_at').notNull(),
}, table => [index('request_limits_expiry_idx').on(table.expiresAt)]);

// Website submissions remain immutable. CRM fields overlay them only after an
// owner edit, so existing and new inquiries need no import or backfill.
export const crmLeads = sqliteTable('crm_leads', {
  id: text('id').primaryKey(),
  inquiryId: text('inquiry_id').references(() => inquiries.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), business: text('business').notNull().default(''),
  email: text('email').notNull().default(''), phone: text('phone').notNull().default(''),
  service: text('service').notNull().default('general'),
  preferredContact: text('preferred_contact').notNull().default('email'),
  source: text('source').notNull().default('manual'),
  stage: text('stage').notNull().default('new'),
  monthlyCents: integer('monthly_cents').notNull().default(0),
  setupCents: integer('setup_cents').notNull().default(0),
  revision: integer('revision').notNull().default(1),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, table => [uniqueIndex('crm_leads_inquiry_idx').on(table.inquiryId), index('crm_leads_created_idx').on(table.createdAt, table.id)]);

export const crmEvents = sqliteTable('crm_events', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').notNull().references(() => crmLeads.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), body: text('body').notNull(), createdAt: text('created_at').notNull(),
}, table => [index('crm_events_lead_created_idx').on(table.leadId, table.createdAt, table.id)]);

export const crmTasks = sqliteTable('crm_tasks', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').references(() => crmLeads.id, { onDelete: 'cascade' }),
  title: text('title').notNull(), dueDate: text('due_date').notNull(),
  completedAt: text('completed_at'), revision: integer('revision').notNull().default(1),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, table => [index('crm_tasks_due_idx').on(table.completedAt, table.dueDate, table.id), index('crm_tasks_lead_idx').on(table.leadId)]);

export const crmSettings = sqliteTable('crm_settings', {
  id: text('id').primaryKey(), businessName: text('business_name').notNull(),
  ownerName: text('owner_name').notNull(), replyEmail: text('reply_email').notNull().default(''),
  replyPhone: text('reply_phone').notNull(), timezone: text('timezone').notNull(),
  setupComplete: integer('setup_complete').notNull().default(0),
  revision: integer('revision').notNull().default(1), updatedAt: text('updated_at').notNull(),
});

export const crmMutations = sqliteTable('crm_mutations', {
  id: text('id').primaryKey(), requestHash: text('request_hash').notNull(),
  attemptId: text('attempt_id').notNull().default(''),
  redirect: text('redirect').notNull(), createdAt: text('created_at').notNull(),
});

export const outreachProspects = sqliteTable('outreach_prospects', {
  id:text('id').primaryKey(), company:text('company').notNull(), website:text('website').notNull().default(''), domain:text('domain').notNull().default(''),
  contact:text('contact').notNull().default(''), email:text('email').notNull().default(''), phone:text('phone').notNull().default(''), industry:text('industry').notNull().default(''), location:text('location').notNull().default(''),
  importIdentity:text('import_identity'), recordKey:text('record_key'), address:text('address').notNull().default(''), postalCode:text('postal_code').notNull().default(''),
  service:text('service').notNull().default('calls'), status:text('status').notNull().default('needs_review'),
  evidence:text('evidence').notNull().default(''), sourceUrl:text('source_url').notNull().default(''), observedAt:text('observed_at').notNull().default(''),
  sourceNotes:text('source_notes').notNull().default(''),research:text('research').notNull().default(''), researchRequestId:text('research_request_id').notNull().default(''), contactCandidates:text('contact_candidates').notNull().default('[]'), importSource:text('import_source').notNull().default('Manual entry'),
  leadId:text('lead_id').references(()=>crmLeads.id,{onDelete:'set null'}), revision:integer('revision').notNull().default(1),
  createdAt:text('created_at').notNull(), updatedAt:text('updated_at').notNull(),
},t=>[index('outreach_domain_idx').on(t.domain),uniqueIndex('outreach_import_identity_idx').on(t.importIdentity),uniqueIndex('outreach_record_key_idx').on(t.recordKey),index('outreach_prospect_status_idx').on(t.status,t.createdAt,t.id),index('outreach_prospect_email_idx').on(t.email)]);
export const outreachCampaigns = sqliteTable('outreach_campaigns', {
  id:text('id').primaryKey(), name:text('name').notNull(), service:text('service').notNull(), audience:text('audience').notNull(),
  status:text('status').notNull().default('active'), steps:text('steps').notNull(), revision:integer('revision').notNull().default(1), createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
});
export const outreachDrafts = sqliteTable('outreach_drafts', {
  id:text('id').primaryKey(), campaignId:text('campaign_id').notNull().references(()=>outreachCampaigns.id,{onDelete:'cascade'}),
  prospectId:text('prospect_id').notNull().references(()=>outreachProspects.id,{onDelete:'cascade'}), step:integer('step').notNull(),
  recipient:text('recipient').notNull(),subject:text('subject').notNull(),body:text('body').notNull(),status:text('status').notNull().default('draft'),
  approvedAt:text('approved_at'),approvedRevision:integer('approved_revision'),senderRevision:integer('sender_revision'),sentAt:text('sent_at'),revision:integer('revision').notNull().default(1),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[uniqueIndex('outreach_draft_member_step_idx').on(t.campaignId,t.prospectId,t.step),uniqueIndex('outreach_draft_email_step_idx').on(t.campaignId,t.recipient,t.step),index('outreach_draft_status_idx').on(t.status,t.createdAt,t.id)]);
export const outreachSuppressions = sqliteTable('outreach_suppressions', {email:text('email').primaryKey(),reason:text('reason').notNull(),createdAt:text('created_at').notNull()});
export const outreachActivity = sqliteTable('outreach_activity', {
  id:text('id').primaryKey(),prospectId:text('prospect_id').references(()=>outreachProspects.id,{onDelete:'set null'}),campaignId:text('campaign_id').references(()=>outreachCampaigns.id,{onDelete:'set null'}),
  kind:text('kind').notNull(),body:text('body').notNull(),recipientEmail:text('recipient_email').notNull().default(''),createdAt:text('created_at').notNull(),
},t=>[index('outreach_activity_date_idx').on(t.createdAt,t.id),index('outreach_activity_recipient_idx').on(t.recipientEmail,t.kind)]);
export const outreachSettings = sqliteTable('outreach_settings', {
  id:text('id').primaryKey(),senderName:text('sender_name').notNull().default('Gavin Schurr'),senderEmail:text('sender_email').notNull().default(''),postalAddress:text('postal_address').notNull().default(''),
  dailyLimit:integer('daily_limit').notNull().default(20),windowStart:text('window_start').notNull().default('08:00'),windowEnd:text('window_end').notNull().default('17:00'),
  revision:integer('revision').notNull().default(1),updatedAt:text('updated_at').notNull(),
});

// A real inquiry and its first-response job commit together. No automatic sends.
export const responseJobs = sqliteTable('response_jobs', {
  id:text('id').primaryKey(),
  inquiryId:text('inquiry_id').references(()=>inquiries.id,{onDelete:'cascade'}),
  leadId:text('lead_id').references(()=>crmLeads.id,{onDelete:'cascade'}),
  sourceKey:text('source_key').notNull(), bodyHash:text('body_hash').notNull(),confirmedPhone:text('confirmed_phone').notNull().default(''),
  channel:text('channel').notNull(), status:text('status').notNull().default('needs_review'),
  draft:text('draft').notNull().default(''), consentScope:text('consent_scope').notNull(),
  revision:integer('revision').notNull().default(1),
  createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[uniqueIndex('response_jobs_source_idx').on(t.sourceKey),index('response_jobs_status_created_idx').on(t.status,t.createdAt,t.id)]);
// Call-level withdrawal survives capture/stop races and is never inferred from caller ID.
export const voiceCallControls=sqliteTable('voice_call_controls',{
  callSid:text('call_sid').primaryKey(),stoppedAt:text('stopped_at').notNull(),
});

// Singleton owner connection. API credentials use authenticated encryption;
// no secret is included in a page, client component, tool result or log.
export const retellConnection=sqliteTable('retell_connection',{
  id:text('id').primaryKey(),apiKeyCiphertext:text('api_key_ciphertext').notNull(),marker:text('marker').notNull(),
  llmId:text('llm_id').notNull().default(''),agentId:text('agent_id').notNull().default(''),voiceId:text('voice_id').notNull().default(''),
  phase:text('phase').notNull().default('connected'),mode:text('mode').notNull().default('test'),inboundNumber:text('inbound_number').notNull().default(''),
  lockToken:text('lock_token').notNull().default(''),lockUntil:integer('lock_until').notNull().default(0),
  lastVerifiedAt:text('last_verified_at').notNull().default(''),lastCapturedAt:text('last_captured_at').notNull().default(''),updatedAt:text('updated_at').notNull(),
});

// Only a provider call ID and release deadline, never caller details. Retrying a
// pre-answer webhook must not restart the ringing delay on another Worker.
export const retellInboundDelays=sqliteTable('retell_inbound_delays',{
  callId:text('call_id').primaryKey(),readyAt:integer('ready_at').notNull(),
},t=>[index('retell_inbound_delays_ready_idx').on(t.readyAt)]);

// Owner-only alert delivery is separate from caller follow-up. The immutable
// payload and provider idempotency key survive request retries and outages.
export const ownerAlertConnection=sqliteTable('owner_alert_connection',{
  id:text('id').primaryKey(),apiKeyCiphertext:text('api_key_ciphertext').notNull(),
  verifiedAt:text('verified_at').notNull(),updatedAt:text('updated_at').notNull(),
});
export const ownerAlerts=sqliteTable('owner_alerts',{
  id:text('id').primaryKey(),leadId:text('lead_id').notNull().references(()=>crmLeads.id,{onDelete:'cascade'}),
  payload:text('payload').notNull(),status:text('status').notNull().default('pending'),
  attempts:integer('attempts').notNull().default(0),firstAttemptAt:integer('first_attempt_at').notNull().default(0),
  nextAttemptAt:integer('next_attempt_at').notNull().default(0),lockUntil:integer('lock_until').notNull().default(0),lockToken:text('lock_token').notNull().default(''),
  emailId:text('email_id').notNull().default(''),lastError:text('last_error').notNull().default(''),
  acceptedAt:text('accepted_at').notNull().default(''),createdAt:text('created_at').notNull(),
},t=>[index('owner_alerts_created_idx').on(t.createdAt,t.id)]);

export const customerFirstEmails=sqliteTable('customer_first_emails',{
  id:text('id').primaryKey().references(()=>inquiries.id,{onDelete:'cascade'}),
  recipient:text('recipient').notNull(),payload:text('payload').notNull(),
  consentScope:text('consent_scope').notNull(),consentText:text('consent_text').notNull(),consentAt:text('consent_at').notNull(),
  status:text('status').notNull().default('pending'),attempts:integer('attempts').notNull().default(0),
  firstAttemptAt:integer('first_attempt_at').notNull().default(0),connectionFingerprint:text('connection_fingerprint').notNull().default(''),
  lockToken:text('lock_token').notNull().default(''),lockUntil:integer('lock_until').notNull().default(0),nextAttemptAt:integer('next_attempt_at').notNull().default(0),
  retryable:integer('retryable').notNull().default(1),emailId:text('email_id'),acceptedAt:text('accepted_at').notNull().default(''),
  lastError:text('last_error').notNull().default(''),createdAt:text('created_at').notNull(),
  eventRank:integer('event_rank').notNull().default(0),eventAt:text('event_at').notNull().default(''),
},t=>[index('customer_email_recipient_attempt_idx').on(t.recipient,t.firstAttemptAt),uniqueIndex('customer_email_provider_idx').on(t.emailId)]);

export const customerEmailEvents=sqliteTable('customer_email_events',{
  id:text('id').primaryKey(),emailId:text('email_id').notNull(),type:text('type').notNull(),eventAt:text('event_at').notNull(),
},t=>[index('customer_email_events_provider_idx').on(t.emailId)]);

// Owner workspace setup records, never a shared client runtime or credential store.
export const clientSetups=sqliteTable('client_setups',{
 id:text('id').primaryKey(),businessName:text('business_name').notNull(),offers:text('offers').notNull(),profile:text('profile').notNull(),
 createHash:text('create_hash').notNull(),revision:integer('revision').notNull().default(1),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[index('client_setups_updated_idx').on(t.updatedAt,t.id)]);
export const clientSetupPreviews=sqliteTable('client_setup_previews',{
 clientId:text('client_id').notNull().references(()=>clientSetups.id,{onDelete:'cascade'}),recipe:text('recipe').notNull(),scenario:text('scenario').notNull(),
 setupRevision:integer('setup_revision').notNull(),input:text('input').notNull(),output:text('output').notNull(),createdAt:text('created_at').notNull(),
},t=>[primaryKey({columns:[t.clientId,t.recipe,t.scenario]})]);


// This deployment's operational business configuration; never a tenant selector.
export const automationSettings=sqliteTable('automation_settings',{
 id:text('id').primaryKey(),profile:text('profile').notNull(),chatEnabled:integer('chat_enabled').notNull().default(1),googleEligibility:text('google_eligibility').notNull().default('unconfirmed'),searchConsoleProperty:text('search_console_property').notNull().default(''),revision:integer('revision').notNull().default(1),updatedAt:text('updated_at').notNull(),
});
export const automationRuns=sqliteTable('automation_runs',{
 id:text('id').primaryKey(),kind:text('kind').notNull(),eventKey:text('event_key').notNull(),bodyHash:text('body_hash').notNull(),profileRevision:integer('profile_revision').notNull(),input:text('input').notNull(),output:text('output').notNull(),status:text('status').notNull().default('draft'),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[uniqueIndex('automation_runs_event_idx').on(t.kind,t.eventKey),index('automation_runs_created_idx').on(t.createdAt,t.id)]);
export const reviewRequests=sqliteTable('review_requests',{
 id:text('id').primaryKey().references(()=>automationRuns.id),jobId:text('job_id').notNull(),recipient:text('recipient').notNull(),consentEvidence:text('consent_evidence').notNull(),payload:text('payload').notNull(),profileRevision:integer('profile_revision').notNull(),
 status:text('status').notNull().default('draft'),approvedAt:text('approved_at').notNull().default(''),attempts:integer('attempts').notNull().default(0),firstAttemptAt:integer('first_attempt_at').notNull().default(0),connectionFingerprint:text('connection_fingerprint').notNull().default(''),lockToken:text('lock_token').notNull().default(''),lockUntil:integer('lock_until').notNull().default(0),retryable:integer('retryable').notNull().default(1),emailId:text('email_id'),lastError:text('last_error').notNull().default(''),eventRank:integer('event_rank').notNull().default(0),eventAt:text('event_at').notNull().default(''),createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('review_requests_job_idx').on(t.jobId),uniqueIndex('review_requests_email_idx').on(t.emailId),index('review_requests_recipient_idx').on(t.recipient,t.firstAttemptAt)]);

// Native schedule; external calendar sync and customer notifications are separate.
export const bookingSettings=sqliteTable('booking_settings',{
 id:text('id').primaryKey(),config:text('config').notNull(),revision:integer('revision').notNull().default(1),updatedAt:text('updated_at').notNull(),
});
export const appointments=sqliteTable('appointments',{
 id:text('id').primaryKey(),requestKey:text('request_key').notNull(),bodyHash:text('body_hash').notNull(),responseId:text('response_id').references(()=>responseJobs.id,{onDelete:'cascade'}),
 kind:text('kind').notNull(),name:text('name').notNull(),startMs:integer('start_ms').notNull(),endMs:integer('end_ms').notNull(),busyStartMs:integer('busy_start_ms').notNull(),busyEndMs:integer('busy_end_ms').notNull(),timezone:text('timezone').notNull(),
 status:text('status').notNull().default('booked'),notes:text('notes').notNull().default(''),revision:integer('revision').notNull().default(1),scheduleRevision:integer('schedule_revision').notNull(),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[uniqueIndex('appointments_request_idx').on(t.requestKey),index('appointments_time_idx').on(t.status,t.busyStartMs,t.busyEndMs),index('appointments_response_idx').on(t.responseId,t.status)]);
export const responseFollowups=sqliteTable('response_followups',{
 id:text('id').primaryKey(),responseId:text('response_id').notNull().references(()=>responseJobs.id,{onDelete:'cascade'}),bodyHash:text('body_hash').notNull(),channel:text('channel').notNull(),recipient:text('recipient').notNull(),dueMs:integer('due_ms').notNull(),
 status:text('status').notNull().default('open'),note:text('note').notNull(),permissionEvidence:text('permission_evidence').notNull(),reason:text('reason').notNull().default(''),revision:integer('revision').notNull().default(1),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[index('response_followups_due_idx').on(t.status,t.dueMs,t.id),index('response_followups_response_idx').on(t.responseId,t.status)]);
export const responseOutcomes=sqliteTable('response_outcomes',{
 responseId:text('response_id').primaryKey().references(()=>responseJobs.id,{onDelete:'cascade'}),outcome:text('outcome').notNull(),note:text('note').notNull(),recordToken:text('record_token').notNull().default(''),recordedAt:text('recorded_at').notNull(),
});
export const clientLaunchChecks=sqliteTable('client_launch_checks',{
 clientId:text('client_id').notNull().references(()=>clientSetups.id,{onDelete:'cascade'}),checkId:text('check_id').notNull(),installationRevision:integer('installation_revision').notNull().default(0),setupRevision:integer('setup_revision').notNull(),outcome:text('outcome').notNull(),environment:text('environment').notNull(),evidence:text('evidence').notNull(),recordedBy:text('recorded_by').notNull(),recordedAt:text('recorded_at').notNull(),
},t=>[primaryKey({columns:[t.clientId,t.checkId]})]);

export const appointmentOperations=sqliteTable('appointment_operations',{
 id:text('id').primaryKey(),requestHash:text('request_hash').notNull(),attemptId:text('attempt_id').notNull(),appointmentId:text('appointment_id').notNull().references(()=>appointments.id,{onDelete:'cascade'}),action:text('action').notNull(),actorScope:text('actor_scope').notNull(),fromRevision:integer('from_revision').notNull(),toRevision:integer('to_revision').notNull(),createdAt:text('created_at').notNull(),
},t=>[index('appointment_operations_appointment_idx').on(t.appointmentId,t.createdAt)]);

// Append-only owner-reported audition evidence; no provider credentials, recordings,
// delivery permissions or automatic launch approval. A new test creates a new session.
export const receptionistAuditionSessions=sqliteTable('receptionist_audition_sessions',{
 id:text('id').primaryKey(),requestKey:text('request_key').notNull(),bodyHash:text('body_hash').notNull(),catalogueHash:text('catalogue_hash').notNull(),
 environment:text('environment').notNull(),testedAt:text('tested_at').notNull(),agentId:text('agent_id').notNull(),agentVersion:integer('agent_version'),
 configEvidence:text('config_evidence').notNull(),notes:text('notes').notNull(),naturalness:integer('naturalness'),interruptions:integer('interruptions'),pacing:integer('pacing'),
 recordedBy:text('recorded_by').notNull(),recordedAt:text('recorded_at').notNull(),
},t=>[uniqueIndex('receptionist_audition_request_idx').on(t.requestKey),index('receptionist_audition_recorded_idx').on(t.recordedAt,t.id),index('receptionist_audition_phone_idx').on(t.environment,t.testedAt,t.recordedAt,t.id)]);
export const receptionistAuditionResults=sqliteTable('receptionist_audition_results',{
 sessionId:text('session_id').notNull().references(()=>receptionistAuditionSessions.id),testId:text('test_id').notNull(),ordinal:integer('ordinal').notNull(),
 title:text('title').notNull(),scenario:text('scenario').notNull(),expected:text('expected').notNull(),outcome:text('outcome').notNull(),notes:text('notes').notNull(),
},t=>[primaryKey({columns:[t.sessionId,t.testId]})]);

// Monitoring evidence is separate from customer records and never grants live action permission.
export const monitoringSettings=sqliteTable('monitoring_settings',{
 id:text('id').primaryKey(),alertsEnabled:integer('alerts_enabled').notNull().default(0),revision:integer('revision').notNull().default(1),
 baselineHash:text('baseline_hash').notNull().default(''),baselineAgentId:text('baseline_agent_id').notNull().default(''),baselineAgentVersion:integer('baseline_agent_version'),baselineAt:text('baseline_at').notNull().default(''),
 lastRunnerAt:text('last_runner_at').notNull().default(''),runnerExpected:integer('runner_expected').notNull().default(0),
 leaseToken:text('lease_token').notNull().default(''),leaseUntil:integer('lease_until').notNull().default(0),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
});
export const monitoringChecks=sqliteTable('monitoring_checks',{
 id:text('id').primaryKey(),source:text('source').notNull(),startedAt:text('started_at').notNull(),finishedAt:text('finished_at').notNull(),checks:text('checks').notNull(),
 agentId:text('agent_id').notNull(),agentVersion:integer('agent_version'),configurationHash:text('configuration_hash'),
},t=>[index('monitoring_checks_finished_idx').on(t.finishedAt,t.id)]);

// Append to db/schema.ts; root should generate the real migration with Drizzle.
// Only scalar operational facts; no raw webhook, transcript, recording URL, contact or model text.
export const monitoringCalls=sqliteTable('monitoring_calls',{
 callId:text('call_id').primaryKey(),agentId:text('agent_id').notNull(),agentVersion:integer('agent_version'),
 lifecycleRank:integer('lifecycle_rank').notNull(),providerStatus:text('provider_status').notNull(),
 startedAtMs:integer('started_at_ms'),endedAtMs:integer('ended_at_ms'),disconnectionReason:text('disconnection_reason'),
 providerError:integer('provider_error').notNull().default(0),latencyP50Ms:integer('latency_p50_ms'),latencyP95Ms:integer('latency_p95_ms'),
 analysisReported:integer('analysis_reported').notNull().default(0),aiCallSuccessful:integer('ai_call_successful'),
 observationRevision:integer('observation_revision').notNull().default(1),reconciledRevision:integer('reconciled_revision').notNull().default(0),
 firstReceivedAt:text('first_received_at').notNull(),lastReceivedAt:text('last_received_at').notNull(),
},t=>[index('monitoring_calls_received_idx').on(t.firstReceivedAt,t.callId)]);

// Atomic receipt + snapshot batch means no partial admission. No foreign key:
// the receipt is inserted first, and tool observations can arrive before lifecycle.
export const monitoringCallEvents=sqliteTable('monitoring_call_events',{
 callId:text('call_id').notNull(),eventType:text('event_type').notNull(),
 receiptToken:text('receipt_token').notNull(),receivedAt:text('received_at').notNull(),
},t=>[primaryKey({columns:[t.callId,t.eventType]})]);

export const monitoringCallTools=sqliteTable('monitoring_call_tools',{
 callId:text('call_id').notNull(),toolName:text('tool_name').notNull(),
 attempts:integer('attempts').notNull(),successes:integer('successes').notNull(),technicalFailures:integer('technical_failures').notNull(),
 rejectedActions:integer('rejected_actions').notNull(),unclassifiedFailures:integer('unclassified_failures').notNull(),
 lastStatusCode:integer('last_status_code'),lastObservedAt:text('last_observed_at').notNull(),
},t=>[primaryKey({columns:[t.callId,t.toolName]}),index('monitoring_call_tools_observed_idx').on(t.lastObservedAt,t.callId)]);


// Monitoring incidents contain only fixed check/event codes and safe catalogue text.
// monitoringSettings is owned by the root integration and is not duplicated here.
export const monitoringIncidents=sqliteTable('monitoring_incidents',{
 id:text('id').primaryKey(),incidentKey:text('incident_key').notNull(),activeKey:text('active_key'),source:text('source').notNull(),sourceEvent:text('source_event'),code:text('code').notNull(),severity:text('severity').notNull().default('error'),summary:text('summary').notNull(),
 status:text('status').notNull().default('open'),openedCheckId:text('opened_check_id').notNull().default(''),lastCheckId:text('last_check_id').notNull().default(''),resolvedCheckId:text('resolved_check_id').notNull().default(''),acknowledgedAt:text('acknowledged_at').notNull().default(''),resolvedAt:text('resolved_at').notNull().default(''),resolutionKind:text('resolution_kind').notNull().default(''),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[uniqueIndex('monitoring_incidents_active_idx').on(t.activeKey),uniqueIndex('monitoring_incidents_event_idx').on(t.sourceEvent),index('monitoring_incidents_created_idx').on(t.createdAt,t.id),index('monitoring_incidents_status_idx').on(t.status,t.createdAt,t.id)]);
export const monitoringCheckReceipts=sqliteTable('monitoring_check_receipts',{
 id:text('id').primaryKey(),bodyHash:text('body_hash').notNull(),applied:integer('applied').notNull().default(0),result:text('result').notNull().default('{}'),createdAt:text('created_at').notNull(),
});
export const monitoringAlerts=sqliteTable('monitoring_alerts',{
 id:text('id').primaryKey(),incidentId:text('incident_id').notNull().references(()=>monitoringIncidents.id),kind:text('kind').notNull(),payload:text('payload').notNull(),payloadHash:text('payload_hash').notNull(),status:text('status').notNull().default('pending'),attempts:integer('attempts').notNull().default(0),firstAttemptAt:integer('first_attempt_at').notNull().default(0),nextAttemptAt:integer('next_attempt_at').notNull().default(0),connectionFingerprint:text('connection_fingerprint').notNull().default(''),lockToken:text('lock_token').notNull().default(''),lockUntil:integer('lock_until').notNull().default(0),retryable:integer('retryable').notNull().default(1),emailId:text('email_id'),acceptedAt:text('accepted_at').notNull().default(''),lastError:text('last_error').notNull().default(''),createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('monitoring_alerts_event_idx').on(t.incidentId,t.kind),index('monitoring_alerts_pending_idx').on(t.status,t.nextAttemptAt,t.createdAt,t.id),index('monitoring_alerts_created_idx').on(t.createdAt,t.id)]);

// Expression indexes and cross-origin alias triggers are defined by reviewed migration 0023.
// Non-secret installation targets are separate from the active Schurr runtime.
export const clientInstallations=sqliteTable('client_installations',{
 clientId:text('client_id').primaryKey().references(()=>clientSetups.id,{onDelete:'cascade'}),briefRevision:integer('brief_revision').notNull(),
 target:text('target').notNull(),revision:integer('revision').notNull().default(1),saveToken:text('save_token').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[uniqueIndex('client_install_origin').on(sql`nullif(json_extract(${t.target}, '$.origin'),'')`),uniqueIndex('client_install_nativeOrigin').on(sql`nullif(json_extract(${t.target}, '$.nativeOrigin'),'')`),uniqueIndex('client_install_deploymentRef').on(sql`nullif(json_extract(${t.target}, '$.deploymentRef'),'')`),uniqueIndex('client_install_databaseRef').on(sql`nullif(json_extract(${t.target}, '$.databaseRef'),'')`),uniqueIndex('client_install_voiceAgentId').on(sql`nullif(json_extract(${t.target}, '$.voiceAgentId'),'')`),uniqueIndex('client_install_inboundNumber').on(sql`nullif(json_extract(${t.target}, '$.inboundNumber'),'')`)]);

// Gmail is a separately authorized provider; CRM owner identity remains platform-owned.
export const gmailAppConfig=sqliteTable('gmail_app_config',{
 id:text('id').primaryKey(),clientId:text('client_id').notNull(),clientSecretCiphertext:text('client_secret_ciphertext').notNull(),redirectUri:text('redirect_uri').notNull(),expectedEmail:text('expected_email').notNull(),revision:integer('revision').notNull().default(1),updatedAt:text('updated_at').notNull(),
});
export const gmailConnections=sqliteTable('gmail_connections',{
 id:text('id').primaryKey(),email:text('email').notNull(),status:text('status').notNull(),tokenCiphertext:text('token_ciphertext').notNull(),scopes:text('scopes').notNull(),revision:integer('revision').notNull().default(1),connectedAt:text('connected_at').notNull(),updatedAt:text('updated_at').notNull(),lastSyncAt:text('last_sync_at').notNull().default(''),lastError:text('last_error').notNull().default(''),syncLockToken:text('sync_lock_token').notNull().default(''),syncLockUntil:integer('sync_lock_until').notNull().default(0),
});
export const gmailOauthStates=sqliteTable('gmail_oauth_states',{
 stateHash:text('state_hash').primaryKey(),ownerEmail:text('owner_email').notNull(),browserHash:text('browser_hash').notNull(),verifierCiphertext:text('verifier_ciphertext').notNull(),redirectUri:text('redirect_uri').notNull(),expiresAt:integer('expires_at').notNull(),consumedAt:integer('consumed_at').notNull().default(0),connectionRevision:integer('connection_revision').notNull(),configFingerprint:text('config_fingerprint').notNull(),createdAt:text('created_at').notNull(),
},t=>[index('gmail_oauth_expiry_idx').on(t.expiresAt)]);
export const gmailOutbox=sqliteTable('gmail_outbox',{
 id:text('id').primaryKey(),draftId:text('draft_id').notNull(),mailboxEmail:text('mailbox_email').notNull(),connectionRevision:integer('connection_revision').notNull(),draftRevision:integer('draft_revision').notNull(),senderRevision:integer('sender_revision').notNull(),prospectId:text('prospect_id').notNull(),campaignId:text('campaign_id').notNull(),recipient:text('recipient').notNull(),subject:text('subject').notNull(),body:text('body').notNull(),rawMime:text('raw_mime').notNull(),rawHash:text('raw_hash').notNull(),rfcMessageId:text('rfc_message_id').notNull(),status:text('status').notNull().default('prepared'),firstAttemptAt:integer('first_attempt_at').notNull().default(0),attempts:integer('attempts').notNull().default(0),gmailMessageId:text('gmail_message_id').notNull().default(''),threadId:text('thread_id').notNull().default(''),lastError:text('last_error').notNull().default(''),lockToken:text('lock_token').notNull().default(''),lockUntil:integer('lock_until').notNull().default(0),lastCheckedAt:text('last_checked_at').notNull().default(''),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[uniqueIndex('gmail_outbox_draft_idx').on(t.draftId),uniqueIndex('gmail_outbox_rfc_idx').on(t.rfcMessageId),index('gmail_outbox_sync_idx').on(t.mailboxEmail,t.status,t.lastCheckedAt,t.id),index('gmail_outbox_created_idx').on(t.createdAt,t.id)]);
export const gmailReplies=sqliteTable('gmail_replies',{
 id:text('id').primaryKey(),mailboxEmail:text('mailbox_email').notNull(),messageId:text('message_id').notNull(),threadId:text('thread_id').notNull(),outboxId:text('outbox_id').notNull(),senderEmail:text('sender_email').notNull(),subject:text('subject').notNull(),body:text('body').notNull(),receivedAt:text('received_at').notNull(),kind:text('kind').notNull(),importToken:text('import_token').notNull(),createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('gmail_replies_message_idx').on(t.mailboxEmail,t.messageId),index('gmail_replies_received_idx').on(t.receivedAt,t.id)]);

// Owner-confirmed frozen mail; a scheduler may dispatch only these envelopes.
export const gmailQueues=sqliteTable('gmail_queues',{
 id:text('id').primaryKey(),requestHash:text('request_hash').notNull(),mailbox:text('mailbox').notNull(),activeKey:text('active_key'),
 status:text('status').notNull().default('active'),intervalMinutes:integer('interval_minutes').notNull().default(45),batchSize:integer('batch_size').notNull().default(5),
 nextDue:integer('next_due').notNull(),lastBatchAt:integer('last_batch_at').notNull().default(0),currentBatch:integer('current_batch').notNull().default(-1),
 leaseToken:text('lease_token').notNull().default(''),leaseUntil:integer('lease_until').notNull().default(0),reason:text('reason').notNull().default(''),
 confirmedBy:text('confirmed_by').notNull(),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[uniqueIndex('gmail_queue_active_mailbox_idx').on(t.activeKey),index('gmail_queue_due_idx').on(t.status,t.nextDue)]);
export const gmailQueueItems=sqliteTable('gmail_queue_items',{
 id:text('id').primaryKey(),queueId:text('queue_id').notNull().references(()=>gmailQueues.id),outboxId:text('outbox_id').notNull(),draftId:text('draft_id').notNull(),
 ordinal:integer('ordinal').notNull(),batchNumber:integer('batch_number').notNull(),status:text('status').notNull().default('pending'),
 leaseToken:text('lease_token').notNull().default(''),reason:text('reason').notNull().default(''),updatedAt:text('updated_at').notNull(),
},t=>[uniqueIndex('gmail_queue_outbox_idx').on(t.outboxId).where(sql`${t.status} IN ('pending','dispatching','held')`),index('gmail_queue_items_batch_idx').on(t.queueId,t.batchNumber,t.status)]);

// Explicit new website callback permission, separate from legacy inquiry consent.
export const websiteCallbackSettings=sqliteTable('website_callback_settings',{
 id:text('id').primaryKey(),enabled:integer('enabled').notNull().default(0),llmId:text('llm_id').notNull().default(''),phase:text('phase').notNull().default('new'),marker:text('marker').notNull(),configHash:text('config_hash').notNull().default(''),revision:integer('revision').notNull().default(1),lockToken:text('lock_token').notNull().default(''),lockUntil:integer('lock_until').notNull().default(0),updatedAt:text('updated_at').notNull(),
});
export const websiteCallbacks=sqliteTable('website_callbacks',{
 id:text('id').primaryKey().references(()=>inquiries.id,{onDelete:'cascade'}),recipient:text('recipient').notNull(),consentScope:text('consent_scope').notNull(),consentText:text('consent_text').notNull(),consentAt:text('consent_at').notNull(),status:text('status').notNull().default('pending'),attemptedAt:integer('attempted_at').notNull().default(0),callId:text('call_id').notNull().default(''),fromNumber:text('from_number').notNull().default(''),agentId:text('agent_id').notNull().default(''),settingsRevision:integer('settings_revision').notNull().default(0),lastError:text('last_error').notNull().default(''),createdAt:text('created_at').notNull(),
},t=>[index('website_callbacks_recipient_idx').on(t.recipient,t.attemptedAt),index('website_callbacks_call_idx').on(t.callId)]);
