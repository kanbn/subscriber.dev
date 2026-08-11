import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const UpsertIntegrationSchema = z.object({}).catchall(z.unknown());

export const IntegrationResponseSchema = z
  .object({
    type: z.string(),
    updatedAt: z.date(),
  })
  .catchall(z.unknown());

export const ListIntegrationsResponseSchema = z.object({
  integrations: z.array(IntegrationResponseSchema),
});

export class UpsertIntegrationDto extends createZodDto(
  UpsertIntegrationSchema,
) {}
export class IntegrationResponseDto extends createZodDto(
  IntegrationResponseSchema,
) {}
export class ListIntegrationsResponseDto extends createZodDto(
  ListIntegrationsResponseSchema,
) {}
