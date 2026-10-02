import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { inboundEventStatuses } from "@subscriber.dev/db/schema";

export const ListInboundEventsQuerySchema = z.object({
  source: z
    .string()
    .optional()
    .describe('Only events from this source, e.g. "stripe".'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const InboundEventSchema = z.object({
  source: z.string(),
  externalEventId: z.string(),
  type: z.string(),
  status: z.enum(inboundEventStatuses),
  matchedEvents: z.array(z.string()).nullable(),
  outcome: z.string().nullable(),
  subscriberPublicId: z.string().nullable(),
  subscriberEmail: z.string().nullable(),
  createdAt: z.iso.datetime(),
  processedAt: z.iso.datetime().nullable(),
});

export const ListInboundEventsResponseSchema = z.object({
  events: z.array(InboundEventSchema),
  limit: z.number(),
  offset: z.number(),
});

export class ListInboundEventsQueryDto extends createZodDto(
  ListInboundEventsQuerySchema,
) {}
export class ListInboundEventsResponseDto extends createZodDto(
  ListInboundEventsResponseSchema,
) {}
