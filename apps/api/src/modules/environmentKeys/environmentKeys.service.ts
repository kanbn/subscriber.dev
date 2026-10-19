import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import type { dbClient } from "@subscriber.dev/db/client";
import type { EnvironmentKeyForRequest } from "@subscriber.dev/db/repository/environmentKey.repo";
import * as environmentKeyRepo from "@subscriber.dev/db/repository/environmentKey.repo";
import { ENVIRONMENT_KEY_PRESETS } from "@subscriber.dev/shared/environmentKeys";

import type { CreateEnvironmentKeyDto } from "./dto/environmentKey.dto.js";
import { generateEnvironmentKey } from "../../common/environmentKey.js";

const serialize = ({
  publicId,
  name,
  start,
  scopes,
  lastUsedAt,
  createdAt,
}: Awaited<
  ReturnType<typeof environmentKeyRepo.listEnvironmentKeys>
>[number]) => ({
  publicId,
  name,
  start,
  scopes,
  lastUsedAt: lastUsedAt?.toISOString() ?? null,
  createdAt: createdAt.toISOString(),
});

@Injectable()
export class EnvironmentKeysService {
  async create(
    db: dbClient,
    environmentId: number,
    input: CreateEnvironmentKeyDto,
    userId: number,
  ) {
    if (input.access && input.scopes) {
      throw new BadRequestException("Pass access or scopes, not both");
    }
    const { key, keyHash, start } = generateEnvironmentKey();
    const created = await environmentKeyRepo.createEnvironmentKey(db, {
      environmentId,
      name: input.name,
      keyHash,
      start,
      scopes: input.scopes ?? [
        ...ENVIRONMENT_KEY_PRESETS[input.access ?? "limited"],
      ],
      createdBy: userId,
    });
    return { ...serialize(created), key };
  }

  async list(db: dbClient, environmentId: number) {
    const keys = await environmentKeyRepo.listEnvironmentKeys(
      db,
      environmentId,
    );
    return { keys: keys.map(serialize) };
  }

  async revoke(db: dbClient, environmentId: number, publicId: string) {
    const deleted = await environmentKeyRepo.deleteEnvironmentKey(
      db,
      environmentId,
      publicId,
    );
    if (!deleted) throw new NotFoundException("API key not found");
  }

  current(key: EnvironmentKeyForRequest) {
    return {
      publicId: key.publicId,
      name: key.name,
      start: key.start,
      scopes: key.scopes,
      workspaceId: key.workspacePublicId,
      environment: {
        publicId: key.environment.publicId,
        name: key.environment.name,
        slug: key.environment.slug,
      },
    };
  }
}
