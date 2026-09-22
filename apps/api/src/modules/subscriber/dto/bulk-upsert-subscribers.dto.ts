import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import {
  SubscriberPreferencesSchema,
  SubscriberSchema,
} from "./create-subscriber.dto.js";

const BulkSubscriberItemSchema = z.object({
  publicId: z
    .string()
    .min(1)
    .max(255)
    .optional()
    .describe(
      "Bring your own identifier. Used (along with externalId and email) to find an existing subscriber to update; if none match, a new subscriber is created.",
    ),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  externalId: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  name: z.string().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  preferences: z
    .object({
      email: z.boolean().optional(),
    })
    .optional()
    .describe(
      "Omit entirely to leave existing preferences untouched on update.",
    ),
});

export const BulkUpsertSubscribersSchema = z.object({
  subscribers: z.array(BulkSubscriberItemSchema).min(1).max(500),
});

const BulkUpsertResultSchema = z.object({
  index: z.number(),
  status: z.enum(["created", "updated", "error"]),
  subscriber: SubscriberSchema.optional(),
  preferences: SubscriberPreferencesSchema.optional(),
  error: z.string().optional(),
});

export const BulkUpsertSubscribersResponseSchema = z.object({
  results: z.array(BulkUpsertResultSchema),
  summary: z.object({
    created: z.number(),
    updated: z.number(),
    errored: z.number(),
  }),
});

export class BulkUpsertSubscribersDto extends createZodDto(
  BulkUpsertSubscribersSchema,
) {}
export class BulkUpsertSubscribersResponseDto extends createZodDto(
  BulkUpsertSubscribersResponseSchema,
) {}
