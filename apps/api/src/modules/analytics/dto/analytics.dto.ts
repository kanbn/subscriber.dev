import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const GetAnalyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export const AnalyticsResponseSchema = z.object({
  days: z.number(),
  subscribers: z.object({
    total: z.number(),
    newInPeriod: z.number(),
    optedOut: z.number(),
    optedOutInPeriod: z.number(),
  }),
  sends: z.object({
    sent: z.number(),
    failed: z.number(),
    skipped: z.number(),
    pending: z.number(),
    bounced: z.number(),
    successRate: z.number().nullable(),
  }),
  bounces: z.object({
    hard: z.number(),
    soft: z.number(),
  }),
});

export class GetAnalyticsQueryDto extends createZodDto(
  GetAnalyticsQuerySchema,
) {}
export class AnalyticsResponseDto extends createZodDto(
  AnalyticsResponseSchema,
) {}
