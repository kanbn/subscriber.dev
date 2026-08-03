ALTER TABLE "subscribers" DROP CONSTRAINT "subscribers_publicId_unique";--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_environment_publicId" UNIQUE("environmentId","publicId");
