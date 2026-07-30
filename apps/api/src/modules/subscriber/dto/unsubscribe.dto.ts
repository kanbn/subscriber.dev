import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const UnsubscribeQuerySchema = z.object({
  token: z.string().min(1),
});

export const UnsubscribeResponseSchema = z.object({
  unsubscribed: z.boolean(),
});

export class UnsubscribeQueryDto extends createZodDto(UnsubscribeQuerySchema) {}
export class UnsubscribeResponseDto extends createZodDto(
  UnsubscribeResponseSchema,
) {}
