CREATE TABLE `monitoring_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`payload_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`first_attempt_at` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`connection_fingerprint` text DEFAULT '' NOT NULL,
	`lock_token` text DEFAULT '' NOT NULL,
	`lock_until` integer DEFAULT 0 NOT NULL,
	`retryable` integer DEFAULT 1 NOT NULL,
	`email_id` text,
	`accepted_at` text DEFAULT '' NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `monitoring_incidents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monitoring_alerts_event_idx` ON `monitoring_alerts` (`incident_id`,`kind`);--> statement-breakpoint
CREATE INDEX `monitoring_alerts_pending_idx` ON `monitoring_alerts` (`status`,`next_attempt_at`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `monitoring_alerts_created_idx` ON `monitoring_alerts` (`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `monitoring_call_events` (
	`call_id` text NOT NULL,
	`event_type` text NOT NULL,
	`receipt_token` text NOT NULL,
	`received_at` text NOT NULL,
	PRIMARY KEY(`call_id`, `event_type`)
);
--> statement-breakpoint
CREATE TABLE `monitoring_call_tools` (
	`call_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`attempts` integer NOT NULL,
	`successes` integer NOT NULL,
	`technical_failures` integer NOT NULL,
	`rejected_actions` integer NOT NULL,
	`unclassified_failures` integer NOT NULL,
	`last_status_code` integer,
	`last_observed_at` text NOT NULL,
	PRIMARY KEY(`call_id`, `tool_name`)
);
--> statement-breakpoint
CREATE INDEX `monitoring_call_tools_observed_idx` ON `monitoring_call_tools` (`last_observed_at`,`call_id`);--> statement-breakpoint
CREATE TABLE `monitoring_calls` (
	`call_id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`agent_version` integer,
	`lifecycle_rank` integer NOT NULL,
	`provider_status` text NOT NULL,
	`started_at_ms` integer,
	`ended_at_ms` integer,
	`disconnection_reason` text,
	`provider_error` integer DEFAULT 0 NOT NULL,
	`latency_p50_ms` integer,
	`latency_p95_ms` integer,
	`analysis_reported` integer DEFAULT 0 NOT NULL,
	`ai_call_successful` integer,
	`first_received_at` text NOT NULL,
	`last_received_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `monitoring_calls_received_idx` ON `monitoring_calls` (`first_received_at`,`call_id`);--> statement-breakpoint
CREATE TABLE `monitoring_check_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`body_hash` text NOT NULL,
	`applied` integer DEFAULT 0 NOT NULL,
	`result` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `monitoring_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text NOT NULL,
	`checks` text NOT NULL,
	`agent_id` text NOT NULL,
	`agent_version` integer,
	`configuration_hash` text
);
--> statement-breakpoint
CREATE INDEX `monitoring_checks_finished_idx` ON `monitoring_checks` (`finished_at`,`id`);--> statement-breakpoint
CREATE TABLE `monitoring_incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_key` text NOT NULL,
	`active_key` text,
	`source` text NOT NULL,
	`source_event` text,
	`code` text NOT NULL,
	`severity` text DEFAULT 'error' NOT NULL,
	`summary` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`opened_check_id` text DEFAULT '' NOT NULL,
	`last_check_id` text DEFAULT '' NOT NULL,
	`resolved_check_id` text DEFAULT '' NOT NULL,
	`acknowledged_at` text DEFAULT '' NOT NULL,
	`resolved_at` text DEFAULT '' NOT NULL,
	`resolution_kind` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monitoring_incidents_active_idx` ON `monitoring_incidents` (`active_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `monitoring_incidents_event_idx` ON `monitoring_incidents` (`source_event`);--> statement-breakpoint
CREATE INDEX `monitoring_incidents_created_idx` ON `monitoring_incidents` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `monitoring_incidents_status_idx` ON `monitoring_incidents` (`status`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `monitoring_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`alerts_enabled` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`baseline_hash` text DEFAULT '' NOT NULL,
	`baseline_agent_id` text DEFAULT '' NOT NULL,
	`baseline_agent_version` integer,
	`baseline_at` text DEFAULT '' NOT NULL,
	`last_runner_at` text DEFAULT '' NOT NULL,
	`runner_expected` integer DEFAULT 0 NOT NULL,
	`lease_token` text DEFAULT '' NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
