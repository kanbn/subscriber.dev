ALTER TYPE "public"."workflowBroadcastStatus" ADD VALUE 'paused';--> statement-breakpoint
ALTER TYPE "public"."workflowBroadcastStatus" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TABLE "workflow_broadcasts" ADD COLUMN "sendOverMs" integer;--> statement-breakpoint
ALTER TABLE "workflow_broadcasts" ADD COLUMN "pausedAt" timestamp;--> statement-breakpoint
ALTER TABLE "workflow_broadcasts" ADD COLUMN "skippedCount" integer DEFAULT 0 NOT NULL;