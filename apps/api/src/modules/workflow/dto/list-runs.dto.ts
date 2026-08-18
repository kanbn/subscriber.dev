import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const ListRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const WorkflowRunStepSummarySchema = z.object({
  stepOrder: z.number(),
  type: z.string(),
  status: z.enum([
    "pending",
    "sent",
    "skipped",
    "failed",
    "cancelled",
    "bounced",
  ]),
  scheduledAt: z.date(),
  sentAt: z.date().nullable(),
  errorMessage: z.string().nullable(),
  bounceType: z.enum(["hard", "soft"]).nullable(),
});

export const WorkflowRunSubscriberSummarySchema = z.object({
  publicId: z.string(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  externalId: z.string().nullable(),
});

export const WorkflowRunSummarySchema = z.object({
  publicId: z.string(),
  status: z.enum(["active", "completed", "cancelled"]),
  triggeredAt: z.date(),
  completedAt: z.date().nullable(),
  subscriber: WorkflowRunSubscriberSummarySchema,
  steps: z.array(WorkflowRunStepSummarySchema),
});

export const ListRunsResponseSchema = z.object({
  runs: z.array(WorkflowRunSummarySchema),
  limit: z.number(),
  offset: z.number(),
});

export const WorkflowRunWorkflowSummarySchema = z.object({
  publicId: z.string(),
  key: z.string(),
  name: z.string(),
});

export const EnvironmentRunSummarySchema = WorkflowRunSummarySchema.extend({
  workflow: WorkflowRunWorkflowSummarySchema,
});

export const ListEnvironmentRunsResponseSchema = z.object({
  runs: z.array(EnvironmentRunSummarySchema),
  limit: z.number(),
  offset: z.number(),
});

export class ListRunsQueryDto extends createZodDto(ListRunsQuerySchema) {}
export class ListRunsResponseDto extends createZodDto(ListRunsResponseSchema) {}
export class ListEnvironmentRunsResponseDto extends createZodDto(
  ListEnvironmentRunsResponseSchema,
) {}
