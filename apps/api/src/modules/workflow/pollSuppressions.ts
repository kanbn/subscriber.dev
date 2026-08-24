import type { dbClient } from "@subscriber.dev/db/client";
import * as environmentIntegrationsRepo from "@subscriber.dev/db/repository/environmentIntegrations.repo";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";

import { decrypt } from "../../common/encryption.js";
import { INTEGRATION_PROVIDERS } from "../integrations/providers/index.js";

export async function pollSuppressions(db: dbClient): Promise<void> {
  const integrations = await environmentIntegrationsRepo.listAll(db);

  for (const integration of integrations) {
    const provider = INTEGRATION_PROVIDERS[integration.type];
    if (!provider?.checkBounces || !integration.encryptedSecret) continue;

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

      for (const event of events) {
        const subscriber = await subscriberRepo.getSubscriberByEmail(
          db,
          integration.environmentId,
          event.email,
        );
        if (!subscriber) continue;

        const preferences = await subscriberRepo.getLatestPreferences(
          db,
          subscriber.id,
        );
        if (preferences && !preferences.email) continue;

        await subscriberRepo.createSubscriberPreferences(db, {
          subscriberId: subscriber.id,
          email: false,
        });
      }

      if (events.length > 0) {
        const latest = events.reduce(
          (max, event) => (event.occurredAt > max ? event.occurredAt : max),
          events[0]!.occurredAt,
        );
        await environmentIntegrationsRepo.updateLastBounceCheckAt(
          db,
          integration.id,
          latest,
        );
      }
    } catch (error) {
      console.error(
        `Suppression poll failed for integration ${integration.id} (${integration.type}):`,
        error,
      );
    }
  }
}
