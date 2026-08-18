import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const BounceWebhookBodySchema = z.object({
  runStepPublicId: z.string().min(1),
  bounceType: z.enum(["hard", "soft"]),
  reason: z.string().min(1).max(2000),
});

export class BounceWebhookBodyDto extends createZodDto(
  BounceWebhookBodySchema,
) {}
