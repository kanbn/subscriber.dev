import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const SETUP_STEP_KEYS = [
  "email_provider",
  "first_workflow",
  "first_email_sent",
] as const;

export const SETUP_SUGGESTION_KEYS = ["postal_address", "stripe"] as const;

export const SetupResponseSchema = z.object({
  complete: z.boolean().describe("Every step is done."),
  next: z
    .enum(SETUP_STEP_KEYS)
    .nullable()
    .describe("The first step that isn't done yet, or null when complete."),
  steps: z.array(
    z.object({
      key: z.enum(SETUP_STEP_KEYS),
      title: z.string(),
      done: z.boolean(),
    }),
  ),
  suggestions: z
    .array(
      z.object({
        key: z.enum(SETUP_SUGGESTION_KEYS),
        title: z.string(),
        done: z.boolean(),
      }),
    )
    .describe("Optional extras, worth offering once the steps are done."),
});

export type SetupResponse = z.infer<typeof SetupResponseSchema>;

export class SetupResponseDto extends createZodDto(SetupResponseSchema) {}
