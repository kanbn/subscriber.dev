import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const AddTagSchema = z.object({
  tag: z.string().min(1).max(100),
});

export const TagResponseSchema = z.object({
  tag: z.string(),
});

export const ListTagsResponseSchema = z.object({
  tags: z.array(z.string()),
});

export class AddTagDto extends createZodDto(AddTagSchema) {}
export class TagResponseDto extends createZodDto(TagResponseSchema) {}
export class ListTagsResponseDto extends createZodDto(ListTagsResponseSchema) {}
