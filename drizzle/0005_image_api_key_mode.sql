ALTER TABLE `users` ADD `image_api_key_mode` text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `unsplash_key` text;--> statement-breakpoint
ALTER TABLE `users` ADD `pexels_key` text;--> statement-breakpoint
ALTER TABLE `users` ADD `google_ai_key` text;