CREATE TABLE `appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`request_key` text NOT NULL,
	`body_hash` text NOT NULL,
	`response_id` text,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`start_ms` integer NOT NULL,
	`end_ms` integer NOT NULL,
	`busy_start_ms` integer NOT NULL,
	`busy_end_ms` integer NOT NULL,
	`timezone` text NOT NULL,
	`status` text DEFAULT 'booked' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`schedule_revision` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`response_id`) REFERENCES `response_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `appointments_request_idx` ON `appointments` (`request_key`);--> statement-breakpoint
CREATE INDEX `appointments_time_idx` ON `appointments` (`status`,`busy_start_ms`,`busy_end_ms`);--> statement-breakpoint
CREATE INDEX `appointments_response_idx` ON `appointments` (`response_id`,`status`);--> statement-breakpoint
CREATE TABLE `booking_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`config` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `client_launch_checks` (
	`client_id` text NOT NULL,
	`check_id` text NOT NULL,
	`setup_revision` integer NOT NULL,
	`outcome` text NOT NULL,
	`environment` text NOT NULL,
	`evidence` text NOT NULL,
	`recorded_by` text NOT NULL,
	`recorded_at` text NOT NULL,
	PRIMARY KEY(`client_id`, `check_id`),
	FOREIGN KEY (`client_id`) REFERENCES `client_setups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `response_followups` (
	`id` text PRIMARY KEY NOT NULL,
	`response_id` text NOT NULL,
	`body_hash` text NOT NULL,
	`channel` text NOT NULL,
	`recipient` text NOT NULL,
	`due_ms` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`note` text NOT NULL,
	`permission_evidence` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`response_id`) REFERENCES `response_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `response_followups_due_idx` ON `response_followups` (`status`,`due_ms`,`id`);--> statement-breakpoint
CREATE INDEX `response_followups_response_idx` ON `response_followups` (`response_id`,`status`);--> statement-breakpoint
CREATE TABLE `response_outcomes` (
	`response_id` text PRIMARY KEY NOT NULL,
	`outcome` text NOT NULL,
	`note` text NOT NULL,
	`record_token` text DEFAULT '' NOT NULL,
	`recorded_at` text NOT NULL,
	FOREIGN KEY (`response_id`) REFERENCES `response_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `response_jobs` ADD `confirmed_phone` text DEFAULT '' NOT NULL;