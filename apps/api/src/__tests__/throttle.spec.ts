import type { Redis } from "ioredis";
import { describe, expect, it } from "vitest";

import { clientIp, credential, RedisThrottlerStorage } from "../throttle.js";

describe("clientIp", () => {
  it("prefers Cloudflare's client IP over the proxy's", () => {
    expect(
      clientIp({
        ip: "172.18.0.2",
        headers: { "cf-connecting-ip": "1.2.3.4" },
      }),
    ).toBe("1.2.3.4");
    expect(clientIp({ ip: "1.2.3.4", headers: {} })).toBe("1.2.3.4");
  });
});

describe("credential", () => {
  it("reads an API key or a bearer token, and nothing otherwise", () => {
    expect(credential({ headers: { "x-api-key": "key" } })).toBe("key");
    expect(credential({ headers: { authorization: "Bearer tok" } })).toBe(
      "tok",
    );
    expect(credential({ headers: { authorization: "Basic abc" } })).toBe(
      undefined,
    );
    expect(credential({ headers: {} })).toBe(undefined);
  });
});

describe("RedisThrottlerStorage", () => {
  function redis(status: string, hits: number, pttl: number) {
    const multi = {
      incr: () => multi,
      pexpire: () => multi,
      pttl: () => multi,
      exec: () =>
        Promise.resolve([
          [null, hits],
          [null, 1],
          [null, pttl],
        ]),
    };
    return { status, multi: () => multi } as unknown as Redis;
  }

  it("blocks once the window's hits pass the limit", async () => {
    const storage = new RedisThrottlerStorage(redis("ready", 11, 400));
    await expect(
      storage.increment("k", 1000, 10, 1000, "credential"),
    ).resolves.toEqual({
      totalHits: 11,
      timeToExpire: 1,
      isBlocked: true,
      timeToBlockExpire: 1,
    });
  });

  it("lets requests through when Redis isn't connected", async () => {
    const storage = new RedisThrottlerStorage(redis("reconnecting", 0, 0));
    const record = await storage.increment("k", 1000, 20, 1000, "ip");
    expect(record.isBlocked).toBe(false);
  });
});
