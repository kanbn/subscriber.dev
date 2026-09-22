import { createParamDecorator, ExecutionContext } from "@nestjs/common";

import type { EnvironmentForUser } from "@subscriber.dev/db/repository/subscriber.repo";

export const CurrentEnvironment = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): EnvironmentForUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.environment;
  },
);
