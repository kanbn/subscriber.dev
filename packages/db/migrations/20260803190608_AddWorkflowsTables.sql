CREATE TYPE "public"."workflowRunStatus" AS ENUM('active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."workflowRunStepStatus" AS ENUM('pending', 'sent', 'skipped', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."workflowStatus" AS ENUM('active', 'paused');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_run_steps" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" text NOT NULL,
	"runId" bigserial NOT NULL,
	"stepId" bigint,
	"stepOrder" integer NOT NULL,
	"type" varchar(50) NOT NULL,
	"configSnapshot" jsonb NOT NULL,
	"scheduledAt" timestamp NOT NULL,
	"sentAt" timestamp,
	"status" "workflowRunStepStatus" DEFAULT 'pending' NOT NULL,
	"bullJobId" varchar(255),
	"errorMessage" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_run_steps_publicId_unique" UNIQUE("publicId"),
	CONSTRAINT "workflow_run_steps_runId_stepOrder" UNIQUE("runId","stepOrder")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" text NOT NULL,
	"workflowId" bigserial NOT NULL,
	"environmentId" bigserial NOT NULL,
	"subscriberId" bigserial NOT NULL,
	"status" "workflowRunStatus" DEFAULT 'active' NOT NULL,
	"payload" jsonb,
	"triggeredAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp,
	"createdBy" bigint,
	CONSTRAINT "workflow_runs_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_steps" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" text NOT NULL,
	"workflowId" bigserial NOT NULL,
	"stepOrder" integer NOT NULL,
	"type" varchar(50) DEFAULT 'email' NOT NULL,
	"delayMs" bigint DEFAULT 0 NOT NULL,
	"config" jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_steps_publicId_unique" UNIQUE("publicId"),
	CONSTRAINT "workflow_steps_workflowId_stepOrder" UNIQUE("workflowId","stepOrder")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflows" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" text NOT NULL,
	"environmentId" bigserial NOT NULL,
	"key" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"status" "workflowStatus" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	"createdBy" bigint,
	"updatedBy" bigint,
	"deletedBy" bigint,
	CONSTRAINT "workflows_environment_publicId" UNIQUE("environmentId","publicId"),
	CONSTRAINT "workflows_environment_key" UNIQUE("environmentId","key")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_run_steps" ADD CONSTRAINT "workflow_run_steps_runId_workflow_runs_id_fk" FOREIGN KEY ("runId") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_run_steps" ADD CONSTRAINT "workflow_run_steps_stepId_workflow_steps_id_fk" FOREIGN KEY ("stepId") REFERENCES "public"."workflow_steps"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflowId_workflows_id_fk" FOREIGN KEY ("workflowId") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_environmentId_environments_id_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_subscriberId_subscribers_id_fk" FOREIGN KEY ("subscriberId") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_workflowId_workflows_id_fk" FOREIGN KEY ("workflowId") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflows" ADD CONSTRAINT "workflows_environmentId_environments_id_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflows" ADD CONSTRAINT "workflows_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflows" ADD CONSTRAINT "workflows_updatedBy_users_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflows" ADD CONSTRAINT "workflows_deletedBy_users_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_run_steps_runId_idx" ON "workflow_run_steps" USING btree ("runId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_run_steps_stepId_idx" ON "workflow_run_steps" USING btree ("stepId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_run_steps_bullJobId_idx" ON "workflow_run_steps" USING btree ("bullJobId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_run_steps_status_idx" ON "workflow_run_steps" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_runs_workflowId_idx" ON "workflow_runs" USING btree ("workflowId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_runs_environmentId_idx" ON "workflow_runs" USING btree ("environmentId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_runs_subscriberId_idx" ON "workflow_runs" USING btree ("subscriberId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_runs_status_idx" ON "workflow_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_steps_workflowId_idx" ON "workflow_steps" USING btree ("workflowId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflows_environmentId_idx" ON "workflows" USING btree ("environmentId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflows_key_idx" ON "workflows" USING btree ("key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflows_publicId_idx" ON "workflows" USING btree ("publicId");