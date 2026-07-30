import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const WorkspaceSchema = z.object({
  id: z.number(),
  publicId: z.string(),
  name: z.string(),
  slug: z.string(),
});

export const EnvironmentSchema = z.object({
  id: z.number(),
  publicId: z.string(),
  name: z.string(),
  slug: z.string(),
});

export const GetWorkspaceResponseSchema = z.object({
  workspace: WorkspaceSchema,
  environment: EnvironmentSchema,
});

export class GetWorkspaceResponseDto extends createZodDto(
  GetWorkspaceResponseSchema,
) {}

export class WorkspaceDto extends createZodDto(WorkspaceSchema) {}
