import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { workflowBroadcastStatuses } from "@subscriber.dev/db/schema";

import { AudienceConditionSchema } from "../audienceQuery.js";

export const TriggerBroadcastSchema = z.object({
  audience: AudienceConditionSchema,
});

export const TriggerBroadcastResponseSchema = z.object({
  broadcastId: z.string(),
  status: z.enum(workflowBroadcastStatuses),
});

export const ListBroadcastsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const BroadcastSummarySchema = z.object({
  publicId: z.string(),
  status: z.enum(workflowBroadcastStatuses),
  matchedCount: z.number().nullable(),
  createdAt: z.date(),
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
});

export class TriggerBroadcastDto extends createZodDto(TriggerBroadcastSchema) {}
export class TriggerBroadcastResponseDto extends createZodDto(
  TriggerBroadcastResponseSchema,
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
