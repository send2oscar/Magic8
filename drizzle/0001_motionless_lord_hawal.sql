CREATE TABLE `try_on_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`photoId` int NOT NULL,
	`shirtStyle` varchar(100) NOT NULL,
	`resultImageUrl` text,
	`resultImageKey` text,
	`creditsDeducted` int NOT NULL DEFAULT 1,
	`status` enum('pending','success','failed') NOT NULL DEFAULT 'pending',
	`bubbleApiResponse` longtext,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `try_on_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_photos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`photoUrl` text NOT NULL,
	`photoKey` text NOT NULL,
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_photos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `credits` int DEFAULT 5 NOT NULL;