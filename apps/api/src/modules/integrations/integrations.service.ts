import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import type { dbClient } from "@subscriber.dev/db/client";
import * as environmentIntegrationsRepo from "@subscriber.dev/db/repository/environmentIntegrations.repo";

import { encrypt } from "../../common/encryption.js";
import { INTEGRATION_PROVIDERS } from "./providers/index.js";

function toResponse(row: {
  type: string;
  config: Record<string, unknown>;
  updatedAt: Date;
  priority: number;
}) {
  return {
    type: row.type,
    ...row.config,
    priority: row.priority,
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class IntegrationsService {
  async upsert(
    db: dbClient,
    environmentId: number,
    type: string,
    body: Record<string, unknown>,
    updatedBy: number,
  ) {
    const provider = INTEGRATION_PROVIDERS[type];
    if (!provider) {
      throw new NotFoundException(`Unknown integration type: ${type}`);
    }

    const configResult = provider.configSchema.safeParse(body);
    if (!configResult.success) {
      throw new BadRequestException({
        message: "Validation failed",
        errors: configResult.error.issues,
      });
    }

    const secretResult = provider.secretSchema.safeParse(body);
    if (!secretResult.success) {
      throw new BadRequestException({
        message: "Validation failed",
        errors: secretResult.error.issues,
      });
    }

    if (provider.verify) {
      try {
        await provider.verify(configResult.data, secretResult.data);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error
            ? error.message
            : "Failed to verify integration",
        );
      }
    }

    const encryptedSecret = encrypt(JSON.stringify(secretResult.data));

    // Only used if this is a brand new integration type for this
    // environment - appended to the end of the failover order. Reconfiguring
    // an existing integration never changes its position (see
    // upsertIntegration's onConflictDoUpdate).
    const existing = await environmentIntegrationsRepo.listByEnvironment(
      db,
      environmentId,
    );
    const priorities = existing.map((i) => i.priority);
    const priorityIfNew =
      priorities.length > 0 ? Math.max(...priorities) + 1 : 1;

    const row = await environmentIntegrationsRepo.upsertIntegration(
      db,
      environmentId,
      type,
      configResult.data,
      encryptedSecret,
      updatedBy,
      priorityIfNew,
    );

    return toResponse(row);
  }

  async setPrimary(db: dbClient, environmentId: number, type: string) {
    const row = await environmentIntegrationsRepo.setPrimary(
      db,
      environmentId,
      type,
    );
    if (!row) throw new NotFoundException("Integration not configured");

    return toResponse(row);
  }

  async get(db: dbClient, environmentId: number, type: string) {
    const row = await environmentIntegrationsRepo.getByEnvironmentAndType(
      db,
      environmentId,
      type,
    );
    if (!row) throw new NotFoundException("Integration not configured");

    return toResponse(row);
  }

  async list(db: dbClient, environmentId: number) {
    const rows = await environmentIntegrationsRepo.listByEnvironment(
      db,
      environmentId,
    );
    return { integrations: rows.map(toResponse) };
  }

  async delete(db: dbClient, environmentId: number, type: string) {
    const row = await environmentIntegrationsRepo.deleteIntegration(
      db,
      environmentId,
      type,
    );
    if (!row) throw new NotFoundException("Integration not configured");
  }
}
