import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

import { initAuth } from "@subscriber.dev/auth/server";
import { createDrizzleClient } from "@subscriber.dev/db/client";

@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Convert Express headers to Web API Headers
    const headers = new Headers();
    for (const [key, value] of Object.entries(
      request.headers as Record<string, string | string[] | undefined>,
    )) {
      if (value) {
        if (Array.isArray(value)) {
          value.forEach((v: string) => headers.append(key, v));
        } else {
          headers.set(key, value);
        }
      }
    }

    const db = createDrizzleClient();
    const baseAuth = initAuth(db);
    const auth = {
      api: {
        getSession: () => baseAuth.api.getSession({ headers }),
      },
    };

    const session = await auth.api.getSession();

    if (!session?.user) {
      throw new UnauthorizedException("User not authenticated");
    }

    request.user = session.user;
    request.db = db;
    request.auth = auth;
    request.headers = headers;

    return true;
  }
}
