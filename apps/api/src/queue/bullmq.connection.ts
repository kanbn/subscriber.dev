import { Redis } from "ioredis";

let connection: Redis | undefined;

export function getRedisConnection(): Redis {
  if (!connection) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error("REDIS_URL environment variable is not set");
    }
    connection = new Redis(url, { maxRetriesPerRequest: null });
  }
  return connection;
}
