CREATE TABLE "workflow_triggers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workflowId" bigint NOT NULL,
	"environmentId" bigint NOT NULL,
	"source" varchar(50) NOT NULL,
	"event" varchar(255) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_triggers_workflow_source_event" UNIQUE("workflowId","source","event")
);
--> statement-breakpoint
ALTER TABLE "workflow_triggers" ADD CONSTRAINT "workflow_triggers_workflowId_workflows_id_fk" FOREIGN KEY ("workflowId") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_triggers" ADD CONSTRAINT "workflow_triggers_environmentId_environments_id_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_triggers_environment_source_event_idx" ON "workflow_triggers" USING btree ("environmentId","source","event");