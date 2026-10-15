CREATE TABLE `response_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`inquiry_id` text,
	`lead_id` text,
	`source_key` text NOT NULL,
	`body_hash` text NOT NULL,
	`channel` text NOT NULL,
	`status` text DEFAULT 'needs_review' NOT NULL,
	`draft` text DEFAULT '' NOT NULL,
	`consent_scope` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `response_jobs_source_idx` ON `response_jobs` (`source_key`);--> statement-breakpoint
CREATE INDEX `response_jobs_status_created_idx` ON `response_jobs` (`status`,`created_at`,`id`);