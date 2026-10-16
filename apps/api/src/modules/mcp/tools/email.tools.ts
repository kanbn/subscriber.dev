import { BadRequestException, Injectable } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import { z } from "zod";

import {
  emailFromNameSchema,
  emailLayouts,
  emailPreviewTextSchema,
  emailReplyToSchema,
} from "../../workflow/dto/create-workflow.dto.js";
import {
  testEmailDataSchema,
  testEmailRecipientSchema,
} from "../../workflow/dto/email.dto.js";
import { EmailTestService } from "../../workflow/emailTest.service.js";
import { requireEnvironment } from "../mcp-environment.util.js";
import { requireMcpDb, requireMcpUser } from "../mcp-user.util.js";

const SendTestEmailSchema = z.object({
  environmentId: z.string(),
  workflowId: z
    .string()
    .optional()
    .describe("Send one of this workflow's email steps, as it stands now."),
  step: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "Which of the workflow's steps to send, counting from 1. Defaults to its first email step.",
    ),
  subject: z
    .string()
    .max(500)
    .optional()
    .describe("Instead of a workflow, send this subject and body."),
  body: z.string().optional(),
  layout: z.enum(emailLayouts).optional(),
  previewText: emailPreviewTextSchema,
  fromName: emailFromNameSchema,
  replyTo: emailReplyToSchema,
  to: testEmailRecipientSchema,
  data: testEmailDataSchema,
});

@Injectable()
export class EmailTools {
  constructor(private readonly emailTest: EmailTestService) {}

  @Tool({
    name: "send_test_email",
    description:
      "Send one email for real, to check how it looks and that the email provider works, without creating a subscriber or triggering a workflow. Pass a workflowId (and optionally step) to send one of its emails, or a subject and body. It goes to the user unless you pass to, with [Test] before the subject, and doesn't count towards analytics or usage.",
    parameters: SendTestEmailSchema,
    annotations: { openWorldHint: true },
  })
  async sendTestEmail(
    args: z.infer<typeof SendTestEmailSchema>,
    _context: unknown,
    rawRequest: { user?: unknown; db?: unknown } | undefined,
  ) {
    const user = requireMcpUser(rawRequest);
    const db = requireMcpDb(rawRequest);
    const environment = await requireEnvironment(
      db,
      user.id,
      args.environmentId,
    );

    const { workflowId, step, to, data, environmentId: _, ...raw } = args;
    let content;
    if (workflowId) {
      content = await this.emailTest.workflowStep(
        db,
        environment.id,
        workflowId,
        step,
      );
    } else if (raw.subject && raw.body) {
      content = { ...raw, subject: raw.subject, body: raw.body };
    } else {
      throw new BadRequestException("Pass a workflowId, or a subject and body");
    }
    return this.emailTest.send(db, user, environment.id, content, { to, data });
  }
}
