ALTER TABLE "workspaceBilling" ADD COLUMN "currentPeriodStart" timestamp;--> statement-breakpoint
ALTER TABLE "workspaceBilling" ADD COLUMN "overLimitSince" timestamp;