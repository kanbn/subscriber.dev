import type { Request, Response } from "express";
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

import { verifyMcpAccessToken } from "@subscriber.dev/auth/server";

import {
  getAuth,
  headersFromRaw,
  resolveSessionFromHeaders,
} from "../../common/guards/session.util.js";
import { protectedResourceMetadataUrl } from "./oauth-metadata.controller.js";

@Injectable()
export class McpAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & Record<string, unknown>>();
    const headers = headersFromRaw(request.headers);

    try {
      const { user, db, auth } = await resolveSessionFromHeaders(headers);
      Object.assign(request, { user, db, auth });
      return true;
    } catch (error) {
      if (!(error instanceof UnauthorizedException)) throw error;
    }

    const token = headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (token) {
      const { db, auth } = getAuth();
      const user = await verifyMcpAccessToken(auth, token).catch(() => null);
      if (user) {
        Object.assign(request, { user, db, auth });
        return true;
      }
    }

    context
      .switchToHttp()
      .getResponse<Response>()
      .setHeader(
        "WWW-Authenticate",
        `Bearer resource_metadata="${protectedResourceMetadataUrl(request)}"`,
      );
    throw new UnauthorizedException("User not authenticated");
  }
}
