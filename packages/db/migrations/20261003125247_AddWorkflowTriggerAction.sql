CREATE TYPE "public"."workflowTriggerAction" AS ENUM('start', 'exit');--> statement-breakpoint
ALTER TABLE "workflow_triggers" DROP CONSTRAINT "workflow_triggers_workflow_source_event";--> statement-breakpoint
ALTER TABLE "workflow_triggers" ADD COLUMN "action" "workflowTriggerAction" DEFAULT 'start' NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_triggers" ADD CONSTRAINT "workflow_triggers_workflow_action_source_event" UNIQUE("workflowId","action","source","event");