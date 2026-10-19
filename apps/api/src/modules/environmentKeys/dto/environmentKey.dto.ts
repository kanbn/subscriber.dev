import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { ALL_ENVIRONMENT_KEY_SCOPES } from "@subscriber.dev/shared/environmentKeys";

const ScopeSchema = z.enum(ALL_ENVIRONMENT_KEY_SCOPES);

export const CreateEnvironmentKeySchema = z.object({
  name: z.string().trim().min(1).max(255),
  access: z
    .enum(["limited", "full"])
    .optional()
    .describe(
      "limited (the default) can trigger workflows and create or update subscribers. full can call every endpoint an API key can.",
    ),
  scopes: z
    .array(ScopeSchema)
    .min(1)
    .optional()
    .describe("Pick scopes yourself instead of access."),
});

export const EnvironmentKeySchema = z.object({
  publicId: z.string(),
  name: z.string(),
  start: z
    .string()
    .describe("The first characters of the key, to recognise it"),
  scopes: z.array(ScopeSchema),
  lastUsedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export const CreatedEnvironmentKeySchema = EnvironmentKeySchema.extend({
  key: z.string().describe("The API key. It's only shown this once."),
});

export const ListEnvironmentKeysResponseSchema = z.object({
  keys: z.array(EnvironmentKeySchema),
});

export const CurrentEnvironmentKeySchema = z.object({
  publicId: z.string(),
  name: z.string(),
  start: z.string(),
  scopes: z.array(ScopeSchema),
  workspaceId: z.string(),
  environment: z.object({
    publicId: z.string(),
    name: z.string(),
    slug: z.string(),
  }),
});

export class CreateEnvironmentKeyDto extends createZodDto(
  CreateEnvironmentKeySchema,
) {}
export class EnvironmentKeyDto extends createZodDto(EnvironmentKeySchema) {}
export class CreatedEnvironmentKeyDto extends createZodDto(
  CreatedEnvironmentKeySchema,
) {}
export class ListEnvironmentKeysResponseDto extends createZodDto(
  ListEnvironmentKeysResponseSchema,
) {}
export class CurrentEnvironmentKeyDto extends createZodDto(
  CurrentEnvironmentKeySchema,
) {}
