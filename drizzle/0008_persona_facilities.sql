ALTER TABLE `personas` ADD `facilities_json` text NOT NULL DEFAULT '[]';--> statement-breakpoint
ALTER TABLE `personas` ADD `absent_facilities_json` text NOT NULL DEFAULT '[]';