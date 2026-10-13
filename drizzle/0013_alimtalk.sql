ALTER TABLE `users` ADD `phone` text;--> statement-breakpoint
ALTER TABLE `users` ADD `notify_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
CREATE TABLE `alimtalk_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`event` text NOT NULL,
	`to` text DEFAULT '' NOT NULL,
	`template_code` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`provider_message_id` text,
	`error` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
