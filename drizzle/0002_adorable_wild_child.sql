CREATE TABLE `comfy_bridge_devices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerUserId` int NOT NULL,
	`label` varchar(120) NOT NULL,
	`credentialHash` varchar(128) NOT NULL,
	`status` enum('active','revoked') NOT NULL DEFAULT 'active',
	`lastSeenAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	CONSTRAINT `comfy_bridge_devices_id` PRIMARY KEY(`id`),
	CONSTRAINT `comfy_bridge_devices_credentialHash_unique` UNIQUE(`credentialHash`)
);
--> statement-breakpoint
CREATE TABLE `comfy_bridge_pairings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerUserId` int NOT NULL,
	`codeHash` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`consumedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `comfy_bridge_pairings_id` PRIMARY KEY(`id`),
	CONSTRAINT `comfy_bridge_pairings_codeHash_unique` UNIQUE(`codeHash`)
);
--> statement-breakpoint
CREATE TABLE `comfy_bridge_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`historyId` int NOT NULL,
	`userId` int NOT NULL,
	`photoId` int NOT NULL,
	`deviceId` int NOT NULL,
	`workflowId` varchar(100) NOT NULL,
	`status` enum('queued','leased','processing','completed','failed') NOT NULL DEFAULT 'queued',
	`leaseHash` varchar(128),
	`leaseExpiresAt` timestamp,
	`attemptCount` int NOT NULL DEFAULT 0,
	`progressKey` varchar(100),
	`progressLabel` varchar(255),
	`progressDetail` text,
	`promptId` varchar(128),
	`lastError` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`completedAt` timestamp,
	CONSTRAINT `comfy_bridge_tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `comfy_bridge_tasks_historyId_unique` UNIQUE(`historyId`)
);
