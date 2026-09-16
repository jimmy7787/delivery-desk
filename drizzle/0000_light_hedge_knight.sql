CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_projects_user_created` ON `projects` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`assignee` text DEFAULT '' NOT NULL,
	`due_date` text,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "task_status" CHECK("tasks"."status" IN ('OPEN','IN_PROGRESS','BLOCKED','DONE'))
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_project_created` ON `tasks` (`project_id`,`created_at`);