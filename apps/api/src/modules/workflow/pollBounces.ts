import type { dbClient } from "@subscriber.dev/db/client";
import * as environmentIntegrationsRepo from "@subscriber.dev/db/repository/environmentIntegrations.repo";

import { decrypt } from "../../common/encryption.js";
import { INTEGRATION_PROVIDERS } from "../integrations/providers/index.js";
import { recordBounceEvents } from "./recordBounceEvents.js";

export async function pollBounces(db: dbClient): Promise<void> {
  const integrations = await environmentIntegrationsRepo.listAll(db);

  for (const integration of integrations) {
    const provider = INTEGRATION_PROVIDERS[integration.type];
    if (!provider?.checkBounces || !integration.encryptedSecret) {
      continue;
    }
    const pollStartedAt = new Date();

    try {
      const config = provider.configSchema.parse(integration.config);
      const secret = provider.secretSchema.parse(
        JSON.parse(decrypt(integration.encryptedSecret)),
      );
      const events = await provider.checkBounces(
        config,
        secret,
        integration.lastBounceCheckAt ?? undefined,
      );

      if (events === null) continue;

      await recordBounceEvents(db, events);

      await environmentIntegrationsRepo.updateLastBounceCheckAt(
        db,
        integration.id,
        pollStartedAt,
      );
    } catch (error) {
      console.error(
        `Bounce poll failed for integration ${integration.id} (${integration.type}):`,
        error,
      );
    }
  }
}
