import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";

import { headersFromRaw, resolveSessionFromHeaders } from "./session.util.js";

@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const headers = headersFromRaw(request.headers);
    const { user, db, auth } = await resolveSessionFromHeaders(headers);

    request.user = user;
    request.db = db;
    request.auth = auth;

    return true;
  }
}
