-- Soft-delete column: list/export hide deleted leads; inquiry consent rows stay.
ALTER TABLE `crm_leads` ADD `deleted_at` text;--> statement-breakpoint
-- Normalize emails before uniqueness (create/update already lowercase new values).
UPDATE `crm_leads` SET `email` = lower(trim(`email`)) WHERE `email` != lower(trim(`email`));--> statement-breakpoint
-- Loud fail: two active leads share an email but point at different website inquiries.
-- CHECK(reason IS NULL) rejects any selected conflict row.
CREATE TABLE `__crm_email_merge_blocker` (
	`reason` text NOT NULL,
	CHECK(`reason` IS NULL)
);--> statement-breakpoint
INSERT INTO `__crm_email_merge_blocker` (`reason`)
SELECT 'Unmergeable duplicate CRM emails for ' || lower(`email`) || ': multiple distinct inquiry_id values (' || group_concat(DISTINCT `inquiry_id`) || '). Resolve manually before migrating.'
FROM `crm_leads`
WHERE `email` != '' AND `deleted_at` IS NULL AND `inquiry_id` IS NOT NULL
GROUP BY lower(`email`)
HAVING count(DISTINCT `inquiry_id`) > 1;--> statement-breakpoint
DROP TABLE `__crm_email_merge_blocker`;--> statement-breakpoint
-- Stash an inquiry the oldest lead should receive. Copying it while the duplicate
-- still holds inquiry_id violates crm_leads_inquiry_idx.
CREATE TABLE `__crm_email_inquiry_move` (
	`survivor_id` text PRIMARY KEY NOT NULL,
	`inquiry_id` text NOT NULL
);--> statement-breakpoint
INSERT INTO `__crm_email_inquiry_move` (`survivor_id`, `inquiry_id`)
SELECT survivor.`id`, (
  SELECT d.`inquiry_id` FROM `crm_leads` d
  WHERE d.`email` = survivor.`email` AND d.`email` != '' AND d.`deleted_at` IS NULL
    AND d.`inquiry_id` IS NOT NULL AND d.`id` != survivor.`id`
  ORDER BY d.`created_at` ASC, d.`id` ASC LIMIT 1
)
FROM `crm_leads` AS survivor
WHERE survivor.`email` != '' AND survivor.`deleted_at` IS NULL AND survivor.`inquiry_id` IS NULL
  AND survivor.`id` = (
    SELECT s.`id` FROM `crm_leads` s
    WHERE s.`email` = survivor.`email` AND s.`email` != '' AND s.`deleted_at` IS NULL
    ORDER BY s.`created_at` ASC, s.`id` ASC LIMIT 1
  )
  AND EXISTS (
    SELECT 1 FROM `crm_leads` d
    WHERE d.`email` = survivor.`email` AND d.`deleted_at` IS NULL AND d.`inquiry_id` IS NOT NULL AND d.`id` != survivor.`id`
  );--> statement-breakpoint
-- Clear inquiry_id on non-survivors so the unique inquiry index stays valid after survivor takes it.
UPDATE `crm_leads`
SET `inquiry_id` = NULL
WHERE `email` != '' AND `deleted_at` IS NULL AND `inquiry_id` IS NOT NULL
  AND `id` != (
    SELECT s.`id` FROM `crm_leads` s
    WHERE s.`email` = `crm_leads`.`email` AND s.`email` != '' AND s.`deleted_at` IS NULL
    ORDER BY s.`created_at` ASC, s.`id` ASC LIMIT 1
  );--> statement-breakpoint
UPDATE `crm_leads`
SET `inquiry_id` = (
  SELECT m.`inquiry_id` FROM `__crm_email_inquiry_move` m WHERE m.`survivor_id` = `crm_leads`.`id`
),
`updated_at` = COALESCE(`updated_at`, `created_at`)
WHERE `id` IN (SELECT `survivor_id` FROM `__crm_email_inquiry_move`);--> statement-breakpoint
DROP TABLE `__crm_email_inquiry_move`;--> statement-breakpoint
-- Re-point foreign keys from duplicate leads to the email survivor (never drop rows).
UPDATE `crm_events` SET `lead_id` = (
  SELECT s.`id` FROM `crm_leads` s
  WHERE s.`email` = (SELECT d.`email` FROM `crm_leads` d WHERE d.`id` = `crm_events`.`lead_id`)
    AND s.`email` != '' AND s.`deleted_at` IS NULL
  ORDER BY s.`created_at` ASC, s.`id` ASC LIMIT 1
)
WHERE `lead_id` IN (
  SELECT d.`id` FROM `crm_leads` d
  WHERE d.`email` != '' AND d.`deleted_at` IS NULL
    AND d.`id` != (
      SELECT s.`id` FROM `crm_leads` s
      WHERE s.`email` = d.`email` AND s.`deleted_at` IS NULL
      ORDER BY s.`created_at` ASC, s.`id` ASC LIMIT 1
    )
);--> statement-breakpoint
UPDATE `crm_tasks` SET `lead_id` = (
  SELECT s.`id` FROM `crm_leads` s
  WHERE s.`email` = (SELECT d.`email` FROM `crm_leads` d WHERE d.`id` = `crm_tasks`.`lead_id`)
    AND s.`email` != '' AND s.`deleted_at` IS NULL
  ORDER BY s.`created_at` ASC, s.`id` ASC LIMIT 1
)
WHERE `lead_id` IN (
  SELECT d.`id` FROM `crm_leads` d
  WHERE d.`email` != '' AND d.`deleted_at` IS NULL
    AND d.`id` != (
      SELECT s.`id` FROM `crm_leads` s
      WHERE s.`email` = d.`email` AND s.`deleted_at` IS NULL
      ORDER BY s.`created_at` ASC, s.`id` ASC LIMIT 1
    )
);--> statement-breakpoint
UPDATE `outreach_prospects` SET `lead_id` = (
  SELECT s.`id` FROM `crm_leads` s
  WHERE s.`email` = (SELECT d.`email` FROM `crm_leads` d WHERE d.`id` = `outreach_prospects`.`lead_id`)
    AND s.`email` != '' AND s.`deleted_at` IS NULL
  ORDER BY s.`created_at` ASC, s.`id` ASC LIMIT 1
)
WHERE `lead_id` IN (
  SELECT d.`id` FROM `crm_leads` d
  WHERE d.`email` != '' AND d.`deleted_at` IS NULL
    AND d.`id` != (
      SELECT s.`id` FROM `crm_leads` s
      WHERE s.`email` = d.`email` AND s.`deleted_at` IS NULL
      ORDER BY s.`created_at` ASC, s.`id` ASC LIMIT 1
    )
);--> statement-breakpoint
UPDATE `response_jobs` SET `lead_id` = (
  SELECT s.`id` FROM `crm_leads` s
  WHERE s.`email` = (SELECT d.`email` FROM `crm_leads` d WHERE d.`id` = `response_jobs`.`lead_id`)
    AND s.`email` != '' AND s.`deleted_at` IS NULL
  ORDER BY s.`created_at` ASC, s.`id` ASC LIMIT 1
)
WHERE `lead_id` IN (
  SELECT d.`id` FROM `crm_leads` d
  WHERE d.`email` != '' AND d.`deleted_at` IS NULL
    AND d.`id` != (
      SELECT s.`id` FROM `crm_leads` s
      WHERE s.`email` = d.`email` AND s.`deleted_at` IS NULL
      ORDER BY s.`created_at` ASC, s.`id` ASC LIMIT 1
    )
);--> statement-breakpoint
UPDATE `owner_alerts` SET `lead_id` = (
  SELECT s.`id` FROM `crm_leads` s
  WHERE s.`email` = (SELECT d.`email` FROM `crm_leads` d WHERE d.`id` = `owner_alerts`.`lead_id`)
    AND s.`email` != '' AND s.`deleted_at` IS NULL
  ORDER BY s.`created_at` ASC, s.`id` ASC LIMIT 1
)
WHERE `lead_id` IN (
  SELECT d.`id` FROM `crm_leads` d
  WHERE d.`email` != '' AND d.`deleted_at` IS NULL
    AND d.`id` != (
      SELECT s.`id` FROM `crm_leads` s
      WHERE s.`email` = d.`email` AND s.`deleted_at` IS NULL
      ORDER BY s.`created_at` ASC, s.`id` ASC LIMIT 1
    )
);--> statement-breakpoint
-- Soft-delete non-survivor duplicates. Rows and consent evidence are retained.
UPDATE `crm_leads`
SET `deleted_at` = strftime('%Y-%m-%dT%H:%M:%f','now') || 'Z',
    `updated_at` = strftime('%Y-%m-%dT%H:%M:%f','now') || 'Z',
    `revision` = `revision` + 1
WHERE `email` != '' AND `deleted_at` IS NULL
  AND `id` != (
    SELECT s.`id` FROM `crm_leads` s
    WHERE s.`email` = `crm_leads`.`email` AND s.`email` != '' AND s.`deleted_at` IS NULL
    ORDER BY s.`created_at` ASC, s.`id` ASC LIMIT 1
  );--> statement-breakpoint
-- Unique active emails. Empty emails may repeat. Soft-deleted rows are excluded.
-- If any active duplicate remains, this CREATE fails loudly (no silent drop).
CREATE UNIQUE INDEX `crm_leads_email_active_idx` ON `crm_leads` (`email`) WHERE `email` != '' AND `deleted_at` IS NULL;
