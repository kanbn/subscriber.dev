import { describe, expect, it, vi } from "vitest";

import type { dbClient } from "@subscriber.dev/db/client";
import * as workflowRepo from "@subscriber.dev/db/repository/workflow.repo";

import type { User } from "../../../common/interfaces/user.interface.js";
import type { BillingService } from "../../billing/billing.service.js";
import { EmailTestService } from "../emailTest.service.js";
import { sendWithIntegrations } from "../sendEmailStep.js";

vi.mock("@subscriber.dev/db/repository/workflow.repo", () => ({
  getWorkflowByPublicId: vi.fn(),
  listStepsForWorkflow: vi.fn(),
}));

vi.mock("@subscriber.dev/db/repository/workspace.repo", () => ({
  getPostalAddressForEnvironment: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("../sendEmailStep.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  sendWithIntegrations: vi.fn(() => Promise.resolve("message-1")),
}));

const db = {} as dbClient;
const user = { id: 1, email: "henry@acme.com", name: "Henry Ball" } as User;
const service = new EmailTestService({
  showsPoweredBy: () => Promise.resolve(false),
} as unknown as BillingService);

describe("send", () => {
  it("sends to you by default, with your details as the subscriber", async () => {
    await expect(
      service.send(db, user, 1, {
        subject: "Hi {{ subscriber.firstName }}",
        body: "<p>Hello</p>",
      }),
    ).resolves.toEqual({ to: "henry@acme.com", subject: "[Test] Hi Henry" });
  });

  it("sends to another address with sample data", async () => {
    const result = await service.send(
      db,
      user,
      1,
      {
        subject: "{{ subscriber.firstName }} on {{ plan }}",
        body: "<p>Hi</p>",
      },
      {
        to: "ada@acme.com",
        data: { plan: "pro", subscriber: { firstName: "Ada" } },
      },
    );

    expect(result).toEqual({
      to: "ada@acme.com",
      subject: "[Test] Ada on pro",
    });
    expect(sendWithIntegrations).toHaveBeenLastCalledWith(
      db,
      1,
      expect.objectContaining({ to: "ada@acme.com" }),
    );
  });
});

describe("send with an API key", () => {
  it("needs a recipient, since there's no person to send to", async () => {
    await expect(
      service.send(db, null, 1, { subject: "Hi", body: "<p>Hi</p>" }),
    ).rejects.toThrow("Pass to");
    await expect(
      service.send(
        db,
        null,
        1,
        { subject: "Hi {{ subscriber.email }}", body: "<p>Hi</p>" },
        { to: "ada@acme.com" },
      ),
    ).resolves.toEqual({
      to: "ada@acme.com",
      subject: "[Test] Hi ada@acme.com",
    });
  });
});

describe("workflowStep", () => {
  const steps = [
    { type: "webhook", config: { url: "https://acme.com/hook" } },
    { type: "email", config: { subject: "Welcome", body: "<p>Hi</p>" } },
  ];

  function workflowWithSteps() {
    vi.mocked(workflowRepo.getWorkflowByPublicId).mockResolvedValue({
      id: 7,
      channels: { email: { fromName: "Acme" } },
    } as never);
    vi.mocked(workflowRepo.listStepsForWorkflow).mockResolvedValue(
      steps as never,
    );
  }

  it("uses the first email step, with the workflow's sender name", async () => {
    workflowWithSteps();
    await expect(service.workflowStep(db, 1, "wf_1")).resolves.toEqual({
      subject: "Welcome",
      body: "<p>Hi</p>",
      fromName: "Acme",
      replyTo: undefined,
    });
  });

  it("explains when the step isn't an email or doesn't exist", async () => {
    workflowWithSteps();
    await expect(service.workflowStep(db, 1, "wf_1", 1)).rejects.toThrow(
      "Step 1 is a webhook step, not an email",
    );
    await expect(service.workflowStep(db, 1, "wf_1", 3)).rejects.toThrow(
      "This workflow has 2 steps",
    );
  });
});

describe("content", () => {
  it("uses a subject and body, or asks for one", async () => {
    await expect(
      service.content(db, 1, { subject: "Hi", body: "<p>Hi</p>" }),
    ).resolves.toEqual({ subject: "Hi", body: "<p>Hi</p>" });
    await expect(service.content(db, 1, { subject: "Hi" })).rejects.toThrow(
      "Pass a workflowId, or a subject and body",
    );
  });
});
