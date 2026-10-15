import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const UpdateWorkspaceSchema = z.object({
  postalAddress: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .transform((value) => (value === "" ? null : value))
    .describe(
      "The business's physical postal address, shown in every email's footer. Shown on one line; line breaks become commas. Send null or an empty string to remove it.",
    ),
});

export class UpdateWorkspaceDto extends createZodDto(UpdateWorkspaceSchema) {}
