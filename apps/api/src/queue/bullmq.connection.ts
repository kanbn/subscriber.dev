import { Redis } from "ioredis";

let connection: Redis | undefined;

export function getRedisConnection(): Redis {
  if (!connection) {
    connection = new Redis({
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
    });
  }
  return connection;
}
