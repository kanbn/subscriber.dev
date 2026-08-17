CREATE TYPE "public"."workflowType" AS ENUM('automation', 'broadcast');--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "type" "workflowType" DEFAULT 'automation' NOT NULL;