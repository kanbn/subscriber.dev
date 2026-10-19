import type { dbClient } from "@subscriber.dev/db/client";
import type { EnvironmentKeyForRequest } from "@subscriber.dev/db/repository/environmentKey.repo";
import type { EnvironmentForUser } from "@subscriber.dev/db/repository/subscriber.repo";

import type { getAuth } from "../guards/session.util.js";
import type { User } from "./user.interface.js";

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  params?: Record<string, string | undefined>;
  user: User | null;
  db: dbClient;
  auth: ReturnType<typeof getAuth>["auth"];
  environmentKey?: EnvironmentKeyForRequest;
  environment?: EnvironmentForUser;
}
