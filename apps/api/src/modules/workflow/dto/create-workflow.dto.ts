import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const WorkflowStepSchema = z.object({
  type: z.enum(["email"]).default("email"),
  delayMs: z.coerce
    .number()
    .int()
    .min(0)
    .default(0)
    .describe(
      "Milliseconds to wait after the previous step (or after trigger, for the first step) before sending this step.",
    ),
  subject: z.string().min(1).max(500),
  body: z
    .string()
    .min(1)
    .describe(
      "HTML (or plain text) email body. Supports {{variableName}} interpolation from subscriber fields, subscriber.attributes, and the trigger payload.",
    ),
});

export const CreateWorkflowSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(255)
    .describe(
      'Stable identifier used to trigger this workflow, e.g. "user-signup". Unique within the environment.',
    ),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  steps: z.array(WorkflowStepSchema).min(1).max(50),
});

export const WorkflowStepResponseSchema = z.object({
  publicId: z.string(),
  stepOrder: z.number(),
  type: z.string(),
  delayMs: z.number(),
  subject: z.string().optional(),
  body: z.string().optional(),
});

export const WorkflowSchema = z.object({
  publicId: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(["active", "paused"]),
  steps: z.array(WorkflowStepResponseSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export class CreateWorkflowDto extends createZodDto(CreateWorkflowSchema) {}
export class WorkflowResponseDto extends createZodDto(WorkflowSchema) {}
