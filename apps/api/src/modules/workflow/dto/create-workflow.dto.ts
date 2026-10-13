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

export const emailLayouts = ["default", "none"] as const;
export type EmailLayout = (typeof emailLayouts)[number];

const emailLayoutSchema = z
  .enum(emailLayouts)
  .default("default")
  .describe(
    '"default" wraps the body in a centred, readable layout (system font stack, 600px width, unsubscribe footer). "none" sends the body as-is, for bringing your own full HTML template. A body that is already a full HTML document (has <html> or <body>) is always sent as-is.',
  );

export const emailPreviewTextSchema = z
  .string()
  .max(255)
  .optional()
  .describe(
    "Short summary inboxes show next to the subject. Supports Liquid. Only used with the default layout.",
  );

export const emailFromNameSchema = z
  .string()
  .max(255)
  .optional()
  .describe(
    'Sender name for every email in this workflow, e.g. "Jane from Acme". Defaults to the email integration\'s fromName. The from address always comes from the integration.',
  );

export const emailReplyToSchema = z
  .email()
  .optional()
  .describe(
    "Where replies to this workflow's emails go. Defaults to the email integration's replyTo, or the from address.",
  );

export const workflowEmailSettingsSchema = z
  .object({ fromName: emailFromNameSchema, replyTo: emailReplyToSchema })
  .describe(
    "Email settings for every email in this workflow. Leave a field out to use the email integration's.",
  );

export const workflowChannelsSchema = z
  .object({ email: workflowEmailSettingsSchema.optional() })
  .describe(
    "Settings for each channel this workflow sends on. Channel-specific, so the workflow itself stays channel-neutral.",
  );

const EmailWorkflowStepSchema = z.object({
  type: z.literal("email"),
  delayMs: delayMsSchema,
  subject: z.string().min(1).max(500),
  body: z
    .string()
    .min(1)
    .describe(
      'HTML (or plain text) email body, rendered as a Liquid template (https://liquidjs.com). Supports {{ subscriber.firstName }} etc. interpolation from subscriber fields and custom attributes (an attribute called company is {{ subscriber.company }}), and trigger payload fields at the top level (payload {"plan": "pro"} is {{ plan }}), plus {{unsubscribeUrl}} for this subscriber\'s unsubscribe link, and {% if %}/{% else %}/{% endif %} conditionals, e.g. {% if subscriber.firstName %}Hey {{ subscriber.firstName }}{% else %}Hey there{% endif %}. With the default layout, write just the content (<p>, <h1>, <h2>, <a>, <ul>, <img>, <hr>, <blockquote>…) — fonts, spacing and the centred column are applied for you. Add class="button" to a link to render it as a call-to-action button.',
    ),
  layout: emailLayoutSchema,
  previewText: emailPreviewTextSchema,
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

export const WorkflowTriggerSchema = z.object({
  source: z
    .string()
    .min(1)
    .describe('Connected integration that fires the trigger, e.g. "stripe".'),
  event: z
    .string()
    .min(1)
    .max(255)
    .describe(
      'One of the source\'s events (see list_trigger_sources), e.g. "trial_started", or a raw event type such as "checkout.session.completed".',
    ),
});

export const workflowTriggersSchema = z
  .array(WorkflowTriggerSchema)
  .max(50)
  .describe(
    "Events from connected integrations that start this workflow for the person they're about. Automation workflows only; the integration must be connected first.",
  );

export const workflowExitConditionsSchema = z
  .array(WorkflowTriggerSchema)
  .max(50)
  .describe(
    "Events from connected integrations that stop this workflow for the person they're about: their active runs are cancelled and unsent steps never send. Checked before triggers, so an event in both restarts the workflow. Automation workflows only; the integration must be connected first.",
  );

const WorkflowTriggerResponseSchema = WorkflowTriggerSchema.extend({
  label: z.string().describe("Human-readable name of the event."),
  active: z
    .boolean()
    .describe(
      "False while the source's integration is disconnected; it resumes once it's reconnected.",
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
  type: z
    .enum(["automation", "broadcast"])
    .default("automation")
    .describe(
      "Purely organizational: automation workflows are meant to be triggered individually per-subscriber; broadcast workflows are meant to be fanned out via the broadcast endpoint. Either can technically still be used either way.",
    ),
  channels: workflowChannelsSchema.optional(),
  steps: z.array(WorkflowStepSchema).min(1).max(50),
  triggers: workflowTriggersSchema.optional(),
  exitConditions: workflowExitConditionsSchema.optional(),
});

export const WorkflowStepResponseSchema = z.object({
  publicId: z.string(),
  stepOrder: z.number(),
  type: z.string(),
  delayMs: z.number(),
  subject: z.string().optional(),
  body: z.string().optional(),
  layout: z
    .enum(emailLayouts)
    .optional()
    .describe(
      'Email steps only. Steps saved before layouts existed have no value and use "default".',
    ),
  previewText: z.string().optional().describe("Email steps only."),
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
  channels: z
    .object({
      email: z
        .object({
          fromName: z.string().optional(),
          replyTo: z.string().optional(),
        })
        .optional(),
    })
    .describe("Settings for each channel this workflow sends on."),
  steps: z.array(WorkflowStepResponseSchema),
  triggers: z.array(WorkflowTriggerResponseSchema),
  exitConditions: z.array(WorkflowTriggerResponseSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  editUrl: z
    .string()
    .optional()
    .describe(
      "Link to edit this workflow's emails in the web editor. Share it when someone wants to tweak the copy or preview an email.",
    ),
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
