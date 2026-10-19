import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";

import type { AuthenticatedRequest } from "../interfaces/request.interface.js";

@Injectable()
export class EnvironmentAccessGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const environmentId = request.params?.environmentId;
    if (!environmentId) {
      throw new NotFoundException("Environment not found");
    }

    const key = request.environmentKey;
    const environment = key
      ? key.environment.publicId === environmentId
        ? key.environment
        : undefined
      : request.user &&
        (await subscriberRepo.getEnvironmentForUser(
          request.db,
          request.user.id,
          environmentId,
        ));
    if (!environment) {
      throw new NotFoundException("Environment not found");
    }

    request.environment = environment;
    return true;
  }
}
