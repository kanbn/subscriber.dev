import type { dbClient } from "@subscriber.dev/db/client";
import * as workflowRunRepo from "@subscriber.dev/db/repository/workflowRun.repo";

import type { BounceEvent } from "../integrations/providers/types.js";
import { recordBounce } from "./recordBounce.js";

export async function recordBounceEvents(
  db: dbClient,
  events: BounceEvent[],
): Promise<void> {
  for (const event of events) {
    const runStep = await workflowRunRepo.getRunStepByProviderMessageId(
      db,
      event.providerMessageId,
    );
    if (!runStep) continue;
    await recordBounce(db, {
      runStepId: runStep.id,
      bounceType: event.bounceType,
      reason: event.reason,
    });
  }
}
