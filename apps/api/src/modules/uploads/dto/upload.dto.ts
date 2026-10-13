import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const UploadResponseSchema = z.object({
  url: z.string().describe("Public URL of the uploaded image."),
});

export const VideoInputSchema = z.object({
  url: z.string().describe("A YouTube, Vimeo or Loom link."),
});

export const VideoResponseSchema = z.object({
  src: z
    .string()
    .describe("Public URL of the video's thumbnail, with a play button."),
  href: z.string().describe("Link to the video."),
  title: z.string().describe("The video's title, for the image's alt text."),
});

export class UploadResponseDto extends createZodDto(UploadResponseSchema) {}
export class VideoInputDto extends createZodDto(VideoInputSchema) {}
export class VideoResponseDto extends createZodDto(VideoResponseSchema) {}
