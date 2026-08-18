CREATE TYPE "public"."bounceType" AS ENUM('hard', 'soft');--> statement-breakpoint
ALTER TYPE "public"."workflowRunStepStatus" ADD VALUE 'bounced';--> statement-breakpoint
ALTER TABLE "workflow_run_steps" ADD COLUMN "bounceType" "bounceType";--> statement-breakpoint
ALTER TABLE "workflow_run_steps" ADD COLUMN "providerMessageId" varchar(255);--> statement-breakpoint
CREATE INDEX "workflow_run_steps_providerMessageId_idx" ON "workflow_run_steps" USING btree ("providerMessageId");