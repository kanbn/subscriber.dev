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

export const RenderedEmailSchema = z.object({
  subject: z.string(),
  html: z.string(),
});

export const TestEmailResponseSchema = z.object({
  to: z.string(),
});

export class EmailContentDto extends createZodDto(EmailContentSchema) {}
export class RenderedEmailDto extends createZodDto(RenderedEmailSchema) {}
export class TestEmailResponseDto extends createZodDto(
  TestEmailResponseSchema,
) {}
