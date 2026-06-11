ALTER TABLE `users` ADD `api_key_mode` text DEFAULT 'system' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD `openai_api_key` text;
--> statement-breakpoint
UPDATE `users` SET `api_key_mode` = 'system' WHERE `role` = 'admin';
