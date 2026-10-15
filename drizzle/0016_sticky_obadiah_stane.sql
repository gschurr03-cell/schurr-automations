CREATE TABLE `automation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`event_key` text NOT NULL,
	`body_hash` text NOT NULL,
	`profile_revision` integer NOT NULL,
	`input` text NOT NULL,
	`output` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `automation_runs_event_idx` ON `automation_runs` (`kind`,`event_key`);--> statement-breakpoint
CREATE INDEX `automation_runs_created_idx` ON `automation_runs` (`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `automation_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`profile` text NOT NULL,
	`chat_enabled` integer DEFAULT 1 NOT NULL,
	`google_eligibility` text DEFAULT 'unconfirmed' NOT NULL,
	`search_console_property` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `review_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`recipient` text NOT NULL,
	`consent_evidence` text NOT NULL,
	`payload` text NOT NULL,
	`profile_revision` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`approved_at` text DEFAULT '' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`first_attempt_at` integer DEFAULT 0 NOT NULL,
	`connection_fingerprint` text DEFAULT '' NOT NULL,
	`lock_token` text DEFAULT '' NOT NULL,
	`lock_until` integer DEFAULT 0 NOT NULL,
	`retryable` integer DEFAULT 1 NOT NULL,
	`email_id` text,
	`last_error` text DEFAULT '' NOT NULL,
	`event_rank` integer DEFAULT 0 NOT NULL,
	`event_at` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `automation_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_requests_job_idx` ON `review_requests` (`job_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_requests_email_idx` ON `review_requests` (`email_id`);--> statement-breakpoint
CREATE INDEX `review_requests_recipient_idx` ON `review_requests` (`recipient`,`first_attempt_at`);