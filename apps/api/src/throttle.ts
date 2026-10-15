import type {
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from "@nestjs/throttler";
import type { Redis } from "ioredis";
import { seconds } from "@nestjs/throttler";

import { getRedisConnection } from "./queue/bullmq.connection.js";

interface TrackedRequest {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

function header(req: TrackedRequest, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function clientIp(req: TrackedRequest): string {
  return header(req, "cf-connecting-ip") ?? req.ip ?? "unknown";
}

export function credential(req: TrackedRequest): string | undefined {
  return (
    header(req, "x-api-key") ??
    header(req, "authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]
  );
}

export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    _blockDuration: number,
    throttlerName: string,
  ): ReturnType<ThrottlerStorage["increment"]> {
    if (this.redis.status !== "ready") {
      return {
        totalHits: 0,
        timeToExpire: 0,
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
    const redisKey = `throttle:${throttlerName}:${key}`;
    const results = await this.redis
      .multi()
      .incr(redisKey)
      .pexpire(redisKey, ttl, "NX")
      .pttl(redisKey)
      .exec();
    const totalHits = Number(results?.[0]?.[1] ?? 0);
    const timeToExpire = Math.ceil(
      Math.max(Number(results?.[2]?.[1]), 0) / 1000,
    );
    const isBlocked = totalHits > limit;
    return {
      totalHits,
      timeToExpire,
      isBlocked,
      timeToBlockExpire: isBlocked ? timeToExpire : 0,
    };
  }
}

export const throttlerOptions = (): ThrottlerModuleOptions => ({
  storage: new RedisThrottlerStorage(getRedisConnection()),
  errorMessage: "Too many requests. Slow down and try again in a second.",
  throttlers: [
    {
      name: "ip",
      ttl: seconds(1),
      limit: 20,
      getTracker: (req) => clientIp(req as TrackedRequest),
    },
    {
      name: "credential",
      ttl: seconds(1),
      limit: 10,
      getTracker: (req) => credential(req as TrackedRequest) ?? "",
      skipIf: (context) =>
        !credential(context.switchToHttp().getRequest<TrackedRequest>()),
    },
  ],
});
