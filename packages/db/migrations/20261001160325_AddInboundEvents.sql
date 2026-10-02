CREATE TYPE "public"."inboundEventStatus" AS ENUM('received', 'processed', 'ignored', 'failed');--> statement-breakpoint
CREATE TABLE "inbound_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"environmentId" bigint NOT NULL,
	"source" varchar(50) NOT NULL,
	"externalEventId" varchar(255) NOT NULL,
	"type" varchar(255) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "inboundEventStatus" DEFAULT 'received' NOT NULL,
	"matchedEvents" jsonb,
	"outcome" text,
	"subscriberId" bigint,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"processedAt" timestamp,
	CONSTRAINT "inbound_events_environment_source_event" UNIQUE("environmentId","source","externalEventId")
);
--> statement-breakpoint
CREATE TABLE "subscriber_identities" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"environmentId" bigint NOT NULL,
	"subscriberId" bigint NOT NULL,
	"source" varchar(50) NOT NULL,
	"externalId" varchar(255) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscriber_identities_environment_source_external" UNIQUE("environmentId","source","externalId")
);
--> statement-breakpoint
ALTER TABLE "inbound_events" ADD CONSTRAINT "inbound_events_environmentId_environments_id_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_events" ADD CONSTRAINT "inbound_events_subscriberId_subscribers_id_fk" FOREIGN KEY ("subscriberId") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_identities" ADD CONSTRAINT "subscriber_identities_environmentId_environments_id_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_identities" ADD CONSTRAINT "subscriber_identities_subscriberId_subscribers_id_fk" FOREIGN KEY ("subscriberId") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inbound_events_environment_createdAt_idx" ON "inbound_events" USING btree ("environmentId","createdAt");--> statement-breakpoint
CREATE INDEX "subscriber_identities_subscriberId_idx" ON "subscriber_identities" USING btree ("subscriberId");