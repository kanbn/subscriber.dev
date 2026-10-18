import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import type { dbClient } from "@subscriber.dev/db/client";
import * as environmentIntegrationsRepo from "@subscriber.dev/db/repository/environmentIntegrations.repo";
import * as workflowRepo from "@subscriber.dev/db/repository/workflow.repo";

import { decrypt, encrypt } from "../../common/encryption.js";
import { INBOUND_SOURCES } from "../inbound/sources/index.js";
import { CONFIGURABLE_INTEGRATIONS } from "./providers/index.js";

function toResponse(row: {
  type: string;
  config: Record<string, unknown>;
  updatedAt: Date;
  priority: number;
}) {
  return {
    type: row.type,
    ...row.config,
    ...CONFIGURABLE_INTEGRATIONS[row.type]?.describe?.(row.config),
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
    updatedBy: number | null,
  ) {
    const provider = CONFIGURABLE_INTEGRATIONS[type];
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

    const current = await environmentIntegrationsRepo.getByEnvironmentAndType(
      db,
      environmentId,
      type,
    );
    const config = provider.prepareConfig
      ? provider.prepareConfig(configResult.data, current?.config)
      : configResult.data;
    const storedSecret = current?.encryptedSecret
      ? (JSON.parse(decrypt(current.encryptedSecret)) as Record<
          string,
          unknown
        >)
      : {};
    const secretResult = provider.secretSchema.safeParse({
      ...storedSecret,
      ...body,
    });
    if (!secretResult.success) {
      throw new BadRequestException({
        message: "Validation failed",
        errors: secretResult.error.issues,
      });
    }

    if (provider.verify) {
      try {
        await provider.verify(config, secretResult.data);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error
            ? error.message
            : "Failed to verify integration",
        );
      }
    }

    const encryptedSecret = encrypt(JSON.stringify(secretResult.data));

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
      config,
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

    if (!INBOUND_SOURCES[type]) return toResponse(row);
    return {
      ...toResponse(row),
      triggerCount: await workflowRepo.countTriggersForSource(
        db,
        environmentId,
        type,
      ),
    };
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
