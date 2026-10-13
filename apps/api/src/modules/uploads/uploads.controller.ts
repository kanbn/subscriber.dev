import { generateUID } from "@subscriber.dev/shared/utils";
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";

import type { EnvironmentForUser } from "@subscriber.dev/db/repository/subscriber.repo";

import { CurrentEnvironment } from "../../common/decorators/current-environment.decorator.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { EnvironmentAccessGuard } from "../../common/guards/environment-access.guard.js";
import {
  UploadResponseDto,
  VideoInputDto,
  VideoResponseDto,
} from "./dto/upload.dto.js";
import {
  detectImage,
  MAX_IMAGE_BYTES,
  putPublicObject,
  storageConfigured,
} from "./storage.js";
import { resolveVideo, thumbnailWithPlayButton } from "./video.js";

function requireStorage() {
  if (!storageConfigured()) {
    throw new BadRequestException(
      "Uploads aren't set up on this server yet. You can still paste an image URL.",
    );
  }
}

@ApiTags("Uploads")
@ApiBearerAuth("bearer")
@ApiSecurity("api-key")
@Controller("environments/:environmentId/uploads")
@UseGuards(AuthGuard, EnvironmentAccessGuard)
export class UploadsController {
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
    }),
  )
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: { file: { type: "string", format: "binary" } },
      required: ["file"],
    },
  })
  @ApiOperation({
    operationId: "uploadImage",
    summary: "Upload an image for your emails",
    description:
      "Uploads a PNG, JPEG, GIF or WebP image (up to 5 MB) and returns its public URL to use in an email.",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiResponse({ status: 201, type: UploadResponseDto })
  @ApiResponse({ status: 400, description: "Not an image, or too large" })
  async upload(
    @CurrentEnvironment() environment: EnvironmentForUser,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ): Promise<UploadResponseDto> {
    requireStorage();
    if (!file) throw new BadRequestException("Attach an image as `file`");
    const image = await detectImage(file.buffer);
    if (!image) {
      throw new BadRequestException("Upload a PNG, JPEG, GIF or WebP image");
    }
    const url = await putPublicObject(
      `${environment.publicId}/${generateUID()}.${image.ext}`,
      file.buffer,
      image.type,
    );
    return { url };
  }

  @Post("video")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "uploadVideoThumbnail",
    summary: "Turn a video link into a thumbnail",
    description:
      "Email clients can't play video, so emails show a thumbnail with a play button that links to the video. Give a YouTube, Vimeo or Loom link and this stores the thumbnail and returns what to put in the email.",
  })
  @ApiParam({ name: "environmentId", type: "string" })
  @ApiResponse({ status: 201, type: VideoResponseDto })
  @ApiResponse({ status: 400, description: "Not a supported video link" })
  async video(
    @CurrentEnvironment() environment: EnvironmentForUser,
    @Body() input: VideoInputDto,
  ): Promise<VideoResponseDto> {
    requireStorage();
    try {
      const video = await resolveVideo(input.url);
      const thumbnail = await thumbnailWithPlayButton(video.thumbnailUrl);
      const src = await putPublicObject(
        `${environment.publicId}/${generateUID()}.jpg`,
        thumbnail,
        "image/jpeg",
      );
      return { src, href: video.href, title: video.title };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Couldn't add that video",
      );
    }
  }
}
