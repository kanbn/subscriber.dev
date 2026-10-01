import { Injectable } from "@nestjs/common";

import type { dbClient } from "@subscriber.dev/db/client";
import * as environmentIntegrationsRepo from "@subscriber.dev/db/repository/environmentIntegrations.repo";

import { INBOUND_SOURCES } from "./sources/index.js";

@Injectable()
export class InboundService {
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
