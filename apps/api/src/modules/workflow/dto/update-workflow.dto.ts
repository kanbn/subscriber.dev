import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { WorkflowStepSchema } from "./create-workflow.dto.js";

export const UpdateWorkflowSchema = z.object({
  key: z.string().min(1).max(255).optional(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(["active", "paused"]).optional(),
  steps: z
    .array(WorkflowStepSchema)
    .min(1)
    .max(50)
    .optional()
    .describe("If provided, replaces ALL existing steps for this workflow."),
});

export class UpdateWorkflowDto extends createZodDto(UpdateWorkflowSchema) {}
