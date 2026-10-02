import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const TriggerSourceSchema = z.object({
  source: z.string().describe('Use as a trigger\'s `source`, e.g. "stripe".'),
  name: z.string(),
  connected: z
    .boolean()
    .describe(
      "Whether the integration is set up in this environment. Triggers can only be added for connected sources.",
    ),
  events: z.array(
    z.object({
      name: z.string().describe("Use as a trigger's `event`."),
      label: z.string(),
    }),
  ),
});

export const ListTriggerSourcesResponseSchema = z.object({
  sources: z.array(TriggerSourceSchema),
});

export class ListTriggerSourcesResponseDto extends createZodDto(
  ListTriggerSourcesResponseSchema,
) {}
