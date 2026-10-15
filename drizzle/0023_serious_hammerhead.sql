ALTER TABLE `client_launch_checks` ADD `installation_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `client_install_origin` ON `client_installations` (nullif(json_extract(target, '$.origin'),''));
--> statement-breakpoint
CREATE UNIQUE INDEX `client_install_nativeOrigin` ON `client_installations` (nullif(json_extract(target, '$.nativeOrigin'),''));
--> statement-breakpoint
CREATE UNIQUE INDEX `client_install_deploymentRef` ON `client_installations` (nullif(json_extract(target, '$.deploymentRef'),''));
--> statement-breakpoint
CREATE UNIQUE INDEX `client_install_databaseRef` ON `client_installations` (nullif(json_extract(target, '$.databaseRef'),''));
--> statement-breakpoint
CREATE UNIQUE INDEX `client_install_voiceAgentId` ON `client_installations` (nullif(json_extract(target, '$.voiceAgentId'),''));
--> statement-breakpoint
CREATE UNIQUE INDEX `client_install_inboundNumber` ON `client_installations` (nullif(json_extract(target, '$.inboundNumber'),''));
--> statement-breakpoint
CREATE TRIGGER client_install_origin_insert BEFORE INSERT ON client_installations WHEN EXISTS (SELECT 1 FROM client_installations other WHERE other.client_id != NEW.client_id AND (nullif(json_extract(NEW.target, '$.origin'),'') IN (json_extract(other.target,'$.origin'),json_extract(other.target,'$.nativeOrigin')) OR nullif(json_extract(NEW.target, '$.nativeOrigin'),'') IN (json_extract(other.target,'$.origin'),json_extract(other.target,'$.nativeOrigin')))) BEGIN SELECT RAISE(ABORT, 'client_install_origin collision'); END;
--> statement-breakpoint
CREATE TRIGGER client_install_origin_update BEFORE UPDATE OF target ON client_installations WHEN EXISTS (SELECT 1 FROM client_installations other WHERE other.client_id != NEW.client_id AND (nullif(json_extract(NEW.target, '$.origin'),'') IN (json_extract(other.target,'$.origin'),json_extract(other.target,'$.nativeOrigin')) OR nullif(json_extract(NEW.target, '$.nativeOrigin'),'') IN (json_extract(other.target,'$.origin'),json_extract(other.target,'$.nativeOrigin')))) BEGIN SELECT RAISE(ABORT, 'client_install_origin collision'); END;
