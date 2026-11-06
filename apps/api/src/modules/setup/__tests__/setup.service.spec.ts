import { describe, expect, it, vi } from "vitest";

import type { dbClient } from "@subscriber.dev/db/client";
import * as setupRepo from "@subscriber.dev/db/repository/setup.repo";
import * as workspaceRepo from "@subscriber.dev/db/repository/workspace.repo";

import { SetupService } from "../setup.service.js";

vi.mock("@subscriber.dev/db/repository/setup.repo", () => ({
  getSetupFacts: vi.fn(),
}));

vi.mock("@subscriber.dev/db/repository/workspace.repo", () => ({
  getFooterForEnvironment: vi.fn(),
}));

const db = {} as dbClient;
const service = new SetupService();

describe("getSetup", () => {
  it("points a new environment at connecting an email provider", async () => {
    vi.mocked(setupRepo.getSetupFacts).mockResolvedValue({
      integrationTypes: ["stripe"],
      stripeWebhook: true,
      workflowCount: 0,
      hasSentEmail: false,
    });
    vi.mocked(workspaceRepo.getFooterForEnvironment).mockResolvedValue({
      postalAddress: null,
      sender: "k3x9q2m7p1ab",
    });

    const setup = await service.getSetup(db, 1);

    expect(setup.complete).toBe(false);
    expect(setup.next).toBe("email_provider");
    expect(setup.suggestions).toEqual([
      expect.objectContaining({ key: "postal_address", done: false }),
      {
        key: "stripe",
        title: "Connect Stripe to start workflows from billing events",
        done: true,
      },
    ]);
  });

  it("moves on step by step, and completes once an email has sent", async () => {
    vi.mocked(workspaceRepo.getFooterForEnvironment).mockResolvedValue({
      postalAddress: "1 Market Street",
      sender: "k3x9q2m7p1ab",
    });

    vi.mocked(setupRepo.getSetupFacts).mockResolvedValue({
      integrationTypes: ["resend"],
      stripeWebhook: false,
      workflowCount: 0,
      hasSentEmail: false,
    });
    expect((await service.getSetup(db, 1)).next).toBe("first_workflow");

    vi.mocked(setupRepo.getSetupFacts).mockResolvedValue({
      integrationTypes: ["resend"],
      stripeWebhook: false,
      workflowCount: 1,
      hasSentEmail: false,
    });
    expect((await service.getSetup(db, 1)).next).toBe("first_email_sent");

    vi.mocked(setupRepo.getSetupFacts).mockResolvedValue({
      integrationTypes: ["resend"],
      stripeWebhook: false,
      workflowCount: 1,
      hasSentEmail: true,
    });
    const setup = await service.getSetup(db, 1);
    expect(setup.complete).toBe(true);
    expect(setup.next).toBe(null);
  });

  it("keeps Stripe open until it has a webhook", async () => {
    vi.mocked(setupRepo.getSetupFacts).mockResolvedValue({
      integrationTypes: ["resend", "stripe"],
      stripeWebhook: false,
      workflowCount: 1,
      hasSentEmail: true,
    });

    const stripe = (await service.getSetup(db, 1)).suggestions.find(
      (suggestion) => suggestion.key === "stripe",
    );

    expect(stripe).toMatchObject({ done: false });
    expect(stripe?.title).toMatch(/no webhook/);
  });
});
