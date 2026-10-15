import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { workflowBroadcastStatuses } from "@subscriber.dev/db/schema";

import { AudienceConditionSchema } from "../audienceQuery.js";

export const TriggerBroadcastSchema = z.object({
  audience: AudienceConditionSchema,
  sendOverHours: z
    .number()
    .positive()
    .max(168)
    .optional()
    .describe(
      "Spread sends evenly over this many hours (max 168) instead of sending as fast as possible. Gentler on sender reputation for large audiences, and leaves time to pause or cancel.",
    ),
  allowOverPlan: z
    .boolean()
    .optional()
    .describe(
      "subscriber.dev cloud: confirm sending to more subscribers than the plan includes, which moves the workspace up one plan after 3 days. Without it, such a broadcast is refused with an explanation; ask the user before setting it.",
    ),
});

export const TriggerBroadcastResponseSchema = z.object({
  broadcastId: z.string(),
  status: z.enum(workflowBroadcastStatuses),
});

export const PreviewBroadcastResponseSchema = z.object({
  matchedCount: z.number(),
});

export const ListBroadcastsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const BroadcastSummarySchema = z.object({
  publicId: z.string(),
  status: z
    .enum([...workflowBroadcastStatuses, "completed"])
    .describe(
      "completed: every matched subscriber has a run and no sends are pending.",
    ),
  matchedCount: z.number().nullable(),
  sendOverHours: z.number().nullable(),
  createdAt: z.iso.datetime(),
});

export const ListBroadcastsResponseSchema = z.object({
  broadcasts: z.array(BroadcastSummarySchema),
  limit: z.number(),
  offset: z.number(),
});

export const BroadcastDetailResponseSchema = BroadcastSummarySchema.extend({
  sentCount: z.number(),
  failedCount: z.number(),
  skippedCount: z.number(),
  pendingCount: z.number(),
  bouncedCount: z.number(),
  hardBounceCount: z.number(),
  softBounceCount: z.number(),
  successRate: z.number().nullable(),
});

export class TriggerBroadcastDto extends createZodDto(TriggerBroadcastSchema) {}
export class BroadcastSummaryDto extends createZodDto(BroadcastSummarySchema) {}
export class TriggerBroadcastResponseDto extends createZodDto(
  TriggerBroadcastResponseSchema,
) {}
export class PreviewBroadcastResponseDto extends createZodDto(
  PreviewBroadcastResponseSchema,
) {}
export class ListBroadcastsQueryDto extends createZodDto(
  ListBroadcastsQuerySchema,
) {}
export class ListBroadcastsResponseDto extends createZodDto(
  ListBroadcastsResponseSchema,
) {}
export class BroadcastDetailResponseDto extends createZodDto(
  BroadcastDetailResponseSchema,
) {}
