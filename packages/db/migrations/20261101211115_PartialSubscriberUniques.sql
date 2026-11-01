ALTER TABLE "subscribers" DROP CONSTRAINT "subscribers_environment_externalId";--> statement-breakpoint
ALTER TABLE "subscribers" DROP CONSTRAINT "subscribers_environment_email";--> statement-breakpoint
CREATE UNIQUE INDEX "subscribers_environment_externalId" ON "subscribers" USING btree ("environmentId","externalId") WHERE "subscribers"."deletedAt" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "subscribers_environment_email" ON "subscribers" USING btree ("environmentId","email") WHERE "subscribers"."deletedAt" is null;