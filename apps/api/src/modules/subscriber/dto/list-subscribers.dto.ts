import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { SubscriberSchema } from "./create-subscriber.dto.js";

export const ListSubscribersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  email: z.string().email().optional(),
  externalId: z.string().optional(),
  emailOptedIn: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

export const ListSubscribersResponseSchema = z.object({
  subscribers: z.array(SubscriberSchema),
  limit: z.number(),
  offset: z.number(),
});

export class ListSubscribersQueryDto extends createZodDto(
  ListSubscribersQuerySchema,
) {}
export class ListSubscribersResponseDto extends createZodDto(
  ListSubscribersResponseSchema,
) {}
