import { BadRequestException, Injectable } from "@nestjs/common";

import type { EnvironmentForUser } from "@subscriber.dev/db/repository/subscriber.repo";
import { generateUID } from "@subscriber.dev/shared/utils";

import type { UploadResponseDto, VideoResponseDto } from "./dto/upload.dto.js";
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
      "Uploads aren't set up on this server yet. You can still use an image URL.",
    );
  }
}

@Injectable()
export class UploadsService {
  async uploadImage(
    environment: EnvironmentForUser,
    bytes: Uint8Array,
  ): Promise<UploadResponseDto> {
    requireStorage();
    if (bytes.length > MAX_IMAGE_BYTES) {
      throw new BadRequestException("Images can be up to 5 MB");
    }
    const image = await detectImage(bytes);
    if (!image) {
      throw new BadRequestException("Upload a PNG, JPEG, GIF or WebP image");
    }
    const url = await putPublicObject(
      `${environment.publicId}/${generateUID()}.${image.ext}`,
      bytes,
      image.type,
    );
    return { url };
  }

  async addVideo(
    environment: EnvironmentForUser,
    url: string,
  ): Promise<VideoResponseDto> {
    requireStorage();
    try {
      const video = await resolveVideo(url);
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
