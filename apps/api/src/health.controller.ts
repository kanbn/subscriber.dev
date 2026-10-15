import type { Response } from "express";
import { Controller, Get, Res } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { sql } from "drizzle-orm";

import { createDrizzleClient } from "@subscriber.dev/db/client";

import { getRedisConnection } from "./queue/bullmq.connection.js";

const TIMEOUT_MS = 3000;

async function check(probe: () => Promise<unknown>): Promise<"ok" | "down"> {
  try {
    await Promise.race([
      probe(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS),
      ),
    ]);
    return "ok";
  } catch {
    return "down";
  }
}

@ApiExcludeController()
@SkipThrottle({ ip: true, credential: true })
@Controller("health")
export class HealthController {
  @Get()
  async health(@Res() res: Response) {
    const [database, redis] = await Promise.all([
      check(() => createDrizzleClient().execute(sql`select 1`)),
      check(() => getRedisConnection().ping()),
    ]);
    const ok = database === "ok" && redis === "ok";
    res.status(ok ? 200 : 503).json({
      status: ok ? "ok" : "down",
      database,
      redis,
    });
  }
}
