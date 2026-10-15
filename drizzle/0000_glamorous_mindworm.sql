CREATE TABLE `daily_metrics` (
	`day` text NOT NULL,
	`event` text NOT NULL,
	`route` text NOT NULL,
	`service` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `event`, `route`, `service`)
);
--> statement-breakpoint
CREATE TABLE `inquiries` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_key` text NOT NULL,
	`body_hash` text NOT NULL,
	`name` text NOT NULL,
	`business` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`service` text NOT NULL,
	`message` text NOT NULL,
	`preferred_contact` text NOT NULL,
	`consent_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inquiries_submission_key_unique` ON `inquiries` (`submission_key`);--> statement-breakpoint
CREATE INDEX `inquiries_created_at_id_idx` ON `inquiries` (`created_at`,`id`);