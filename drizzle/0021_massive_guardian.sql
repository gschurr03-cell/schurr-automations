ALTER TABLE `monitoring_calls` ADD `observation_revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `monitoring_calls` ADD `reconciled_revision` integer DEFAULT 0 NOT NULL;