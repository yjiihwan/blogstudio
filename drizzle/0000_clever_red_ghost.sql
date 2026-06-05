CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_id` text NOT NULL,
	`reviewer_user_id` text,
	`revision` integer NOT NULL,
	`decision` text NOT NULL,
	`feedback` text,
	`feedback_tags_json` text DEFAULT '[]' NOT NULL,
	`edited_body_md` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`draft_id`) REFERENCES `drafts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `blogs` (
	`id` text PRIMARY KEY NOT NULL,
	`naver_blog_id` text NOT NULL,
	`display_name` text NOT NULL,
	`blog_title` text,
	`blog_url` text,
	`niche` text,
	`language` text DEFAULT 'ko' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `draft_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_id` text NOT NULL,
	`revision` integer NOT NULL,
	`title` text NOT NULL,
	`body_md` text NOT NULL,
	`image_plan_json` text DEFAULT '[]' NOT NULL,
	`reason_for_change` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`draft_id`) REFERENCES `drafts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`blog_id` text NOT NULL,
	`topic_id` text,
	`schedule_id` text,
	`title` text NOT NULL,
	`summary` text,
	`body_md` text DEFAULT '' NOT NULL,
	`image_plan_json` text DEFAULT '[]' NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`revision_round` integer DEFAULT 0 NOT NULL,
	`seo_score` integer,
	`seo_issues_json` text DEFAULT '[]' NOT NULL,
	`human_score` integer,
	`char_count` integer DEFAULT 0 NOT NULL,
	`image_count` integer DEFAULT 0 NOT NULL,
	`llm_model` text,
	`llm_input_tokens` integer,
	`llm_output_tokens` integer,
	`llm_cost_cents` integer,
	`scheduled_publish_at` text,
	`published_at` text,
	`published_url` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`blog_id`) REFERENCES `blogs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`topic_id`) REFERENCES `topic_candidates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `image_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_id` text NOT NULL,
	`slot` integer NOT NULL,
	`description` text NOT NULL,
	`composition` text,
	`example` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`uploaded_image_id` text,
	`uploaded_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`draft_id`) REFERENCES `drafts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `images` (
	`id` text PRIMARY KEY NOT NULL,
	`blog_id` text,
	`draft_id` text,
	`source` text NOT NULL,
	`source_meta_json` text,
	`file_path` text NOT NULL,
	`mime_type` text NOT NULL,
	`width` integer,
	`height` integer,
	`file_size` integer,
	`alt_text` text,
	`caption` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`blog_id`) REFERENCES `blogs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`draft_id`) REFERENCES `drafts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`link_url` text,
	`channel` text DEFAULT 'inapp' NOT NULL,
	`sent_at` text,
	`read_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `personas` (
	`id` text PRIMARY KEY NOT NULL,
	`blog_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`purpose` text,
	`audience` text,
	`brand_voice` text,
	`point_of_view` text DEFAULT 'first_person' NOT NULL,
	`formality` text DEFAULT 'neutral' NOT NULL,
	`core_topics_json` text DEFAULT '[]' NOT NULL,
	`focus_keywords_json` text DEFAULT '[]' NOT NULL,
	`forbidden_words_json` text DEFAULT '[]' NOT NULL,
	`ctas_json` text DEFAULT '[]' NOT NULL,
	`preferred_length_min` integer DEFAULT 1500 NOT NULL,
	`preferred_length_max` integer DEFAULT 2800 NOT NULL,
	`images_per_post_min` integer DEFAULT 3 NOT NULL,
	`images_per_post_max` integer DEFAULT 8 NOT NULL,
	`sample_snippets_json` text DEFAULT '[]' NOT NULL,
	`quality_rules_json` text DEFAULT '[]' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`blog_id`) REFERENCES `blogs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `publishes` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_id` text NOT NULL,
	`published_by_user_id` text,
	`method` text DEFAULT 'manual_paste' NOT NULL,
	`published_at` text,
	`published_url` text,
	`copy_payload_md` text,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`draft_id`) REFERENCES `drafts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`published_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ranking_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_id` text,
	`blog_id` text NOT NULL,
	`keyword` text NOT NULL,
	`position` integer,
	`result_block` text,
	`captured_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`draft_id`) REFERENCES `drafts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`blog_id`) REFERENCES `blogs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`blog_id` text NOT NULL,
	`cron` text DEFAULT '0 6 * * 1' NOT NULL,
	`jitter_min` integer DEFAULT 45 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_run_at` text,
	`next_run_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`blog_id`) REFERENCES `blogs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `topic_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`blog_id` text NOT NULL,
	`title` text NOT NULL,
	`angle` text,
	`primary_keyword` text NOT NULL,
	`secondary_keywords_json` text DEFAULT '[]' NOT NULL,
	`search_volume_monthly` integer,
	`competition_score` integer,
	`intent_type` text,
	`source` text,
	`rationale` text,
	`score` integer,
	`status` text DEFAULT 'proposed' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`blog_id`) REFERENCES `blogs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'owner' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);