-- Test-only fixture. It is never shipped as an application migration.
CREATE TABLE monitoring_settings (
 id TEXT PRIMARY KEY NOT NULL,alerts_enabled INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 1,
 baseline_hash TEXT NOT NULL DEFAULT '',baseline_agent_id TEXT NOT NULL DEFAULT '',baseline_agent_version INTEGER,
 baseline_at TEXT NOT NULL DEFAULT '',last_runner_at TEXT NOT NULL DEFAULT '',runner_expected INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT NOT NULL DEFAULT '',lease_until INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE TABLE monitoring_checks (
 id TEXT PRIMARY KEY NOT NULL,source TEXT NOT NULL,started_at TEXT NOT NULL,finished_at TEXT NOT NULL,checks TEXT NOT NULL,
 agent_id TEXT NOT NULL,agent_version INTEGER,configuration_hash TEXT
);
CREATE INDEX monitoring_checks_finished_idx ON monitoring_checks(finished_at,id);
CREATE TABLE monitoring_calls (
 call_id TEXT PRIMARY KEY NOT NULL,agent_id TEXT NOT NULL,agent_version INTEGER,lifecycle_rank INTEGER NOT NULL,
 provider_status TEXT NOT NULL,started_at_ms INTEGER,ended_at_ms INTEGER,disconnection_reason TEXT,
 provider_error INTEGER NOT NULL DEFAULT 0,latency_p50_ms INTEGER,latency_p95_ms INTEGER,
 analysis_reported INTEGER NOT NULL DEFAULT 0,ai_call_successful INTEGER,first_received_at TEXT NOT NULL,last_received_at TEXT NOT NULL,
 observation_revision INTEGER NOT NULL DEFAULT 1,reconciled_revision INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE monitoring_call_events (
 call_id TEXT NOT NULL,event_type TEXT NOT NULL,receipt_token TEXT NOT NULL,received_at TEXT NOT NULL,PRIMARY KEY(call_id,event_type)
);
CREATE TABLE monitoring_call_tools (
 call_id TEXT NOT NULL,tool_name TEXT NOT NULL,attempts INTEGER NOT NULL,successes INTEGER NOT NULL,technical_failures INTEGER NOT NULL,
 rejected_actions INTEGER NOT NULL,unclassified_failures INTEGER NOT NULL,last_status_code INTEGER,last_observed_at TEXT NOT NULL,
 PRIMARY KEY(call_id,tool_name)
);
CREATE TABLE monitoring_incidents (
 id TEXT PRIMARY KEY NOT NULL,incident_key TEXT NOT NULL,active_key TEXT,source TEXT NOT NULL,source_event TEXT,code TEXT NOT NULL,
 severity TEXT NOT NULL DEFAULT 'error',summary TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',opened_check_id TEXT NOT NULL DEFAULT '',
 last_check_id TEXT NOT NULL DEFAULT '',resolved_check_id TEXT NOT NULL DEFAULT '',acknowledged_at TEXT NOT NULL DEFAULT '',
 resolved_at TEXT NOT NULL DEFAULT '',resolution_kind TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX monitoring_incidents_active_idx ON monitoring_incidents(active_key);
CREATE UNIQUE INDEX monitoring_incidents_event_idx ON monitoring_incidents(source_event);
CREATE TABLE monitoring_check_receipts (
 id TEXT PRIMARY KEY NOT NULL,body_hash TEXT NOT NULL,applied INTEGER NOT NULL DEFAULT 0,result TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL
);
CREATE TABLE monitoring_alerts (
 id TEXT PRIMARY KEY NOT NULL,incident_id TEXT NOT NULL REFERENCES monitoring_incidents(id),kind TEXT NOT NULL,payload TEXT NOT NULL,
 payload_hash TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,first_attempt_at INTEGER NOT NULL DEFAULT 0,
 next_attempt_at INTEGER NOT NULL DEFAULT 0,connection_fingerprint TEXT NOT NULL DEFAULT '',lock_token TEXT NOT NULL DEFAULT '',
 lock_until INTEGER NOT NULL DEFAULT 0,retryable INTEGER NOT NULL DEFAULT 1,email_id TEXT,accepted_at TEXT NOT NULL DEFAULT '',
 last_error TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX monitoring_alerts_event_idx ON monitoring_alerts(incident_id,kind);
