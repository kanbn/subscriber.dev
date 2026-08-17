CREATE TYPE "public"."workflowBroadcastStatus" AS ENUM('pending', 'queued', 'failed');--> statement-breakpoint
CREATE TABLE "subscriber_tags" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"subscriberId" bigserial NOT NULL,
	"environmentId" bigserial NOT NULL,
	"tag" varchar(100) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"createdBy" bigint,
	CONSTRAINT "subscriber_tags_subscriberId_tag" UNIQUE("subscriberId","tag")
);
--> statement-breakpoint
CREATE TABLE "workflow_broadcasts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" text NOT NULL,
	"workflowId" bigserial NOT NULL,
	"environmentId" bigserial NOT NULL,
	"audienceQuery" jsonb NOT NULL,
	"status" "workflowBroadcastStatus" DEFAULT 'pending' NOT NULL,
	"matchedCount" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"createdBy" bigint,
	CONSTRAINT "workflow_broadcasts_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "broadcastId" bigint;--> statement-breakpoint
ALTER TABLE "subscriber_tags" ADD CONSTRAINT "subscriber_tags_subscriberId_subscribers_id_fk" FOREIGN KEY ("subscriberId") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_tags" ADD CONSTRAINT "subscriber_tags_environmentId_environments_id_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_tags" ADD CONSTRAINT "subscriber_tags_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_broadcasts" ADD CONSTRAINT "workflow_broadcasts_workflowId_workflows_id_fk" FOREIGN KEY ("workflowId") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_broadcasts" ADD CONSTRAINT "workflow_broadcasts_environmentId_environments_id_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_broadcasts" ADD CONSTRAINT "workflow_broadcasts_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriber_tags_environmentId_tag_idx" ON "subscriber_tags" USING btree ("environmentId","tag");--> statement-breakpoint
CREATE INDEX "workflow_broadcasts_workflowId_idx" ON "workflow_broadcasts" USING btree ("workflowId");--> statement-breakpoint
CREATE INDEX "workflow_broadcasts_environmentId_idx" ON "workflow_broadcasts" USING btree ("environmentId");--> statement-breakpoint
CREATE INDEX "workflow_broadcasts_publicId_idx" ON "workflow_broadcasts" USING btree ("publicId");--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_broadcastId_workflow_broadcasts_id_fk" FOREIGN KEY ("broadcastId") REFERENCES "public"."workflow_broadcasts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_runs_broadcastId_idx" ON "workflow_runs" USING btree ("broadcastId");