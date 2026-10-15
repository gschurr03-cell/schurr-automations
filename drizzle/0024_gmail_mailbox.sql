CREATE TABLE `gmail_app_config` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`client_secret_ciphertext` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`expected_email` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `gmail_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`status` text NOT NULL,
	`token_ciphertext` text NOT NULL,
	`scopes` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`connected_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_sync_at` text DEFAULT '' NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`sync_lock_token` text DEFAULT '' NOT NULL,
	`sync_lock_until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `gmail_oauth_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`browser_hash` text NOT NULL,
	`verifier_ciphertext` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer DEFAULT 0 NOT NULL,
	`connection_revision` integer NOT NULL,
	`config_fingerprint` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `gmail_oauth_expiry_idx` ON `gmail_oauth_states` (`expires_at`);--> statement-breakpoint
CREATE TABLE `gmail_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_id` text NOT NULL,
	`mailbox_email` text NOT NULL,
	`connection_revision` integer NOT NULL,
	`draft_revision` integer NOT NULL,
	`sender_revision` integer NOT NULL,
	`prospect_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`recipient` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`raw_mime` text NOT NULL,
	`raw_hash` text NOT NULL,
	`rfc_message_id` text NOT NULL,
	`status` text DEFAULT 'prepared' NOT NULL,
	`first_attempt_at` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`gmail_message_id` text DEFAULT '' NOT NULL,
	`thread_id` text DEFAULT '' NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`lock_token` text DEFAULT '' NOT NULL,
	`lock_until` integer DEFAULT 0 NOT NULL,
	`last_checked_at` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gmail_outbox_draft_idx` ON `gmail_outbox` (`draft_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `gmail_outbox_rfc_idx` ON `gmail_outbox` (`rfc_message_id`);--> statement-breakpoint
CREATE INDEX `gmail_outbox_sync_idx` ON `gmail_outbox` (`mailbox_email`,`status`,`last_checked_at`,`id`);--> statement-breakpoint
CREATE INDEX `gmail_outbox_created_idx` ON `gmail_outbox` (`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `gmail_replies` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_email` text NOT NULL,
	`message_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`outbox_id` text NOT NULL,
	`sender_email` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`received_at` text NOT NULL,
	`kind` text NOT NULL,
	`import_token` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gmail_replies_message_idx` ON `gmail_replies` (`mailbox_email`,`message_id`);--> statement-breakpoint
CREATE INDEX `gmail_replies_received_idx` ON `gmail_replies` (`received_at`,`id`);