import { beforeEach, describe, expect, it, vi } from "vitest";

import * as environmentIntegrationsRepo from "@subscriber.dev/db/repository/environmentIntegrations.repo";
import * as inboundEventRepo from "@subscriber.dev/db/repository/inboundEvent.repo";

import { InvalidWebhookError } from "../inboundSource.js";
import { InboundWebhookController } from "../inboundWebhook.controller.js";
import { fakeSource } from "./fakeSource.js";

vi.mock("../sources/index.js", async () => ({
  INBOUND_SOURCES: { fake: (await import("./fakeSource.js")).fakeSource },
}));
vi.mock("@subscriber.dev/db/client", () => ({
  createDrizzleClient: vi.fn().mockReturnValue({}),
}));
vi.mock("@subscriber.dev/db/repository/environmentIntegrations.repo", () => ({
  getByWebhookToken: vi.fn(),
}));
vi.mock("@subscriber.dev/db/repository/inboundEvent.repo", () => ({
  recordInboundEvent: vi.fn(),
}));
vi.mock("../../../common/encryption.js", () => ({
  decrypt: vi.fn((blob: string) => blob),
}));

const mockQueue = { add: vi.fn() };
let controller: InboundWebhookController;

const rawBody = Buffer.from('{"id":"evt_1"}');
const request = { rawBody, headers: { "x-signature": "sig" } } as any;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(environmentIntegrationsRepo.getByWebhookToken).mockResolvedValue({
    environmentId: 10,
    encryptedSecret: JSON.stringify({ webhookSecret: "s" }),
  } as any);
  controller = new InboundWebhookController(mockQueue as any);
});

describe("receive", () => {
  it("404s for an unknown source or token", async () => {
    await expect(controller.receive("nope", "tok", request)).rejects.toThrow(
      "Unknown webhook",
    );
    vi.mocked(environmentIntegrationsRepo.getByWebhookToken).mockResolvedValue(
      undefined,
    );
    await expect(controller.receive("fake", "tok", request)).rejects.toThrow(
      "Unknown webhook",
    );
  });

  it("turns an invalid webhook into a 400 without recording it", async () => {
    fakeSource.verifyWebhook.mockImplementation(() => {
      throw new InvalidWebhookError("Invalid signature");
    });

    await expect(controller.receive("fake", "tok", request)).rejects.toThrow(
      "Invalid signature",
    );
    expect(inboundEventRepo.recordInboundEvent).not.toHaveBeenCalled();
  });

  it("verifies with the source, records the event under that source and queues it", async () => {
    fakeSource.verifyWebhook.mockReturnValue({
      externalEventId: "evt_1",
      type: "user.created",
      payload: { id: "evt_1" },
    });
    vi.mocked(inboundEventRepo.recordInboundEvent).mockResolvedValue({
      id: 99,
      status: "received",
    });

    await expect(controller.receive("fake", "tok", request)).resolves.toEqual({
      received: true,
    });

    expect(environmentIntegrationsRepo.getByWebhookToken).toHaveBeenCalledWith(
      {},
      "fake",
      "tok",
    );
    expect(fakeSource.verifyWebhook).toHaveBeenCalledWith({
      rawBody,
      headers: request.headers,
      secret: { webhookSecret: "s" },
    });
    expect(inboundEventRepo.recordInboundEvent).toHaveBeenCalledWith(
      {},
      {
        environmentId: 10,
        source: "fake",
        externalEventId: "evt_1",
        type: "user.created",
        payload: { id: "evt_1" },
      },
    );
    expect(mockQueue.add).toHaveBeenCalledWith(
      "process-event",
      { inboundEventId: 99 },
      expect.objectContaining({ jobId: "inbound-event-99" }),
    );
  });

  it("acknowledges a redelivered event that's already been handled without queuing it again", async () => {
    fakeSource.verifyWebhook.mockReturnValue({
      externalEventId: "evt_1",
      type: "user.created",
      payload: {},
    });
    vi.mocked(inboundEventRepo.recordInboundEvent).mockResolvedValue({
      id: 99,
      status: "processed",
    });

    await expect(controller.receive("fake", "tok", request)).resolves.toEqual({
      received: true,
    });
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it("queues a redelivered event again while it's still unprocessed, in case the first queueing failed", async () => {
    fakeSource.verifyWebhook.mockReturnValue({
      externalEventId: "evt_1",
      type: "user.created",
      payload: {},
    });
    vi.mocked(inboundEventRepo.recordInboundEvent).mockResolvedValue({
      id: 99,
      status: "received",
    });

    await controller.receive("fake", "tok", request);

    expect(mockQueue.add).toHaveBeenCalledWith(
      "process-event",
      { inboundEventId: 99 },
      expect.objectContaining({ jobId: "inbound-event-99" }),
    );
  });
});
