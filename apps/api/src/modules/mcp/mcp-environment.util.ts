import { NotFoundException } from "@nestjs/common";

import type { createDrizzleClient } from "@subscriber.dev/db/client";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";

export async function requireEnvironment(
  db: ReturnType<typeof createDrizzleClient>,
  userId: number,
  environmentId: string,
) {
  const environment = await subscriberRepo.getEnvironmentForUser(
    db,
    userId,
    environmentId,
  );
  if (!environment) {
    throw new NotFoundException("Environment not found");
  }
  return environment;
}
