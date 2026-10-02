import { describe, expect, it, vi } from "vitest";

import * as environmentIntegrationsRepo from "@subscriber.dev/db/repository/environmentIntegrations.repo";

import { InboundService } from "../inbound.service.js";

vi.mock("../sources/index.js", async () => ({
  INBOUND_SOURCES: { fake: (await import("./fakeSource.js")).fakeSource },
}));
vi.mock("@subscriber.dev/db/repository/environmentIntegrations.repo", () => ({
  listByEnvironment: vi.fn(),
}));

describe("listTriggerSources", () => {
  it("lists every source with its events, and whether it's connected", async () => {
    vi.mocked(environmentIntegrationsRepo.listByEnvironment).mockResolvedValue([
      { type: "fake", encryptedSecret: "x" },
    ] as any);

    await expect(
      new InboundService().listTriggerSources({} as any, 10),
    ).resolves.toEqual({
      sources: [
        {
          source: "fake",
          name: "Fake",
          connected: true,
          events: [{ name: "signed_up", label: "Signed up" }],
        },
      ],
    });
  });

  it("reports a source that isn't set up as not connected", async () => {
    vi.mocked(environmentIntegrationsRepo.listByEnvironment).mockResolvedValue([
      { type: "cloudflare", encryptedSecret: "x" },
    ] as any);

    const { sources } = await new InboundService().listTriggerSources(
      {} as any,
      10,
    );

    expect(sources[0]?.connected).toBe(false);
  });
});
