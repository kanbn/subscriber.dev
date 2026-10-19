import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";

import type { AuthenticatedRequest } from "../interfaces/request.interface.js";

export const ENVIRONMENT_HEADER = "x-environment-id";

@Injectable()
export class EnvironmentAccessGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const header = request.headers[ENVIRONMENT_HEADER];
    const environmentId = Array.isArray(header) ? header[0] : header;

    const key = request.environmentKey;
    if (key) {
      if (environmentId && environmentId !== key.environment.publicId) {
        throw new NotFoundException("Environment not found");
      }
      request.environment = key.environment;
      return true;
    }

    if (!environmentId) {
      throw new BadRequestException(
        `Pass the environment's ID in the ${ENVIRONMENT_HEADER} header`,
      );
    }
    const environment =
      request.user &&
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
