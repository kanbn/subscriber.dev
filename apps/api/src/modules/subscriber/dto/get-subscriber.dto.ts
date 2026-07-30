import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import {
  SubscriberPreferencesSchema,
  SubscriberSchema,
} from "./create-subscriber.dto.js";

export const GetSubscriberResponseSchema = z.object({
  subscriber: SubscriberSchema,
  preferences: SubscriberPreferencesSchema.nullable(),
});

export class GetSubscriberResponseDto extends createZodDto(
  GetSubscriberResponseSchema,
) {}
