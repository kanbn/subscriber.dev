import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import {
  workflowEmailSettingsSchema,
  workflowExitConditionsSchema,
  WorkflowStepSchema,
  workflowTriggersSchema,
} from "./create-workflow.dto.js";

export const UpdateWorkflowSchema = z.object({
  key: z.string().min(1).max(255).optional(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(["active", "paused"]).optional(),
  channels: z
    .object({
      email: workflowEmailSettingsSchema
        .nullable()
        .optional()
        .describe(
          "Replaces the workflow's email settings. Null goes back to the email integration's.",
        ),
    })
    .optional()
    .describe(
      "Per-channel settings. Each channel you include replaces that channel's settings; channels you leave out are unchanged.",
    ),
  steps: z
    .array(WorkflowStepSchema)
    .min(1)
    .max(50)
    .optional()
    .describe("If provided, replaces ALL existing steps for this workflow."),
  triggers: workflowTriggersSchema
    .optional()
    .describe(
      "If provided, replaces ALL existing triggers for this workflow. Automation workflows only; each trigger's integration must be connected.",
    ),
  exitConditions: workflowExitConditionsSchema
    .optional()
    .describe(
      "If provided, replaces ALL existing exit conditions for this workflow. Each one's integration must be connected.",
    ),
});

export class UpdateWorkflowDto extends createZodDto(UpdateWorkflowSchema) {}
