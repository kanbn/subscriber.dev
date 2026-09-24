import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const delayMsSchema = z.coerce
  .number()
  .int()
  .min(0)
  .default(0)
  .describe(
    "Milliseconds to wait after the previous step (or after trigger, for the first step) before sending this step.",
  );

const EmailWorkflowStepSchema = z.object({
  type: z.literal("email"),
  delayMs: delayMsSchema,
  subject: z.string().min(1).max(500),
  body: z
    .string()
    .min(1)
    .describe(
      "HTML (or plain text) email body, rendered as a Liquid template (https://liquidjs.com). Supports {{ subscriber.firstName }} etc. interpolation from subscriber fields, subscriber.attributes, and the trigger payload, plus {{unsubscribeUrl}} for this subscriber's unsubscribe link, and {% if %}/{% else %}/{% endif %} conditionals, e.g. {% if subscriber.firstName %}Hey {{ subscriber.firstName }}{% else %}Hey there{% endif %}.",
    ),
});

const WebhookWorkflowStepSchema = z.object({
  type: z.literal("webhook"),
  delayMs: delayMsSchema,
  url: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://"), "url must use https")
    .describe("Destination URL the JSON payload is POSTed to."),
  body: z
    .string()
    .min(1)
    .describe(
      'JSON payload template, rendered via Liquid (https://liquidjs.com) then POSTed as-is with Content-Type: application/json. e.g. {"content": "{{ subscriber.email | json }} just signed up!"} for a Discord webhook. Use the `json` filter around interpolated values to keep the result valid JSON.',
    ),
});

export const WorkflowStepSchema = z.discriminatedUnion("type", [
  EmailWorkflowStepSchema,
  WebhookWorkflowStepSchema,
]);

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
  type: z
    .enum(["automation", "broadcast"])
    .default("automation")
    .describe(
      "Purely organizational: automation workflows are meant to be triggered individually per-subscriber; broadcast workflows are meant to be fanned out via the broadcast endpoint. Either can technically still be used either way.",
    ),
  steps: z.array(WorkflowStepSchema).min(1).max(50),
});

export const WorkflowStepResponseSchema = z.object({
  publicId: z.string(),
  stepOrder: z.number(),
  type: z.string(),
  delayMs: z.number(),
  subject: z.string().optional(),
  body: z.string().optional(),
  url: z
    .string()
    .optional()
    .describe(
      "Webhook URL, redacted to origin + last 4 characters since it usually contains a secret. Sending the redacted value back in an update keeps the stored URL.",
    ),
});

export const WorkflowSchema = z.object({
  publicId: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(["active", "paused"]),
  type: z.enum(["automation", "broadcast"]),
  steps: z.array(WorkflowStepResponseSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const WorkflowDetailResponseSchema = WorkflowSchema.extend({
  sentCount: z.number(),
  failedCount: z.number(),
  skippedCount: z.number(),
  pendingCount: z.number(),
  bouncedCount: z.number(),
  hardBounceCount: z.number(),
  softBounceCount: z.number(),
  successRate: z.number().nullable(),
});

export class CreateWorkflowDto extends createZodDto(CreateWorkflowSchema) {}
export class WorkflowResponseDto extends createZodDto(WorkflowSchema) {}
export class WorkflowDetailResponseDto extends createZodDto(
  WorkflowDetailResponseSchema,
) {}
