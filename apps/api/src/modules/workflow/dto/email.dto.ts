import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import {
  emailFromNameSchema,
  emailLayouts,
  emailPreviewTextSchema,
  emailReplyToSchema,
} from "./create-workflow.dto.js";

export const EmailContentSchema = z.object({
  subject: z.string().max(500),
  body: z.string(),
  layout: z.enum(emailLayouts).default("default"),
  previewText: emailPreviewTextSchema,
  fromName: emailFromNameSchema,
  replyTo: emailReplyToSchema,
});

export const testEmailRecipientSchema = z
  .string()
  .email()
  .optional()
  .describe("Who to send it to. Defaults to your own address.");

export const testEmailDataSchema = z
  .record(z.string(), z.unknown())
  .optional()
  .describe(
    'Sample data for the template, like a trigger payload: {"plan": "pro"} is {{ plan }}. Put subscriber fields under "subscriber", e.g. {"subscriber": {"firstName": "Ada"}}. Defaults to your own details as the subscriber.',
  );

export const TestEmailSchema = EmailContentSchema.partial({
  subject: true,
  body: true,
}).extend({
  workflowId: z
    .string()
    .optional()
    .describe(
      "Send one of this workflow's email steps, as it stands now, instead of a subject and body.",
    ),
  step: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "Which of the workflow's steps to send, counting from 1. Defaults to its first email step.",
    ),
  to: testEmailRecipientSchema,
  data: testEmailDataSchema,
});

export const RenderedEmailSchema = z.object({
  subject: z.string(),
  html: z.string(),
});

export const TestEmailResponseSchema = z.object({
  to: z.string(),
  subject: z.string(),
});

export class EmailContentDto extends createZodDto(EmailContentSchema) {}
export class TestEmailDto extends createZodDto(TestEmailSchema) {}
export class RenderedEmailDto extends createZodDto(RenderedEmailSchema) {}
export class TestEmailResponseDto extends createZodDto(
  TestEmailResponseSchema,
) {}
