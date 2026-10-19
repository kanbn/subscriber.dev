import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { EnvironmentKeyScope } from "@subscriber.dev/shared/environmentKeys";
import * as environmentKeyRepo from "@subscriber.dev/db/repository/environmentKey.repo";

import type { AuthenticatedRequest } from "../interfaces/request.interface.js";
import type { User } from "../interfaces/user.interface.js";
import {
  ANY_SCOPE,
  hashEnvironmentKey,
  isEnvironmentKey,
  REQUIRED_SCOPE,
} from "../environmentKey.js";
import {
  getAuth,
  headersFromRaw,
  resolveSessionFromHeaders,
} from "./session.util.js";

const LAST_USED_PRECISION_MS = 60_000;

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const apiKey = request.headers["x-api-key"];
    if (isEnvironmentKey(apiKey)) {
      const { db, auth } = getAuth();
      const key = await environmentKeyRepo.getEnvironmentKeyByHash(
        db,
        hashEnvironmentKey(apiKey),
      );
      if (!key) throw new UnauthorizedException("Invalid API key");

      const scope = this.reflector.getAllAndOverride<
        EnvironmentKeyScope | typeof ANY_SCOPE | undefined
      >(REQUIRED_SCOPE, [context.getHandler(), context.getClass()]);
      if (!scope) {
        throw new ForbiddenException(
          "API keys can't call this endpoint. Sign in instead.",
        );
      }
      if (scope !== ANY_SCOPE && !key.scopes.includes(scope)) {
        throw new ForbiddenException(
          `This API key doesn't have the ${scope} scope.`,
        );
      }

      if (
        !key.lastUsedAt ||
        Date.now() - key.lastUsedAt.getTime() > LAST_USED_PRECISION_MS
      ) {
        void environmentKeyRepo
          .markEnvironmentKeyUsed(
            db,
            key.id,
            new Date(Date.now() - LAST_USED_PRECISION_MS),
          )
          .catch(() => undefined);
      }

      request.user = null;
      request.environmentKey = key;
      request.db = db;
      request.auth = auth;
      return true;
    }

    const headers = headersFromRaw(request.headers);
    const { user, db, auth } = await resolveSessionFromHeaders(headers);

    request.user = user as unknown as User;
    request.db = db;
    request.auth = auth;

    return true;
  }
}
