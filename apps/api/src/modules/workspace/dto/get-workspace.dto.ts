import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const WorkspaceSchema = z.object({
  id: z.number(),
  publicId: z.string(),
  name: z.string(),
  slug: z.string(),
  postalAddress: z.string().nullable(),
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

export const ListEnvironmentsResponseSchema = z.object({
  environments: z.array(EnvironmentSchema),
});

export class GetWorkspaceResponseDto extends createZodDto(
  GetWorkspaceResponseSchema,
) {}

export class WorkspaceDto extends createZodDto(WorkspaceSchema) {}
export class EnvironmentDto extends createZodDto(EnvironmentSchema) {}
export class ListEnvironmentsResponseDto extends createZodDto(
  ListEnvironmentsResponseSchema,
) {}
