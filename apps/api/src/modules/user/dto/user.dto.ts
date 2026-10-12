import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const UpdateUserSchema = z.object({
  name: z.string().optional(),
  image: z.string().optional(),
});

const UserApiKeySchema = z.object({
  id: z.number(),
  prefix: z.string().nullable(),
});

export const UserResponseSchema = z.object({
  publicId: z.string(),
  name: z.string().nullable(),
  email: z.string(),
  image: z.string().nullable(),
  apiKeys: z.array(UserApiKeySchema),
});

export const UpdateUserResponseSchema = z.object({
  publicId: z.string(),
  name: z.string().nullable(),
  image: z.string().nullable(),
});

export const AgentResponseSchema = z.object({
  clientId: z.string(),
  name: z.string().nullable(),
  connectedAt: z.iso.datetime(),
});

export class UpdateUserDto extends createZodDto(UpdateUserSchema) {}
export class UserResponseDto extends createZodDto(UserResponseSchema) {}
export class UpdateUserResponseDto extends createZodDto(
  UpdateUserResponseSchema,
) {}
export class AgentResponseDto extends createZodDto(AgentResponseSchema) {}
