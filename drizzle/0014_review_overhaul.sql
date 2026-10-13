ALTER TABLE `drafts` ADD `review_verdict` text;--> statement-breakpoint
ALTER TABLE `drafts` ADD `review_reason` text;--> statement-breakpoint
ALTER TABLE `drafts` ADD `review_flags_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `drafts` ADD `review_model` text;--> statement-breakpoint
ALTER TABLE `drafts` ADD `review_meta_json` text;--> statement-breakpoint
CREATE TABLE `improvement_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_id` text,
	`blog_id` text,
	`persona_id` text,
	`target` text NOT NULL,
	`field` text NOT NULL,
	`problem` text NOT NULL,
	`proposed_change_json` text DEFAULT '{}' NOT NULL,
	`confidence` text DEFAULT 'medium' NOT NULL,
	`systemic` integer DEFAULT false NOT NULL,
	`occurrence_count` integer DEFAULT 1 NOT NULL,
	`evidence_draft_ids_json` text DEFAULT '[]' NOT NULL,
	`target_user_ids_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`applied_after` text,
	`reject_reason` text,
	`decided_by` text,
	`decided_at` text,
	`applied_at` text,
	`rollback_json` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`draft_id`) REFERENCES `drafts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`blog_id`) REFERENCES `blogs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
