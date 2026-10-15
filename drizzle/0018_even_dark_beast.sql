CREATE TABLE `appointment_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`request_hash` text NOT NULL,
	`attempt_id` text NOT NULL,
	`appointment_id` text NOT NULL,
	`action` text NOT NULL,
	`actor_scope` text NOT NULL,
	`from_revision` integer NOT NULL,
	`to_revision` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `appointment_operations_appointment_idx` ON `appointment_operations` (`appointment_id`,`created_at`);