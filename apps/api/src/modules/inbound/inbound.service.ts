import { Injectable } from "@nestjs/common";

import type { dbClient } from "@subscriber.dev/db/client";
import * as environmentIntegrationsRepo from "@subscriber.dev/db/repository/environmentIntegrations.repo";
import * as inboundEventRepo from "@subscriber.dev/db/repository/inboundEvent.repo";

import { INBOUND_SOURCES } from "./sources/index.js";

@Injectable()
export class InboundService {
  async listEvents(
    db: dbClient,
    environmentId: number,
    opts: { source?: string; limit: number; offset: number },
  ) {
    const rows = await inboundEventRepo.listInboundEvents(
      db,
      environmentId,
      opts,
    );
    return {
      events: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        processedAt: row.processedAt?.toISOString() ?? null,
      })),
      limit: opts.limit,
      offset: opts.offset,
    };
  }

  async listTriggerSources(db: dbClient, environmentId: number) {
    const integrations = await environmentIntegrationsRepo.listByEnvironment(
      db,
      environmentId,
    );
    return {
      sources: Object.values(INBOUND_SOURCES).map((source) => ({
        source: source.source,
        name: source.name,
        connected: integrations.some(
          (i) => i.type === source.source && Boolean(i.encryptedSecret),
        ),
        events: source.events.map((e) => ({ name: e.name, label: e.label })),
      })),
    };
  }
}
