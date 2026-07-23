ALTER TABLE `comfy_bridge_tasks` MODIFY COLUMN `progressDetail` longtext;--> statement-breakpoint
ALTER TABLE `comfy_bridge_tasks` MODIFY COLUMN `lastError` longtext;--> statement-breakpoint
ALTER TABLE `comfy_bridge_tasks` ADD `positivePrompt` longtext;--> statement-breakpoint
ALTER TABLE `comfy_bridge_tasks` ADD `estimatedSecondsRemaining` int;