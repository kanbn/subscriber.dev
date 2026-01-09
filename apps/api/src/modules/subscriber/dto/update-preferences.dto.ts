import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const UpdatePreferencesSchema = z.object({
  email: z.boolean().optional(),
});

export const UpdatePreferencesResponseSchema = z.object({
  preferences: z.object({
    publicId: z.string(),
    subscriberPublicId: z.string(),
    email: z.boolean(),
    version: z.number(),
    createdAt: z.date(),
  }),
});

export class UpdatePreferencesDto extends createZodDto(
  UpdatePreferencesSchema,
) {}
export class UpdatePreferencesResponseDto extends createZodDto(
  UpdatePreferencesResponseSchema,
) {}
