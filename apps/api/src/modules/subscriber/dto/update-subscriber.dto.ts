import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const UpdateSubscriberSchema = z.object({
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  externalId: z.string().optional().nullable(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  name: z.string().optional().nullable(),
  attributes: z.record(z.string(), z.unknown()).optional().nullable(),
});

import {
  SubscriberSchema,
} from "./create-subscriber.dto.js";

export const UpdateSubscriberResponseSchema = z.object({
  subscriber: SubscriberSchema,
});

export class UpdateSubscriberDto extends createZodDto(UpdateSubscriberSchema) {}
export class UpdateSubscriberResponseDto extends createZodDto(
  UpdateSubscriberResponseSchema,
) {}
