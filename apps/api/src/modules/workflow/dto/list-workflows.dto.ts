import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { WorkflowSchema } from "./create-workflow.dto.js";

export const ListWorkflowsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  type: z.enum(["automation", "broadcast"]).optional(),
});

export const ListWorkflowsResponseSchema = z.object({
  workflows: z.array(WorkflowSchema),
  limit: z.number(),
  offset: z.number(),
});

export class ListWorkflowsQueryDto extends createZodDto(
  ListWorkflowsQuerySchema,
) {}
export class ListWorkflowsResponseDto extends createZodDto(
  ListWorkflowsResponseSchema,
) {}
