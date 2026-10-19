import { createHash, randomBytes } from "crypto";
import type { ExecutionContext } from "@nestjs/common";
import { createParamDecorator, SetMetadata } from "@nestjs/common";

import type { EnvironmentKeyForRequest } from "@subscriber.dev/db/repository/environmentKey.repo";
import type { EnvironmentKeyScope } from "@subscriber.dev/shared/environmentKeys";

import type { AuthenticatedRequest } from "./interfaces/request.interface.js";

const PREFIX = "sk_env_";

export const REQUIRED_SCOPE = "environmentKeyScope";

export const RequiresScope = (scope: EnvironmentKeyScope) =>
  SetMetadata(REQUIRED_SCOPE, scope);

export function generateEnvironmentKey() {
  const key = `${PREFIX}${randomBytes(32).toString("base64url")}`;
  return { key, keyHash: hashEnvironmentKey(key), start: key.slice(0, 12) };
}

export function hashEnvironmentKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export function isEnvironmentKey(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export const CurrentEnvironmentKey = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): EnvironmentKeyForRequest | null =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().environmentKey ??
    null,
);
