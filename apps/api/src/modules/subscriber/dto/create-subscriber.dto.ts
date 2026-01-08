import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const CreateSubscriberSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  externalId: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  name: z.string().optional(),
  attributes: z.record(z.unknown()).optional(),
  preferences: z
    .object({
      email: z.boolean().optional().default(true),
    })
    .optional()
    .default({ email: true }),
});

export const SubscriberSchema = z.object({
  id: z.number(),
  publicId: z.string(),
  environmentId: z.number(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  externalId: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  name: z.string().nullable(),
  attributes: z.record(z.unknown()).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const SubscriberPreferencesSchema = z.object({
  id: z.number(),
  subscriberId: z.number(),
  email: z.boolean(),
  version: z.number(),
  createdAt: z.date(),
});

export const CreateSubscriberResponseSchema = z.object({
  subscriber: SubscriberSchema,
  preferences: SubscriberPreferencesSchema,
});

export class CreateSubscriberDto extends createZodDto(CreateSubscriberSchema) {}
export class CreateSubscriberResponseDto extends createZodDto(
  CreateSubscriberResponseSchema,
) {}
