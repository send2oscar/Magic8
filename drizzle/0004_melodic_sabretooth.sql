CREATE TABLE `credit_packages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`credits` int NOT NULL,
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `credit_packages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `credit_policies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`standardTryOnCredits` int NOT NULL DEFAULT 1,
	`xxxTryOnCredits` int NOT NULL DEFAULT 10,
	`priceCentsPerCredit` int NOT NULL DEFAULT 10,
	`updatedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `credit_policies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `paypal_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`packageId` int,
	`orderId` varchar(127) NOT NULL,
	`captureId` varchar(127),
	`creditAmount` int NOT NULL,
	`expectedAmountCents` int NOT NULL,
	`status` enum('created','completed','failed','cancelled') NOT NULL DEFAULT 'created',
	`failureDetail` longtext,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`capturedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `paypal_payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `paypal_payments_orderId_unique` UNIQUE(`orderId`),
	CONSTRAINT `paypal_payments_captureId_unique` UNIQUE(`captureId`)
);
--> statement-breakpoint
CREATE INDEX `paypal_payments_user_created_idx` ON `paypal_payments` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `paypal_payments_status_created_idx` ON `paypal_payments` (`status`,`createdAt`);
--> statement-breakpoint
INSERT INTO `credit_policies` (`standardTryOnCredits`, `xxxTryOnCredits`, `priceCentsPerCredit`)
SELECT 1, 10, 10
WHERE NOT EXISTS (SELECT 1 FROM `credit_policies` LIMIT 1);
--> statement-breakpoint
INSERT INTO `credit_packages` (`credits`, `status`, `sortOrder`)
SELECT 100, 'active', 100
WHERE NOT EXISTS (SELECT 1 FROM `credit_packages` WHERE `credits` = 100 LIMIT 1);
--> statement-breakpoint
INSERT INTO `credit_packages` (`credits`, `status`, `sortOrder`)
SELECT 500, 'active', 500
WHERE NOT EXISTS (SELECT 1 FROM `credit_packages` WHERE `credits` = 500 LIMIT 1);
--> statement-breakpoint
INSERT INTO `credit_packages` (`credits`, `status`, `sortOrder`)
SELECT 1000, 'active', 1000
WHERE NOT EXISTS (SELECT 1 FROM `credit_packages` WHERE `credits` = 1000 LIMIT 1);
