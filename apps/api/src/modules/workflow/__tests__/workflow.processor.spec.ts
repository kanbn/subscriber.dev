import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as environmentIntegrationsRepo from "@subscriber.dev/db/repository/environmentIntegrations.repo";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";
import * as workflowRunRepo from "@subscriber.dev/db/repository/workflowRun.repo";
import { sendRawEmail } from "@subscriber.dev/email";
import { createEmailUnsubscribeLink } from "@subscriber.dev/shared/utils";

import { decrypt } from "../../../common/encryption.js";
import { WorkflowProcessor } from "../workflow.processor.js";

vi.mock("@subscriber.dev/db/client", () => ({
  createDrizzleClient: vi.fn().mockReturnValue({}),
}));

vi.mock("@subscriber.dev/shared/utils", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@subscriber.dev/shared/utils")>();
  return {
    ...actual,
    createEmailUnsubscribeLink: vi.fn(),
  };
});

vi.mock("@subscriber.dev/db/repository/workflowRun.repo", () => ({
  getRunStepById: vi.fn(),
  getRunById: vi.fn(),
  getRunStepByBullJobId: vi.fn(),
  updateRunStepStatus: vi.fn(),
  completeRunIfAllStepsTerminal: vi.fn(),
}));

vi.mock("@subscriber.dev/db/repository/subscriber.repo", () => ({
  getSubscriberById: vi.fn(),
  getLatestPreferences: vi.fn(),
}));

vi.mock("@subscriber.dev/db/repository/environmentIntegrations.repo", () => ({
  getByEnvironmentAndType: vi.fn(),
}));

vi.mock("../../../common/encryption.js", () => ({
  decrypt: vi.fn(),
}));

vi.mock("@subscriber.dev/email", () => ({
  sendRawEmail: vi.fn(),
}));

const mockRunStep = {
  id: 1,
  runId: 5,
  status: "pending" as const,
  type: "email",
  configSnapshot: {
    subject: "Hi {{ subscriber.firstName }}",
    body: "Welcome {{ subscriber.firstName }}!",
  },
};

const mockRun = { id: 5, subscriberId: 100, payload: null };

const mockSubscriber = {
  id: 100,
  publicId: "sub_alice",
  environmentId: 10,
  email: "alice@example.com",
  firstName: "Alice",
  lastName: "Smith",
  name: "Alice Smith",
  attributes: null,
};

let processor: WorkflowProcessor;

beforeEach(() => {
  vi.clearAllMocks();
  processor = new WorkflowProcessor();
  vi.mocked(workflowRunRepo.getRunStepById).mockResolvedValue(
    mockRunStep as any,
  );
  vi.mocked(workflowRunRepo.getRunById).mockResolvedValue(mockRun as any);
  vi.mocked(subscriberRepo.getSubscriberById).mockResolvedValue(
    mockSubscriber as any,
  );
  vi.mocked(subscriberRepo.getLatestPreferences).mockResolvedValue({
    email: true,
  } as any);
  vi.mocked(sendRawEmail).mockResolvedValue(undefined as any);
  vi.mocked(createEmailUnsubscribeLink).mockResolvedValue(
    "https://example.com/unsubscribe?token=abc",
  );
  vi.mocked(
    environmentIntegrationsRepo.getByEnvironmentAndType,
  ).mockResolvedValue({
    config: {
      host: "smtp.example.com",
      port: 587,
      secure: false,
      fromEmail: "hello@example.com",
      fromName: "Example",
    },
    encryptedSecret: "encrypted-blob",
  } as any);
  vi.mocked(decrypt).mockReturnValue(
    JSON.stringify({ user: "smtp-user", password: "s3cret" }),
  );
});

function makeJob(runStepId = 1) {
  return {
    data: { runStepId },
    id: "job-1",
    attemptsMade: 1,
    opts: { attempts: 3 },
  } as any;
}

describe("process", () => {
  it("is a no-op when the run-step is already non-pending", async () => {
    vi.mocked(workflowRunRepo.getRunStepById).mockResolvedValue({
      ...mockRunStep,
      status: "cancelled",
    } as any);

    await processor.process(makeJob());

    expect(sendRawEmail).not.toHaveBeenCalled();
    expect(workflowRunRepo.updateRunStepStatus).not.toHaveBeenCalled();
  });

  it("sends the interpolated email and marks the run-step sent when subscribed", async () => {
    await processor.process(makeJob());

    const [config, to, subject, html] = vi.mocked(sendRawEmail).mock.calls[0]!;
    expect(config).toEqual({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      user: "smtp-user",
      password: "s3cret",
      from: "Example <hello@example.com>",
    });
    expect(to).toBe("alice@example.com");
    expect(subject).toBe("Hi Alice");
    expect(html).toContain("Welcome Alice!");
    expect(workflowRunRepo.updateRunStepStatus).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "sent",
    );
    expect(workflowRunRepo.completeRunIfAllStepsTerminal).toHaveBeenCalledWith(
      expect.anything(),
      5,
    );
  });

  it("always appends a working unsubscribe link, even when the template doesn't reference {{unsubscribeUrl}}", async () => {
    // mockRunStep's body has no {{unsubscribeUrl}} token - this is the actual
    // bug this test guards against: the link must not depend on the workflow
    // author remembering to include it.
    await processor.process(makeJob());

    expect(createEmailUnsubscribeLink).toHaveBeenCalledWith(10, "sub_alice");
    const [, , , html] = vi.mocked(sendRawEmail).mock.calls[0]!;
    expect(html).toContain('href="https://example.com/unsubscribe?token=abc"');
  });

  it("also supports {{unsubscribeUrl}} interpolation for custom placement, without duplicating the auto-footer", async () => {
    vi.mocked(workflowRunRepo.getRunStepById).mockResolvedValue({
      ...mockRunStep,
      configSnapshot: {
        subject: "Hi {{ subscriber.firstName }}",
        body: "Bye - {{unsubscribeUrl}}",
      },
    } as any);

    await processor.process(makeJob());

    const [, , , html] = vi.mocked(sendRawEmail).mock.calls[0]!;
    expect(html).toBe("Bye - https://example.com/unsubscribe?token=abc");
  });

  it("supports Liquid {% if %} conditionals, taking the truthy branch when the subscriber has a first name", async () => {
    vi.mocked(workflowRunRepo.getRunStepById).mockResolvedValue({
      ...mockRunStep,
      configSnapshot: {
        subject: "Hi",
        body: "Hey {% if subscriber.firstName %}{{ subscriber.firstName }}{% else %}there{% endif %},",
      },
    } as any);

    await processor.process(makeJob());

    const [, , , html] = vi.mocked(sendRawEmail).mock.calls[0]!;
    expect(html).toContain("Hey Alice,");
  });

  it("supports Liquid {% if %} conditionals, taking the else branch when the subscriber has no first name", async () => {
    vi.mocked(subscriberRepo.getSubscriberById).mockResolvedValue({
      ...mockSubscriber,
      firstName: null,
    } as any);
    vi.mocked(workflowRunRepo.getRunStepById).mockResolvedValue({
      ...mockRunStep,
      configSnapshot: {
        subject: "Hi",
        body: "Hey {% if subscriber.firstName %}{{ subscriber.firstName }}{% else %}there{% endif %},",
      },
    } as any);

    await processor.process(makeJob());

    const [, , , html] = vi.mocked(sendRawEmail).mock.calls[0]!;
    expect(html).toContain("Hey there,");
  });

  it("skips the footer when no unsubscribe link could be generated", async () => {
    vi.mocked(createEmailUnsubscribeLink).mockResolvedValue(null);

    await processor.process(makeJob());

    const [, , , html] = vi.mocked(sendRawEmail).mock.calls[0]!;
    expect(html).toBe("Welcome Alice!");
  });

  it("skips sending and marks skipped when the subscriber opted out of email", async () => {
    vi.mocked(subscriberRepo.getLatestPreferences).mockResolvedValue({
      email: false,
    } as any);

    await processor.process(makeJob());

    expect(sendRawEmail).not.toHaveBeenCalled();
    expect(workflowRunRepo.updateRunStepStatus).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "skipped",
      "Subscriber opted out of email",
    );
  });

  it("skips sending and marks skipped when the subscriber has no email address", async () => {
    vi.mocked(subscriberRepo.getSubscriberById).mockResolvedValue({
      ...mockSubscriber,
      email: null,
    } as any);

    await processor.process(makeJob());

    expect(sendRawEmail).not.toHaveBeenCalled();
    expect(workflowRunRepo.updateRunStepStatus).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "skipped",
      "Subscriber has no email address",
    );
  });

  it("marks the run-step failed and rethrows when sending fails", async () => {
    vi.mocked(sendRawEmail).mockRejectedValue(new Error("SMTP down"));

    await expect(processor.process(makeJob())).rejects.toThrow("SMTP down");

    expect(workflowRunRepo.updateRunStepStatus).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "failed",
      "SMTP down",
    );
  });

  it("marks the run-step failed when no SMTP integration is configured for the environment", async () => {
    vi.mocked(
      environmentIntegrationsRepo.getByEnvironmentAndType,
    ).mockResolvedValue(undefined);

    await processor.process(makeJob());

    expect(sendRawEmail).not.toHaveBeenCalled();
    expect(workflowRunRepo.updateRunStepStatus).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "failed",
      "No SMTP integration configured for this environment",
    );
  });

  it("marks the run-step skipped when the subscriber no longer exists", async () => {
    vi.mocked(subscriberRepo.getSubscriberById).mockResolvedValue(undefined);

    await processor.process(makeJob());

    expect(workflowRunRepo.updateRunStepStatus).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "skipped",
      "Subscriber not found",
    );
  });
});

describe("webhook steps", () => {
  const mockWebhookRunStep = {
    id: 2,
    runId: 5,
    status: "pending" as const,
    type: "webhook",
    configSnapshot: {
      url: "https://discord.com/api/webhooks/xyz",
      body: '{"content": "{{ subscriber.email }} just signed up!"}',
    },
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the rendered JSON payload and marks the run-step sent on a 2xx response", async () => {
    vi.mocked(workflowRunRepo.getRunStepById).mockResolvedValue(
      mockWebhookRunStep as any,
    );
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as any);

    await processor.process(makeJob(2));

    expect(fetch).toHaveBeenCalledWith("https://discord.com/api/webhooks/xyz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"content": "alice@example.com just signed up!"}',
    });
    expect(workflowRunRepo.updateRunStepStatus).toHaveBeenCalledWith(
      expect.anything(),
      2,
      "sent",
    );
  });

  it("marks the run-step failed and rethrows on a non-2xx response", async () => {
    vi.mocked(workflowRunRepo.getRunStepById).mockResolvedValue(
      mockWebhookRunStep as any,
    );
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as any);

    await expect(processor.process(makeJob(2))).rejects.toThrow(
      "Webhook responded with 500",
    );

    expect(workflowRunRepo.updateRunStepStatus).toHaveBeenCalledWith(
      expect.anything(),
      2,
      "failed",
      "Webhook responded with 500",
    );
  });

  it("marks the run-step failed without making a network call when the rendered body isn't valid JSON", async () => {
    vi.mocked(workflowRunRepo.getRunStepById).mockResolvedValue({
      ...mockWebhookRunStep,
      configSnapshot: {
        url: "https://discord.com/api/webhooks/xyz",
        body: '{"content": "{{ subscriber.email }} just signed up!"',
      },
    } as any);

    await expect(processor.process(makeJob(2))).rejects.toThrow();

    expect(fetch).not.toHaveBeenCalled();
    expect(workflowRunRepo.updateRunStepStatus).toHaveBeenCalledWith(
      expect.anything(),
      2,
      "failed",
      expect.any(String),
    );
  });
});

describe("unsupported step types", () => {
  it("marks the run-step failed for a type that isn't email or webhook", async () => {
    vi.mocked(workflowRunRepo.getRunStepById).mockResolvedValue({
      ...mockRunStep,
      type: "sms",
    } as any);

    await processor.process(makeJob());

    expect(workflowRunRepo.updateRunStepStatus).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "failed",
      "Unsupported step type: sms",
    );
  });
});

describe("onFailed", () => {
  it("marks the run-step failed once BullMQ has exhausted retries", async () => {
    vi.mocked(workflowRunRepo.getRunStepByBullJobId).mockResolvedValue({
      id: 1,
      status: "pending",
    } as any);

    await processor.onFailed(
      { ...makeJob(), attemptsMade: 3, opts: { attempts: 3 } },
      new Error("boom"),
    );

    expect(workflowRunRepo.updateRunStepStatus).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "failed",
      "boom",
    );
  });

  it("does nothing while attempts remain", async () => {
    await processor.onFailed(
      { ...makeJob(), attemptsMade: 1, opts: { attempts: 3 } },
      new Error("boom"),
    );

    expect(workflowRunRepo.getRunStepByBullJobId).not.toHaveBeenCalled();
  });
});
