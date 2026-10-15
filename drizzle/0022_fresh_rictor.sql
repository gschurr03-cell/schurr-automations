CREATE TABLE `client_installations` (
	`client_id` text PRIMARY KEY NOT NULL,
	`brief_revision` integer NOT NULL,
	`target` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`save_token` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `client_setups`(`id`) ON UPDATE no action ON DELETE cascade
);
