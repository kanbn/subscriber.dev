import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const TriggerWorkflowSchema = z
  .object({
    key: z.string().min(1).describe('The workflow key, e.g. "user-signup".'),
    subscriber: z
      .object({
        publicId: z.string().optional(),
        externalId: z.string().optional(),
        email: z.string().email().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        name: z.string().optional(),
      })
      .describe(
        "Matched by publicId, then externalId, then email. If none match and email is set, the subscriber is created with these fields; an existing subscriber isn't changed.",
      ),
    payload: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'Data for the templates, available as top-level variables: {"plan": "pro"} is {{ plan }}.',
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
