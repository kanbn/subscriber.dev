import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import {
  SubscriberPreferencesSchema,
  SubscriberSchema,
} from "./create-subscriber.dto.js";

export const SubscriberWithTagsSchema = SubscriberSchema.extend({
  tags: z.array(z.string()),
});

export const GetSubscriberResponseSchema = z.object({
  subscriber: SubscriberWithTagsSchema,
  preferences: SubscriberPreferencesSchema.nullable(),
});

export class GetSubscriberResponseDto extends createZodDto(
  GetSubscriberResponseSchema,
) {}
