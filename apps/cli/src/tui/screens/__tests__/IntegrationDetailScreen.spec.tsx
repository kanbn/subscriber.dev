import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import {
  deleteIntegration,
  getIntegration,
  listInboundEvents,
  setPrimaryIntegration,
  upsertIntegration,
} from "@subscriber.dev/api-client/cli";

import { IntegrationDetailScreen } from "../IntegrationDetailScreen.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  getIntegration: vi.fn(),
  listInboundEvents: vi.fn(),
  deleteIntegration: vi.fn(),
  setPrimaryIntegration: vi.fn(),
  upsertIntegration: vi.fn(),
}));

function renderScreen(onDeleted = vi.fn()) {
  return {
    onDeleted,
    ...render(
      <IntegrationDetailScreen
        environmentId="test-environment-1"
        type="smtp"
        onDeleted={onDeleted}
      />,
    ),
  };
}

function tick() {
  return new Promise<void>((resolve) => setTimeout(resolve, 50));
}

describe("IntegrationDetailScreen", () => {
  it("renders every field returned, including provider-specific ones", async () => {
    vi.mocked(getIntegration).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: {
        type: "smtp",
        host: "smtp.example.com",
        port: 587,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    } as never);

    const { lastFrame } = renderScreen();

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("type: smtp");
    });
    expect(lastFrame()).toContain("host: smtp.example.com");
    expect(lastFrame()).toContain("port: 587");
  });

  it("shows an error when the integration isn't found", async () => {
    vi.mocked(getIntegration).mockResolvedValue({
      status: 404,
      headers: new Headers(),
      data: undefined,
    } as never);

    const { lastFrame } = renderScreen();

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Error");
    });
  });
});

describe("IntegrationDetailScreen delete", () => {
  async function loaded() {
    vi.mocked(getIntegration).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: { type: "smtp", updatedAt: "2026-01-01T00:00:00.000Z" },
    } as never);
    const screen = renderScreen();
    await vi.waitFor(() => {
      expect(screen.lastFrame()).toContain("type: smtp");
    });
    return screen;
  }

  it("shows a confirm prompt when 'd' is pressed", async () => {
    const { lastFrame, stdin } = await loaded();

    await tick();
    stdin.write("d");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain(
        'Remove integration "smtp"? This cannot be undone.',
      );
    });
  });

  it("cancels without calling the API when Enter is pressed immediately (default is cancel)", async () => {
    const { lastFrame, stdin } = await loaded();

    await tick();
    stdin.write("d");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("This cannot be undone.");
    });

    await tick();
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(lastFrame()).not.toContain("This cannot be undone.");
    });
    expect(deleteIntegration).not.toHaveBeenCalled();
  });
});

describe("IntegrationDetailScreen set primary", () => {
  it("shows the 'p set primary' hint for a non-primary integration and calls the API on 'p'", async () => {
    vi.mocked(getIntegration)
      .mockResolvedValueOnce({
        status: 200,
        headers: new Headers(),
        data: {
          type: "smtp",
          priority: 2,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      } as never)
      .mockResolvedValueOnce({
        status: 200,
        headers: new Headers(),
        data: {
          type: "smtp",
          priority: 1,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      } as never);
    vi.mocked(setPrimaryIntegration).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: {
        type: "smtp",
        priority: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    } as never);

    const { lastFrame, stdin } = renderScreen();
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("priority: 2");
    });
    expect(lastFrame()).toContain("p set primary");

    await tick();
    stdin.write("p");

    await vi.waitFor(() => {
      expect(setPrimaryIntegration).toHaveBeenCalledWith("smtp");
    });
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("priority: 1");
    });
  });

  it("hides the 'p set primary' hint once the integration is already primary", async () => {
    vi.mocked(getIntegration).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: {
        type: "smtp",
        priority: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    } as never);

    const { lastFrame } = renderScreen();
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("priority: 1");
    });
    expect(lastFrame()).not.toContain("p set primary");
  });
});

describe("IntegrationDetailScreen edit", () => {
  const smtpConfig = {
    type: "smtp",
    host: "smtp.example.com",
    port: 465,
    secure: true,
    fromEmail: "hello@example.com",
    fromName: "Example",
    priority: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  async function openEditor() {
    vi.mocked(getIntegration).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: smtpConfig,
    } as never);
    const screen = renderScreen();
    await vi.waitFor(() => {
      expect(screen.lastFrame()).toContain("host: smtp.example.com");
    });
    await tick();
    screen.stdin.write("e");
    await vi.waitFor(() => {
      expect(screen.lastFrame()).toContain("Edit integration: smtp");
    });
    return screen;
  }

  it("opens a form pre-filled with the current config, keeping secrets unless changed", async () => {
    const { lastFrame } = await openEditor();

    expect(lastFrame()).toContain("Host: smtp.example.com");
    expect(lastFrame()).toContain("From name: Example");
    expect(lastFrame()).toContain("SMTP password: (unchanged)");
    expect(lastFrame()).toContain("Save changes");
  });

  it("saves the edited config without sending secrets that were left blank", async () => {
    vi.mocked(upsertIntegration).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: smtpConfig,
    } as never);
    const { lastFrame, stdin } = await openEditor();

    // Menu: Host, Port, From email, From name, Reply-to, user, password,
    // Secure, Save changes. Move to Reply-to and set it.
    for (let i = 0; i < 4; i++) {
      await tick();
      stdin.write("\u001B[B");
    }
    await tick();
    stdin.write("\r");
    await tick();
    stdin.write("henry@kan.bn");
    await tick();
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Reply-to email (optional): henry@kan.bn");
    });

    // The menu returns to the top after editing a field; "Save changes"
    // is 8 items down (after the 7 text fields and Secure).
    for (let i = 0; i < 8; i++) {
      await tick();
      stdin.write("\u001B[B");
    }
    await tick();
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(upsertIntegration).toHaveBeenCalled();
    });
    const [type, body] = vi.mocked(upsertIntegration).mock.calls[0]!;
    expect(type).toBe("smtp");
    expect(body).toEqual(
      expect.objectContaining({
        host: "smtp.example.com",
        replyTo: "henry@kan.bn",
        user: undefined,
        password: undefined,
      }),
    );
    await vi.waitFor(() => {
      expect(lastFrame()).not.toContain("Edit integration");
    });
  });
});

describe("IntegrationDetailScreen stripe", () => {
  it("shows the webhook URL and recent events with what happened", async () => {
    vi.mocked(getIntegration).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: {
        type: "stripe",
        events: { trial_started: "trial-start" },
        webhookUrl: "https://api.example.com/webhooks/stripe/tok",
        priority: 3,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    } as never);
    vi.mocked(listInboundEvents).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      data: {
        events: [
          {
            source: "stripe",
            externalEventId: "evt_1",
            type: "customer.subscription.created",
            status: "processed",
            matchedEvents: ["trial_started"],
            outcome: "Triggered trial-start",
            subscriberPublicId: "sub_1",
            subscriberEmail: "a@example.com",
            createdAt: new Date().toISOString(),
            processedAt: new Date().toISOString(),
          },
        ],
        limit: 10,
        offset: 0,
      },
    } as never);

    const { lastFrame } = render(
      <IntegrationDetailScreen
        environmentId="test-environment-1"
        type="stripe"
        onDeleted={vi.fn()}
      />,
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Recent events");
    });
    expect(lastFrame()).toContain(
      "webhookUrl: https://api.example.com/webhooks/stripe/tok",
    );
    expect(lastFrame()).toContain(
      "customer.subscription.created → processed: Triggered trial-start",
    );
    expect(lastFrame()).toContain("e edit");
  });
});
