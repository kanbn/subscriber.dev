ALTER TABLE "apiKey" RENAME COLUMN "userId" TO "referenceId";--> statement-breakpoint
ALTER TABLE "apiKey" RENAME CONSTRAINT "apiKey_userId_users_id_fk" TO "apiKey_referenceId_users_id_fk";--> statement-breakpoint
ALTER TABLE "apiKey" ADD COLUMN "configId" text DEFAULT 'default' NOT NULL;
