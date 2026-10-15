CREATE TABLE `crm_events` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `crm_events_lead_created_idx` ON `crm_events` (`lead_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `crm_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`inquiry_id` text,
	`name` text NOT NULL,
	`business` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`service` text DEFAULT 'general' NOT NULL,
	`preferred_contact` text DEFAULT 'email' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`stage` text DEFAULT 'new' NOT NULL,
	`monthly_cents` integer DEFAULT 0 NOT NULL,
	`setup_cents` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_leads_inquiry_idx` ON `crm_leads` (`inquiry_id`);--> statement-breakpoint
CREATE INDEX `crm_leads_created_idx` ON `crm_leads` (`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `crm_mutations` (
	`id` text PRIMARY KEY NOT NULL,
	`request_hash` text NOT NULL,
	`redirect` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `crm_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`business_name` text NOT NULL,
	`owner_name` text NOT NULL,
	`reply_email` text DEFAULT '' NOT NULL,
	`reply_phone` text NOT NULL,
	`timezone` text NOT NULL,
	`setup_complete` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `crm_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text,
	`title` text NOT NULL,
	`due_date` text NOT NULL,
	`completed_at` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `crm_tasks_due_idx` ON `crm_tasks` (`completed_at`,`due_date`,`id`);--> statement-breakpoint
CREATE INDEX `crm_tasks_lead_idx` ON `crm_tasks` (`lead_id`);