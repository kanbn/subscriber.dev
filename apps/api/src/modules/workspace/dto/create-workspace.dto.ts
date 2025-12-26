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

export const CreateWorkspaceSchema = z.object({
  name: z.string().min(1).max(255),
});

export const CreateWorkspaceResponseSchema = z.object({
  workspace: WorkspaceSchema,
  environment: EnvironmentSchema,
});

export class CreateWorkspaceDto extends createZodDto(CreateWorkspaceSchema) {}
export class CreateWorkspaceResponseDto extends createZodDto(
  CreateWorkspaceResponseSchema,
) {}
