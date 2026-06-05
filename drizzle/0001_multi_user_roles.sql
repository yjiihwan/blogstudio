ALTER TABLE `users` ADD `is_active` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
UPDATE `users` SET `role` = 'admin' WHERE `role` = 'owner';
--> statement-breakpoint
UPDATE `users` SET `role` = 'user' WHERE `role` IN ('editor', 'viewer');
