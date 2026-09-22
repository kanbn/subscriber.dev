import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const CreateSubscriberSchema = z.object({
  publicId: z
    .string()
    .min(1)
    .max(255)
    .optional()
    .describe(
      "Bring your own identifier for this subscriber. Must be unique within the environment. If omitted, one is generated automatically.",
    ),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  externalId: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  name: z.string().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  preferences: z
    .object({
      email: z.boolean().optional().default(true),
    })
    .optional()
    .default({ email: true }),
});

export const SubscriberSchema = z.object({
  publicId: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  externalId: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  name: z.string().nullable(),
  attributes: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  unsubscribeUrl: z.string().nullable(),
});

export const SubscriberPreferencesSchema = z.object({
  publicId: z.string(),
  email: z.boolean(),
  version: z.number(),
  createdAt: z.iso.datetime(),
});

export const CreateSubscriberResponseSchema = z.object({
  subscriber: SubscriberSchema,
  preferences: SubscriberPreferencesSchema,
});

export class CreateSubscriberDto extends createZodDto(CreateSubscriberSchema) {}
export class CreateSubscriberResponseDto extends createZodDto(
  CreateSubscriberResponseSchema,
) {}
