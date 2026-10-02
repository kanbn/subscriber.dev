import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as environmentIntegrationsRepo from "@subscriber.dev/db/repository/environmentIntegrations.repo";
import * as inboundEventRepo from "@subscriber.dev/db/repository/inboundEvent.repo";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";
import * as workflowRepo from "@subscriber.dev/db/repository/workflow.repo";

import { InboundEventsProcessor } from "../inboundEvents.processor.js";
import { fakeSource } from "./fakeSource.js";

vi.mock("../sources/index.js", async () => ({
  INBOUND_SOURCES: { fake: (await import("./fakeSource.js")).fakeSource },
}));
vi.mock("@subscriber.dev/db/client", () => ({
  createDrizzleClient: vi.fn().mockReturnValue({}),
}));
vi.mock("@subscriber.dev/db/repository/environmentIntegrations.repo", () => ({
  getByEnvironmentAndType: vi.fn(),
}));
vi.mock("@subscriber.dev/db/repository/inboundEvent.repo", () => ({
  getInboundEventById: vi.fn(),
  completeInboundEvent: vi.fn(),
  getSubscriberByIdentity: vi.fn(),
  linkSubscriberIdentity: vi.fn(),
}));
vi.mock("@subscriber.dev/db/repository/subscriber.repo", () => ({
  getSubscriberByExternalId: vi.fn(),
  getSubscriberByEmail: vi.fn(),
}));
vi.mock("@subscriber.dev/db/repository/workflow.repo", () => ({
  listWorkflowsTriggeredBy: vi.fn(),
}));
vi.mock("../../../common/encryption.js", () => ({
  decrypt: vi.fn((blob: string) => blob),
}));

const workflowService = { triggerWorkflow: vi.fn() };
const subscriberService = { createSubscriber: vi.fn() };
let processor: InboundEventsProcessor;

const subscriber = { id: 7, publicId: "sub_7" };
const row = {
  id: 1,
  environmentId: 10,
  source: "fake",
  externalEventId: "evt_1",
  type: "user.created",
  payload: { user: "u_1" },
  status: "received",
};
const job = { data: { inboundEventId: 1 } } as any;

// Connects the fake source, with these workflows triggered by the event.
function setup(workflows: { id: number; key: string }[]) {
  vi.mocked(
    environmentIntegrationsRepo.getByEnvironmentAndType,
  ).mockResolvedValue({
    config: {},
    encryptedSecret: JSON.stringify({ key: "k" }),
  } as any);
  vi.mocked(workflowRepo.listWorkflowsTriggeredBy).mockResolvedValue(workflows);
}

const welcome = { id: 21, key: "welcome" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(inboundEventRepo.getInboundEventById).mockResolvedValue(row as any);
  vi.mocked(inboundEventRepo.getSubscriberByIdentity).mockResolvedValue(
    undefined,
  );
  vi.mocked(subscriberRepo.getSubscriberByExternalId).mockResolvedValue(
    undefined,
  );
  vi.mocked(subscriberRepo.getSubscriberByEmail).mockResolvedValue(undefined);
  fakeSource.match.mockReturnValue(["signed_up"]);
  fakeSource.personRef.mockReturnValue("u_1");
  fakeSource.templateData.mockReturnValue({ plan: "free" });
  fakeSource.enrich.mockResolvedValue({});
  workflowService.triggerWorkflow.mockResolvedValue({
    triggered: true,
    runPublicId: "run_1",
  });
  processor = new InboundEventsProcessor(
    workflowService as any,
    subscriberService as any,
  );
});

describe("process", () => {
  it("skips an event already processed", async () => {
    vi.mocked(inboundEventRepo.getInboundEventById).mockResolvedValue({
      ...row,
      status: "processed",
    } as any);

    await processor.process(job);

    expect(inboundEventRepo.completeInboundEvent).not.toHaveBeenCalled();
  });

  it("ignores events once the source's integration is removed", async () => {
    vi.mocked(
      environmentIntegrationsRepo.getByEnvironmentAndType,
    ).mockResolvedValue(undefined);

    await processor.process(job);

    expect(inboundEventRepo.completeInboundEvent).toHaveBeenCalledWith({}, 1, {
      status: "ignored",
      outcome: "fake integration no longer configured",
    });
  });

  it("ignores an event no workflow is triggered by, without looking anyone up", async () => {
    setup([]);

    await processor.process(job);

    expect(fakeSource.fetchPerson).not.toHaveBeenCalled();
    expect(inboundEventRepo.completeInboundEvent).toHaveBeenCalledWith({}, 1, {
      status: "ignored",
      matchedEvents: ["signed_up"],
      outcome: "No workflow is triggered by signed_up / user.created",
    });
    expect(workflowRepo.listWorkflowsTriggeredBy).toHaveBeenCalledWith(
      {},
      10,
      "fake",
      ["signed_up", "user.created"],
    );
  });

  it("triggers the workflow for a subscriber already linked to the person", async () => {
    setup([welcome]);
    vi.mocked(inboundEventRepo.getSubscriberByIdentity).mockResolvedValue(
      subscriber,
    );

    await processor.process(job);

    expect(inboundEventRepo.getSubscriberByIdentity).toHaveBeenCalledWith(
      {},
      10,
      "fake",
      "u_1",
    );
    expect(fakeSource.fetchPerson).not.toHaveBeenCalled();
    expect(workflowService.triggerWorkflow).toHaveBeenCalledWith({}, 10, {
      key: "welcome",
      subscriber: { publicId: "sub_7" },
      payload: { fake: { plan: "free" } },
      triggeredBy: null,
      idempotencyKey: "inbound:1:21",
    });
    expect(inboundEventRepo.completeInboundEvent).toHaveBeenCalledWith({}, 1, {
      status: "processed",
      matchedEvents: ["signed_up"],
      subscriberId: 7,
      outcome: "Triggered welcome",
    });
  });

  it("matches by subscriberExternalId, then links the identity", async () => {
    setup([welcome]);
    fakeSource.fetchPerson.mockResolvedValue({
      person: { email: "a@example.com", subscriberExternalId: "user_1" },
    });
    vi.mocked(subscriberRepo.getSubscriberByExternalId).mockResolvedValue(
      subscriber as any,
    );

    await processor.process(job);

    expect(fakeSource.fetchPerson).toHaveBeenCalledWith("u_1", { key: "k" });
    expect(subscriberRepo.getSubscriberByEmail).not.toHaveBeenCalled();
    expect(inboundEventRepo.linkSubscriberIdentity).toHaveBeenCalledWith(
      {},
      {
        environmentId: 10,
        subscriberId: 7,
        source: "fake",
        externalId: "u_1",
      },
    );
  });

  it("falls back to email", async () => {
    setup([welcome]);
    fakeSource.fetchPerson.mockResolvedValue({
      person: { email: "a@example.com" },
    });
    vi.mocked(subscriberRepo.getSubscriberByEmail).mockResolvedValue(
      subscriber as any,
    );

    await processor.process(job);

    expect(subscriberService.createSubscriber).not.toHaveBeenCalled();
    expect(workflowService.triggerWorkflow).toHaveBeenCalled();
  });

  it("creates a subscriber for a new person", async () => {
    setup([welcome]);
    fakeSource.fetchPerson.mockResolvedValue({
      person: { email: "new@example.com", name: "New Person" },
    });
    vi.mocked(subscriberRepo.getSubscriberByEmail)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(subscriber as any);

    await processor.process(job);

    expect(subscriberService.createSubscriber).toHaveBeenCalledWith(
      {},
      {
        environmentId: 10,
        email: "new@example.com",
        externalId: null,
        name: "New Person",
        createdBy: null,
        createdVia: "fake",
      },
    );
    expect(inboundEventRepo.linkSubscriberIdentity).toHaveBeenCalled();
    expect(workflowService.triggerWorkflow).toHaveBeenCalled();
  });

  it("records the source's reason when the person can't be fetched", async () => {
    setup([welcome]);
    fakeSource.fetchPerson.mockResolvedValue({ skipReason: "Person gone" });

    await processor.process(job);

    expect(workflowService.triggerWorkflow).not.toHaveBeenCalled();
    expect(inboundEventRepo.completeInboundEvent).toHaveBeenCalledWith(
      {},
      1,
      expect.objectContaining({ status: "ignored", outcome: "Person gone" }),
    );
  });

  it("ignores a person with no email and no match", async () => {
    setup([welcome]);
    fakeSource.fetchPerson.mockResolvedValue({ person: {} });

    await processor.process(job);

    expect(inboundEventRepo.completeInboundEvent).toHaveBeenCalledWith(
      {},
      1,
      expect.objectContaining({
        status: "ignored",
        outcome: "fake person u_1 has no email and no matching subscriber",
      }),
    );
  });

  it("records a triggered workflow that has since disappeared", async () => {
    setup([{ id: 22, key: "missing" }]);
    vi.mocked(inboundEventRepo.getSubscriberByIdentity).mockResolvedValue(
      subscriber,
    );
    workflowService.triggerWorkflow.mockRejectedValue(
      new NotFoundException("Workflow not found"),
    );

    await processor.process(job);

    expect(inboundEventRepo.completeInboundEvent).toHaveBeenCalledWith(
      {},
      1,
      expect.objectContaining({
        status: "ignored",
        outcome: "Workflow missing not found",
      }),
    );
  });

  it("adds the source's extra template data, fetched with the integration's secret", async () => {
    setup([welcome]);
    vi.mocked(inboundEventRepo.getSubscriberByIdentity).mockResolvedValue(
      subscriber,
    );
    fakeSource.enrich.mockResolvedValue({ invoiceUrl: "https://pay" });

    await processor.process(job);

    expect(fakeSource.enrich).toHaveBeenCalledWith(
      expect.objectContaining({ type: "user.created" }),
      ["signed_up"],
      { key: "k" },
    );
    expect(workflowService.triggerWorkflow).toHaveBeenCalledWith(
      {},
      10,
      expect.objectContaining({
        payload: { fake: { plan: "free", invoiceUrl: "https://pay" } },
      }),
    );
  });

  it("doesn't fetch extra data when no workflow is triggered by the event", async () => {
    setup([]);

    await processor.process(job);

    expect(fakeSource.enrich).not.toHaveBeenCalled();
  });

  it("lets unexpected errors fail the job so it's retried", async () => {
    setup([welcome]);
    fakeSource.fetchPerson.mockRejectedValue(new Error("Source is down"));

    await expect(processor.process(job)).rejects.toThrow("Source is down");
    expect(inboundEventRepo.completeInboundEvent).not.toHaveBeenCalled();
  });

  it("triggers every workflow triggered by the event, each with a key unique to the event so a retry after a partial failure doesn't trigger twice", async () => {
    setup([welcome, { id: 23, key: "onboarding" }]);
    vi.mocked(inboundEventRepo.getSubscriberByIdentity).mockResolvedValue(
      subscriber,
    );

    await processor.process(job);

    expect(workflowService.triggerWorkflow).toHaveBeenCalledWith(
      {},
      10,
      expect.objectContaining({
        key: "welcome",
        idempotencyKey: "inbound:1:21",
      }),
    );
    expect(workflowService.triggerWorkflow).toHaveBeenCalledWith(
      {},
      10,
      expect.objectContaining({
        key: "onboarding",
        idempotencyKey: "inbound:1:23",
      }),
    );
  });
});

describe("onFailed", () => {
  const failedJob = (attemptsMade: number) =>
    ({
      id: "inbound-event-1",
      data: { inboundEventId: 1 },
      attemptsMade,
      opts: { attempts: 5 },
    }) as any;

  it("marks the event failed once retries are exhausted", async () => {
    await processor.onFailed(failedJob(5), new Error("Source is down"));

    expect(inboundEventRepo.completeInboundEvent).toHaveBeenCalledWith({}, 1, {
      status: "failed",
      outcome: "Source is down",
    });
  });

  it("leaves the event alone while retries remain", async () => {
    await processor.onFailed(failedJob(2), new Error("Source is down"));

    expect(inboundEventRepo.completeInboundEvent).not.toHaveBeenCalled();
  });

  it("doesn't throw if the failure can't be recorded", async () => {
    vi.mocked(inboundEventRepo.completeInboundEvent).mockRejectedValueOnce(
      new Error("too many clients"),
    );

    await expect(
      processor.onFailed(failedJob(5), new Error("Source is down")),
    ).resolves.toBeUndefined();
  });
});
