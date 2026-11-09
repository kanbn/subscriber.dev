import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as environmentIntegrationsRepo from "@subscriber.dev/db/repository/environmentIntegrations.repo";
import * as setupRepo from "@subscriber.dev/db/repository/setup.repo";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";
import * as workflowRunRepo from "@subscriber.dev/db/repository/workflowRun.repo";
import * as workspaceRepo from "@subscriber.dev/db/repository/workspace.repo";
import { sendRawEmail } from "@subscriber.dev/email";
import {
  createEmailUnsubscribeLink,
  createOneClickUnsubscribeUrl,
} from "@subscriber.dev/shared/utils";

import type { BillingService } from "../../billing/billing.service.js";
import { decrypt } from "../../../common/encryption.js";
import { track } from "../../../posthog.js";
import { fetchPublic } from "../publicFetch.js";
import { WorkflowProcessor } from "../workflow.processor.js";

vi.mock("../publicFetch.js", () => ({ fetchPublic: vi.fn() }));

vi.mock("@subscriber.dev/db/client", () => ({
  createDrizzleClient: vi.fn().mockReturnValue({}),
}));

vi.mock("@subscriber.dev/shared/utils", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@subscriber.dev/shared/utils")>();
  return {
    ...actual,
    createEmailUnsubscribeLink: vi.fn(),
    createOneClickUnsubscribeUrl: vi.fn(),
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
  listByEnvironment: vi.fn(),
}));

vi.mock("@subscriber.dev/db/repository/workspace.repo", () => ({
  getFooterForEnvironment: vi.fn(() =>
    Promise.resolve({ postalAddress: null, sender: "k3x9q2m7p1ab" }),
  ),
  getOwnerForEnvironment: vi.fn(() =>
    Promise.resolve({ workspaceId: 3, userId: 7 }),
  ),
}));

vi.mock("@subscriber.dev/db/repository/setup.repo", () => ({
  hasSentEmail: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("../../../posthog.js", () => ({ track: vi.fn() }));

vi.mock("../../../common/encryption.js", () => ({
  decrypt: vi.fn(),
}));

vi.mock("@subscriber.dev/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@subscriber.dev/email")>()),
  sendRawEmail: vi.fn(),
}));

const mockRunStep = {
  id: 1,
  publicId: "run_step_1",
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
  vi.stubEnv("SMTP_ALLOW_PRIVATE_HOSTS", "true");
  processor = new WorkflowProcessor({
    skipSendReason: () => Promise.resolve(null),
    showsPoweredBy: () => Promise.resolve(false),
  } as unknown as BillingService);
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
  vi.mocked(sendRawEmail).mockResolvedValue({
    accepted: ["alice@example.com"],
    messageId: "msg-1",
  } as any);
  vi.mocked(createEmailUnsubscribeLink).mockResolvedValue(
    "https://example.com/unsubscribe?token=abc",
  );
  vi.mocked(createOneClickUnsubscribeUrl).mockResolvedValue(
    "https://api.example.com/unsubscribe/one-click?token=abc",
  );
  vi.mocked(environmentIntegrationsRepo.listByEnvironment).mockResolvedValue([
    {
      type: "smtp",
      config: {
        host: "smtp.example.com",
        port: 587,
        secure: false,
        fromEmail: "hello@example.com",
        fromName: "Example",
      },
      encryptedSecret: "encrypted-blob",
      priority: 1,
    },
  ] as any);
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
      undefined,
      "msg-1",
    );
    expect(workflowRunRepo.completeRunIfAllStepsTerminal).toHaveBeenCalledWith(
      expect.anything(),
      5,
    );
  });

  it("tracks first_email_sent only for the environment's first send", async () => {
    await processor.process(makeJob());
    expect(track).not.toHaveBeenCalled();

    vi.mocked(setupRepo.hasSentEmail).mockResolvedValueOnce(false);
    await processor.process(makeJob());
    expect(track).toHaveBeenCalledWith("first_email_sent", {
      via: "workflow",
      workspaceId: 3,
      userId: 7,
    });
  });

  it("passes the SMTP integration's replyTo through to the send", async () => {
    vi.mocked(environmentIntegrationsRepo.listByEnvironment).mockResolvedValue([
      {
        type: "smtp",
        config: {
          host: "smtp.example.com",
          port: 587,
          secure: false,
          fromEmail: "hello@example.com",
          fromName: "Example",
          replyTo: "support@example.com",
        },
        encryptedSecret: "encrypted-blob",
        priority: 1,
      },
    ] as any);

    await processor.process(makeJob());

    const [, , , , options] = vi.mocked(sendRawEmail).mock.calls[0]!;
    expect(options?.replyTo).toBe("support@example.com");
  });

  it("omits replyTo when the integration doesn't set one", async () => {
    await processor.process(makeJob());

    const [, , , , options] = vi.mocked(sendRawEmail).mock.calls[0]!;
    expect(options?.replyTo).toBeUndefined();
  });

  it("sends a plain-text alternative and one-click List-Unsubscribe headers", async () => {
    await processor.process(makeJob());

    const [, , , , options] = vi.mocked(sendRawEmail).mock.calls[0]!;
    expect(options?.text).toContain("Welcome Alice!");
    expect(options?.text).not.toContain("<");
    expect(options?.headers).toEqual({
      "List-Unsubscribe":
        "<https://api.example.com/unsubscribe/one-click?token=abc>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("omits List-Unsubscribe headers when the one-click URL isn't HTTPS", async () => {
    vi.mocked(createOneClickUnsubscribeUrl).mockResolvedValue(
      "http://localhost:4000/unsubscribe/one-click?token=abc",
    );

    await processor.process(makeJob());

    const [, , , , options] = vi.mocked(sendRawEmail).mock.calls[0]!;
    expect(options?.headers).toBeUndefined();
    expect(options?.text).toContain("Welcome Alice!");
  });

  it("marks the run-step failed when no configured integration matches a registered provider", async () => {
    vi.mocked(environmentIntegrationsRepo.listByEnvironment).mockResolvedValue([
      {
        type: "unknown-provider",
        config: {},
        encryptedSecret: "encrypted-blob",
        priority: 1,
      },
    ] as any);

    await processor.process(makeJob());

    expect(sendRawEmail).not.toHaveBeenCalled();
    expect(workflowRunRepo.updateRunStepStatus).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "failed",
      "No email integration configured for this environment",
    );
  });

  it("skips unregistered integration types and sends through whichever configured integration matches a registered provider", async () => {
    vi.mocked(environmentIntegrationsRepo.listByEnvironment).mockResolvedValue([
      {
        type: "unrelated-future-integration",
        config: {},
        encryptedSecret: null,
        priority: 1,
      },
      {
        type: "smtp",
        config: {
          host: "smtp.example.com",
          port: 587,
          secure: false,
          fromEmail: "hello@example.com",
          fromName: "Example",
        },
        encryptedSecret: "encrypted-blob",
        priority: 2,
      },
    ] as any);

    await processor.process(makeJob());

    expect(sendRawEmail).toHaveBeenCalled();
  });

  it("falls through to the next integration in priority order when the primary one fails to send", async () => {
    vi.mocked(environmentIntegrationsRepo.listByEnvironment).mockResolvedValue([
      {
        type: "smtp",
        config: {
          host: "primary.example.com",
          port: 587,
          secure: false,
          fromEmail: "hello@example.com",
          fromName: "Example",
        },
        encryptedSecret: "encrypted-blob",
        priority: 1,
      },
      {
        type: "smtp",
        config: {
          host: "fallback.example.com",
          port: 587,
          secure: false,
          fromEmail: "hello@example.com",
          fromName: "Example",
        },
        encryptedSecret: "encrypted-blob",
        priority: 2,
      },
    ] as any);
    vi.mocked(sendRawEmail)
      .mockRejectedValueOnce(new Error("Primary provider down"))
      .mockResolvedValueOnce({
        accepted: ["alice@example.com"],
        messageId: "msg-fallback",
      } as any);

    await processor.process(makeJob());

    expect(sendRawEmail).toHaveBeenCalledTimes(2);
    const [firstConfig] = vi.mocked(sendRawEmail).mock.calls[0]!;
    const [secondConfig] = vi.mocked(sendRawEmail).mock.calls[1]!;
    expect((firstConfig as any).host).toBe("primary.example.com");
    expect((secondConfig as any).host).toBe("fallback.example.com");
    expect(workflowRunRepo.updateRunStepStatus).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "sent",
      undefined,
      "msg-fallback",
    );
  });

  it("marks the run-step failed with the last provider's error when every configured integration fails", async () => {
    vi.mocked(environmentIntegrationsRepo.listByEnvironment).mockResolvedValue([
      {
        type: "smtp",
        config: {
          host: "primary.example.com",
          port: 587,
          secure: false,
          fromEmail: "hello@example.com",
          fromName: "Example",
        },
        encryptedSecret: "encrypted-blob",
        priority: 1,
      },
      {
        type: "smtp",
        config: {
          host: "fallback.example.com",
          port: 587,
          secure: false,
          fromEmail: "hello@example.com",
          fromName: "Example",
        },
        encryptedSecret: "encrypted-blob",
        priority: 2,
      },
    ] as any);
    vi.mocked(sendRawEmail)
      .mockRejectedValueOnce(new Error("Primary provider down"))
      .mockRejectedValueOnce(new Error("Fallback provider down too"));

    await expect(processor.process(makeJob())).rejects.toThrow(
      "Fallback provider down too",
    );

    expect(sendRawEmail).toHaveBeenCalledTimes(2);
    expect(workflowRunRepo.updateRunStepStatus).not.toHaveBeenCalled();
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

  it("inlines the layout's CSS so email apps that strip <style> keep it", async () => {
    vi.mocked(workflowRunRepo.getRunStepById).mockResolvedValue({
      ...mockRunStep,
      configSnapshot: {
        subject: "Hi",
        body: '<p>Hello</p><a class="button" href="https://example.com">Go</a>',
      },
    } as any);

    await processor.process(makeJob());

    const [, , , html] = vi.mocked(sendRawEmail).mock.calls[0]!;
    expect(html).toContain('<p style="margin: 0 0 14px;">Hello</p>');
    expect(html).toMatch(
      /<a class="button"[^>]*style="[^"]*background-color: #111113/,
    );
  });

  it.each([
    [true, true],
    [false, false],
  ])(
    "adds Powered by subscriber.dev when billing says so (%s)",
    async (showsPoweredBy, expected) => {
      const branded = new WorkflowProcessor({
        skipSendReason: () => Promise.resolve(null),
        showsPoweredBy: () => Promise.resolve(showsPoweredBy),
      } as unknown as BillingService);

      await branded.process(makeJob());

      const [, , , html, options] = vi.mocked(sendRawEmail).mock.calls[0]!;
      expect(
        html.includes(
          'href="https://subscriber.dev/?utm_source=powered-by&amp;utm_medium=email&amp;utm_campaign=k3x9q2m7p1ab"',
        ),
      ).toBe(expected);
      expect(options?.text?.includes("Powered by subscriber.dev")).toBe(
        expected,
      );
    },
  );

  it("puts the workspace's postal address in the footer", async () => {
    vi.mocked(workspaceRepo.getFooterForEnvironment).mockResolvedValueOnce({
      postalAddress: "Acme <Inc>,\n1 Market Street\n\nSan Francisco",
      sender: "k3x9q2m7p1ab",
    });

    await processor.process(makeJob());

    const [, , , html, options] = vi.mocked(sendRawEmail).mock.calls[0]!;
    expect(html).toContain("Acme &lt;Inc&gt;, 1 Market Street, San Francisco");
    expect(options?.text).toContain(
      "Acme <Inc>, 1 Market Street, San Francisco",
    );
  });

  it.each(["{{unsubscribeUrl}}", "{{ unsubscribeUrl }}"])(
    "also supports %s interpolation for custom placement, without duplicating the auto-footer",
    async (token) => {
      vi.mocked(workflowRunRepo.getRunStepById).mockResolvedValue({
        ...mockRunStep,
        configSnapshot: {
          subject: "Hi {{ subscriber.firstName }}",
          body: `Bye - ${token}`,
        },
      } as any);

      await processor.process(makeJob());

      const [, , , html] = vi.mocked(sendRawEmail).mock.calls[0]!;
      expect(html).toContain("Bye - https://example.com/unsubscribe?token=abc");
      expect(html).not.toContain("Don&#x27;t want these emails?");
    },
  );

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
    expect(html).toContain("Welcome Alice!");
    expect(html).not.toContain("Unsubscribe");
  });

  it("wraps the body in the default layout when the step has no layout set", async () => {
    await processor.process(makeJob());

    const [, , , html, options] = vi.mocked(sendRawEmail).mock.calls[0]!;
    expect(html).toMatch(/^<!DOCTYPE html/);
    expect(html).toContain("max-width:600px");
    expect(html).toContain("-apple-system");
    expect(html).toContain('<div class="content"');
    expect(options?.text).toBe(
      "Welcome Alice!\n\nDon't want these emails? Unsubscribe [https://example.com/unsubscribe?token=abc]",
    );
  });

  it('sends the body as-is with layout "none"', async () => {
    vi.mocked(workflowRunRepo.getRunStepById).mockResolvedValue({
      ...mockRunStep,
      configSnapshot: { ...mockRunStep.configSnapshot, layout: "none" },
    } as any);

    await processor.process(makeJob());

    const [, , , html] = vi.mocked(sendRawEmail).mock.calls[0]!;
    expect(html).toBe(
      'Welcome Alice!<p style="font-size:12px;color:#666;">Don\'t want these emails? <a href="https://example.com/unsubscribe?token=abc">Unsubscribe</a></p>',
    );
  });

  it("skips the layout for a body that is already a full HTML document", async () => {
    vi.mocked(workflowRunRepo.getRunStepById).mockResolvedValue({
      ...mockRunStep,
      configSnapshot: {
        subject: "Hi",
        body: "<html><body><p>Mine</p></body></html>",
      },
    } as any);

    await processor.process(makeJob());

    const [, , , html] = vi.mocked(sendRawEmail).mock.calls[0]!;
    expect(html).toMatch(/^<html><body><p>Mine<\/p><\/body><\/html><p style=/);
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

  it("skips sending when billing says the workspace is over its plan", async () => {
    const reason =
      "Not sent: over the free plan's 1,000 subscribers. Upgrade to send to new subscribers.";
    const overPlan = new WorkflowProcessor({
      skipSendReason: () => Promise.resolve(reason),
      showsPoweredBy: () => Promise.resolve(false),
    } as unknown as BillingService);

    await overPlan.process(makeJob());

    expect(sendRawEmail).not.toHaveBeenCalled();
    expect(workflowRunRepo.updateRunStepStatus).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "skipped",
      reason,
    );
    expect(workflowRunRepo.completeRunIfAllStepsTerminal).toHaveBeenCalled();
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

  it("leaves the run-step pending and rethrows when sending fails, so BullMQ retries it", async () => {
    vi.mocked(sendRawEmail).mockRejectedValue(new Error("SMTP down"));

    await expect(processor.process(makeJob())).rejects.toThrow("SMTP down");

    expect(workflowRunRepo.updateRunStepStatus).not.toHaveBeenCalled();
  });

  it("marks the run-step failed when no integration is configured for the environment", async () => {
    vi.mocked(environmentIntegrationsRepo.listByEnvironment).mockResolvedValue(
      [],
    );

    await processor.process(makeJob());

    expect(sendRawEmail).not.toHaveBeenCalled();
    expect(workflowRunRepo.updateRunStepStatus).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "failed",
      "No email integration configured for this environment",
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

  it("POSTs the rendered JSON payload and marks the run-step sent on a 2xx response", async () => {
    vi.mocked(workflowRunRepo.getRunStepById).mockResolvedValue(
      mockWebhookRunStep as any,
    );
    vi.mocked(fetchPublic).mockResolvedValue({ ok: true, status: 200 } as any);

    await processor.process(makeJob(2));

    expect(fetchPublic).toHaveBeenCalledWith(
      "https://discord.com/api/webhooks/xyz",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"content": "alice@example.com just signed up!"}',
        redirect: "error",
        signal: expect.any(AbortSignal),
      },
    );
    expect(workflowRunRepo.updateRunStepStatus).toHaveBeenCalledWith(
      expect.anything(),
      2,
      "sent",
    );
  });

  it("leaves the run-step pending and rethrows on a non-2xx response, so BullMQ retries it", async () => {
    vi.mocked(workflowRunRepo.getRunStepById).mockResolvedValue(
      mockWebhookRunStep as any,
    );
    vi.mocked(fetchPublic).mockResolvedValue({ ok: false, status: 500 } as any);

    await expect(processor.process(makeJob(2))).rejects.toThrow(
      "Webhook responded with 500",
    );

    expect(workflowRunRepo.updateRunStepStatus).not.toHaveBeenCalled();
  });

  it("marks the run-step failed without making a network call when the rendered body isn't valid JSON", async () => {
    vi.mocked(workflowRunRepo.getRunStepById).mockResolvedValue({
      ...mockWebhookRunStep,
      configSnapshot: {
        url: "https://discord.com/api/webhooks/xyz",
        body: '{"content": "{{ subscriber.email }} just signed up!"',
      },
    } as any);

    await processor.process(makeJob(2));

    expect(fetchPublic).not.toHaveBeenCalled();
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
  it("marks the run-step failed and completes the run once BullMQ has exhausted retries", async () => {
    vi.mocked(workflowRunRepo.getRunStepByBullJobId).mockResolvedValue({
      id: 1,
      runId: 5,
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
    expect(workflowRunRepo.completeRunIfAllStepsTerminal).toHaveBeenCalledWith(
      expect.anything(),
      5,
    );
  });

  it("logs instead of throwing when recording the failure itself fails", async () => {
    vi.mocked(workflowRunRepo.getRunStepByBullJobId).mockRejectedValue(
      new Error("sorry, too many clients already"),
    );

    await expect(
      processor.onFailed(
        { ...makeJob(), attemptsMade: 3, opts: { attempts: 3 } },
        new Error("boom"),
      ),
    ).resolves.toBeUndefined();
  });

  it("does nothing while attempts remain", async () => {
    await processor.onFailed(
      { ...makeJob(), attemptsMade: 1, opts: { attempts: 3 } },
      new Error("boom"),
    );

    expect(workflowRunRepo.getRunStepByBullJobId).not.toHaveBeenCalled();
  });
});
