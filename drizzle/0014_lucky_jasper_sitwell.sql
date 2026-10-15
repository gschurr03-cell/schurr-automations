CREATE TABLE `customer_email_events` (
	`id` text PRIMARY KEY NOT NULL,
	`email_id` text NOT NULL,
	`type` text NOT NULL,
	`event_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customer_email_events_provider_idx` ON `customer_email_events` (`email_id`);--> statement-breakpoint
CREATE TABLE `customer_first_emails` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient` text NOT NULL,
	`payload` text NOT NULL,
	`consent_scope` text NOT NULL,
	`consent_text` text NOT NULL,
	`consent_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`first_attempt_at` integer DEFAULT 0 NOT NULL,
	`connection_fingerprint` text DEFAULT '' NOT NULL,
	`lock_token` text DEFAULT '' NOT NULL,
	`lock_until` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`retryable` integer DEFAULT 1 NOT NULL,
	`email_id` text,
	`accepted_at` text DEFAULT '' NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`event_rank` integer DEFAULT 0 NOT NULL,
	`event_at` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `customer_email_recipient_attempt_idx` ON `customer_first_emails` (`recipient`,`first_attempt_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_email_provider_idx` ON `customer_first_emails` (`email_id`);--> statement-breakpoint
CREATE TABLE `inquiry_receipts` (
	`submission_key` text PRIMARY KEY NOT NULL,
	`receipt_id` text NOT NULL,
	`created_at` text NOT NULL
);
