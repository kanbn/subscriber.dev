import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const UnsubscribeBodySchema = z.object({
  token: z.string().min(1),
});

export const UnsubscribeResponseSchema = z.object({
  unsubscribed: z.boolean(),
});

export class UnsubscribeBodyDto extends createZodDto(UnsubscribeBodySchema) {}
export class UnsubscribeResponseDto extends createZodDto(
  UnsubscribeResponseSchema,
) {}
