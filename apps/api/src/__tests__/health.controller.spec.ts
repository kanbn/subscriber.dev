import { afterEach, describe, expect, it, vi } from "vitest";

import { HealthController } from "../health.controller.js";
import { getRedisConnection } from "../queue/bullmq.connection.js";

vi.mock("@subscriber.dev/db/client", () => ({
  createDrizzleClient: () => ({ execute: () => Promise.resolve([]) }),
}));

vi.mock("../queue/bullmq.connection.js", () => ({
  getRedisConnection: vi.fn(),
}));

function response() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("HealthController", () => {
  it("returns 200 when the database and Redis respond", async () => {
    vi.mocked(getRedisConnection).mockReturnValue({
      ping: () => Promise.resolve("PONG"),
    } as never);
    const res = response();

    await new HealthController().health(res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      status: "ok",
      database: "ok",
      redis: "ok",
    });
  });

  it("returns 503 instead of hanging when Redis doesn't answer", async () => {
    vi.useFakeTimers();
    vi.mocked(getRedisConnection).mockReturnValue({
      ping: () => new Promise(() => undefined),
    } as never);
    const res = response();

    const pending = new HealthController().health(res as never);
    await vi.advanceTimersByTimeAsync(3000);
    await pending;

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      status: "down",
      database: "ok",
      redis: "down",
    });
  });
});
