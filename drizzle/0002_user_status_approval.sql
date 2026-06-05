ALTER TABLE `users` ADD `status` text DEFAULT 'approved' NOT NULL;
--> statement-breakpoint
UPDATE `users` SET `status` = 'approved' WHERE `role` = 'admin';
