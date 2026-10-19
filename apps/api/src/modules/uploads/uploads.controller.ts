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
import { RequiresScope } from "../../common/environmentKey.js";
import { AuthGuard } from "../../common/guards/auth.guard.js";
import { EnvironmentAccessGuard } from "../../common/guards/environment-access.guard.js";
import {
  UploadResponseDto,
  VideoInputDto,
  VideoResponseDto,
} from "./dto/upload.dto.js";
import { MAX_IMAGE_BYTES } from "./storage.js";
import { UploadsService } from "./uploads.service.js";

@ApiTags("Uploads")
@ApiBearerAuth("bearer")
@ApiSecurity("api-key")
@Controller("environments/:environmentId/uploads")
@UseGuards(AuthGuard, EnvironmentAccessGuard)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @RequiresScope("uploads:write")
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
    if (!file) throw new BadRequestException("Attach an image as `file`");
    return this.uploadsService.uploadImage(environment, file.buffer);
  }

  @Post("video")
  @RequiresScope("uploads:write")
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
    return this.uploadsService.addVideo(environment, input.url);
  }
}
