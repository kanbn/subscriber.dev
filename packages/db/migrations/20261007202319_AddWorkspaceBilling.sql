CREATE TABLE "workspaceBilling" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspaceId" bigint NOT NULL,
	"stripeCustomerId" text NOT NULL,
	"stripeSubscriptionId" text,
	"plan" varchar(32) DEFAULT 'free' NOT NULL,
	"interval" varchar(8),
	"status" varchar(32),
	"currentPeriodEnd" timestamp,
	"cancelAtPeriodEnd" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workspaceBilling_workspaceId_unique" UNIQUE("workspaceId"),
	CONSTRAINT "workspaceBilling_stripeCustomerId_unique" UNIQUE("stripeCustomerId"),
	CONSTRAINT "workspaceBilling_stripeSubscriptionId_unique" UNIQUE("stripeSubscriptionId")
);
--> statement-breakpoint
ALTER TABLE "workspaceBilling" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspaceBilling" ADD CONSTRAINT "workspaceBilling_workspaceId_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;