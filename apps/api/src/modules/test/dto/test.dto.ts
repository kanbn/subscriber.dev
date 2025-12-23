import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const TestRequestSchema = z.object({
  name: z.string().describe('Test name'),
  message: z.string().optional().describe('Optional message'),
});

export const TestResponseSchema = z.object({
  message: z.string(),
  timestamp: z.string(),
  success: z.boolean(),
  echo: TestRequestSchema.optional(),
});

export class TestRequestDto extends createZodDto(TestRequestSchema) {}
export class TestResponseDto extends createZodDto(TestResponseSchema) {}
