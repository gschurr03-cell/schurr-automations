CREATE TABLE `website_callback_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`llm_id` text DEFAULT '' NOT NULL,
	`phase` text DEFAULT 'new' NOT NULL,
	`marker` text NOT NULL,
	`config_hash` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`lock_token` text DEFAULT '' NOT NULL,
	`lock_until` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `website_callbacks` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient` text NOT NULL,
	`consent_scope` text NOT NULL,
	`consent_text` text NOT NULL,
	`consent_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempted_at` integer DEFAULT 0 NOT NULL,
	`call_id` text DEFAULT '' NOT NULL,
	`from_number` text DEFAULT '' NOT NULL,
	`agent_id` text DEFAULT '' NOT NULL,
	`settings_revision` integer DEFAULT 0 NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `website_callbacks_recipient_idx` ON `website_callbacks` (`recipient`,`attempted_at`);--> statement-breakpoint
CREATE INDEX `website_callbacks_call_idx` ON `website_callbacks` (`call_id`);