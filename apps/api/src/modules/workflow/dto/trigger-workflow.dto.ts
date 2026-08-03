import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const TriggerWorkflowSchema = z
  .object({
    key: z.string().min(1).describe('The workflow key, e.g. "user-signup".'),
    subscriber: z.object({
      publicId: z.string().optional(),
      externalId: z.string().optional(),
      email: z.string().email().optional(),
    }),
    payload: z
      .record(z.unknown())
      .optional()
      .describe(
        "Arbitrary data merged into {{variable}} interpolation alongside subscriber fields.",
      ),
  })
  .refine(
    (v) =>
      v.subscriber.publicId || v.subscriber.externalId || v.subscriber.email,
    {
      message:
        "At least one of subscriber.publicId, externalId, or email must be provided",
    },
  );

export const TriggerWorkflowResponseSchema = z.object({
  triggered: z.boolean(),
  runPublicId: z.string().optional(),
  reason: z.string().optional(),
});

export class TriggerWorkflowDto extends createZodDto(TriggerWorkflowSchema) {}
export class TriggerWorkflowResponseDto extends createZodDto(
  TriggerWorkflowResponseSchema,
) {}
