import { UnauthorizedException } from "@nestjs/common";

import type { dbClient } from "@subscriber.dev/db/client";

export function requireMcpUser(rawRequest: { user?: unknown } | undefined) {
  if (!rawRequest?.user) {
    throw new UnauthorizedException(
      "MCP request is missing an authenticated user",
    );
  }

  return rawRequest.user as any;
}

export function requireMcpDb(rawRequest: { db?: unknown } | undefined) {
  if (!rawRequest?.db) {
    throw new UnauthorizedException("MCP request is missing a db client");
  }

  return rawRequest.db as dbClient;
}
