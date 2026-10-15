CREATE TABLE `receptionist_audition_results` (
	`session_id` text NOT NULL,
	`test_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`title` text NOT NULL,
	`scenario` text NOT NULL,
	`expected` text NOT NULL,
	`outcome` text NOT NULL,
	`notes` text NOT NULL,
	PRIMARY KEY(`session_id`, `test_id`),
	FOREIGN KEY (`session_id`) REFERENCES `receptionist_audition_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `receptionist_audition_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`request_key` text NOT NULL,
	`body_hash` text NOT NULL,
	`catalogue_hash` text NOT NULL,
	`environment` text NOT NULL,
	`tested_at` text NOT NULL,
	`agent_id` text NOT NULL,
	`agent_version` integer,
	`config_evidence` text NOT NULL,
	`notes` text NOT NULL,
	`naturalness` integer,
	`interruptions` integer,
	`pacing` integer,
	`recorded_by` text NOT NULL,
	`recorded_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receptionist_audition_request_idx` ON `receptionist_audition_sessions` (`request_key`);--> statement-breakpoint
CREATE INDEX `receptionist_audition_recorded_idx` ON `receptionist_audition_sessions` (`recorded_at`,`id`);--> statement-breakpoint
CREATE INDEX `receptionist_audition_phone_idx` ON `receptionist_audition_sessions` (`environment`,`tested_at`,`recorded_at`,`id`);