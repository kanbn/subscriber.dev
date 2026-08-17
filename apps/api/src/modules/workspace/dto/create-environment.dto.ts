import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const CreateEnvironmentSchema = z.object({
  name: z.string().min(1).max(255),
});

export class CreateEnvironmentDto extends createZodDto(
  CreateEnvironmentSchema,
) {}
