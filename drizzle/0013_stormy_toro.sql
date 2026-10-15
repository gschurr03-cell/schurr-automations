CREATE TABLE `owner_alert_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`api_key_ciphertext` text NOT NULL,
	`verified_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `owner_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`first_attempt_at` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`lock_until` integer DEFAULT 0 NOT NULL,
	`lock_token` text DEFAULT '' NOT NULL,
	`email_id` text DEFAULT '' NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`accepted_at` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `owner_alerts_created_idx` ON `owner_alerts` (`created_at`,`id`);