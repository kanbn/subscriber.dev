import { render } from "ink-testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getWorkflow,
  listTriggerSources,
  updateWorkflow,
} from "@subscriber.dev/api-client/cli";

import { WorkflowTriggersScreen } from "../WorkflowTriggersScreen.js";

vi.mock("@subscriber.dev/api-client/cli", () => ({
  getWorkflow: vi.fn(),
  listTriggerSources: vi.fn(),
  updateWorkflow: vi.fn(),
}));

const DOWN = "\u001B[B";

function tick() {
  return new Promise<void>((resolve) => setTimeout(resolve, 50));
}

const stripeEvents = [
  { name: "trial_started", label: "Trial started" },
  { name: "trial_ending", label: "Trial ending (3 days before)" },
];

type TriggerRow = {
  source: string;
  event: string;
  label: string;
  active: boolean;
};

function mockWorkflow(
  triggers: TriggerRow[],
  exitConditions: TriggerRow[] = [],
) {
  vi.mocked(getWorkflow).mockResolvedValue({
    status: 200,
    headers: new Headers(),
    data: { publicId: "wf_1", type: "automation", triggers, exitConditions },
  } as never);
}

function mockSources(connected: boolean) {
  vi.mocked(listTriggerSources).mockResolvedValue({
    status: 200,
    headers: new Headers(),
    data: {
      sources: [
        { source: "stripe", name: "Stripe", connected, events: stripeEvents },
      ],
    },
  } as never);
}

function renderScreen(pickSource?: string, onSetUp = vi.fn()) {
  return {
    onSetUp,
    ...render(
      <WorkflowTriggersScreen
        environmentId="env_1"
        workflowId="wf_1"
        pickSource={pickSource}
        onSetUp={onSetUp}
      />,
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateWorkflow).mockResolvedValue({
    status: 200,
    headers: new Headers(),
    data: {},
  } as never);
});

describe("WorkflowTriggersScreen", () => {
  it("lists triggers, marking ones whose integration is disconnected", async () => {
    mockWorkflow([
      {
        source: "stripe",
        event: "trial_started",
        label: "Trial started",
        active: false,
      },
    ]);
    mockSources(false);
    const { lastFrame } = renderScreen();

    await vi.waitFor(() => {
      expect(lastFrame()).toContain(
        "Stripe · Trial started (inactive: integration disconnected)",
      );
    });
    expect(lastFrame()).toContain("+ Add trigger");
  });

  it("adds the events ticked for a connected source", async () => {
    mockWorkflow([]);
    mockSources(true);
    const { lastFrame, stdin } = renderScreen();

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("+ Add trigger");
    });
    await tick();
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Stripe");
    });
    await tick();
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("[ ] Trial started");
    });

    await tick();
    stdin.write(DOWN);
    await tick();
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("[x] Trial ending (3 days before)");
    });
    expect(lastFrame()).toContain("[ ] Trial started");

    for (let i = 0; i < 2; i++) {
      await tick();
      stdin.write(DOWN);
    }
    await tick();
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(updateWorkflow).toHaveBeenCalledWith("env_1", "wf_1", {
        triggers: [{ source: "stripe", event: "trial_ending" }],
      });
    });
  });

  it("adds a custom event type with a reminder to enable it in the source, keeping it listed once unticked", async () => {
    mockWorkflow([]);
    mockSources(true);
    const { lastFrame, stdin } = renderScreen("stripe");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("+ Other Stripe event type…");
    });
    for (let i = 0; i < 2; i++) {
      await tick();
      stdin.write(DOWN);
    }
    await tick();
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Event type");
    });
    await tick();
    stdin.write("checkout.session.completed");
    await tick();
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("[x] checkout.session.completed");
    });
    expect(lastFrame()).toContain(
      "Also enable checkout.session.completed on your Stripe webhook",
    );

    for (let i = 0; i < 2; i++) {
      await tick();
      stdin.write(DOWN);
    }
    await tick();
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("[ ] checkout.session.completed");
    });
    expect(lastFrame()).not.toContain("Also enable");
  });

  it("sends you to set up a source that isn't connected, instead of letting you pick its events", async () => {
    mockWorkflow([]);
    mockSources(false);
    const { lastFrame, stdin, onSetUp } = renderScreen();

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("+ Add trigger");
    });
    await tick();
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Stripe · not connected — set it up");
    });
    await tick();
    stdin.write("\r");

    expect(onSetUp).toHaveBeenCalledWith("stripe", "triggers");
    expect(updateWorkflow).not.toHaveBeenCalled();
  });

  it("opens straight into the event picker after setting up a source, with existing triggers ticked", async () => {
    mockWorkflow([
      {
        source: "stripe",
        event: "trial_started",
        label: "Trial started",
        active: true,
      },
    ]);
    mockSources(true);
    const { lastFrame } = renderScreen("stripe");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("[x] Trial started");
    });
    expect(lastFrame()).toContain("[ ] Trial ending (3 days before)");
  });

  it("removes a trigger after confirming", async () => {
    mockWorkflow([
      {
        source: "stripe",
        event: "trial_started",
        label: "Trial started",
        active: true,
      },
      {
        source: "stripe",
        event: "payment_failed",
        label: "Payment failed",
        active: true,
      },
    ]);
    mockSources(true);
    const { lastFrame, stdin } = renderScreen();

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("Stripe · Trial started");
    });
    await tick();
    stdin.write("\r");
    await vi.waitFor(() => {
      expect(lastFrame()).toContain(
        "Remove the trigger stripe · trial_started?",
      );
    });
    // The prompt defaults to cancel; move to confirm.
    await tick();
    stdin.write(DOWN);
    await tick();
    stdin.write("\r");

    await vi.waitFor(() => {
      expect(updateWorkflow).toHaveBeenCalledWith("env_1", "wf_1", {
        triggers: [{ source: "stripe", event: "payment_failed" }],
      });
    });
  });

  describe("exit conditions", () => {
    it("adds an exit condition, saving it apart from the triggers", async () => {
      mockWorkflow([
        {
          source: "stripe",
          event: "trial_started",
          label: "Trial started",
          active: true,
        },
      ]);
      mockSources(true);
      const { lastFrame, stdin } = renderScreen();

      await vi.waitFor(() => {
        expect(lastFrame()).toContain("+ Add exit condition");
      });
      for (let i = 0; i < 2; i++) {
        await tick();
        stdin.write(DOWN);
      }
      await tick();
      stdin.write("\r");
      await vi.waitFor(() => {
        expect(lastFrame()).not.toContain("+ Add exit condition");
      });
      await tick();
      stdin.write("\r");
      await vi.waitFor(() => {
        expect(lastFrame()).toContain("Stripe events that exit this");
      });
      expect(lastFrame()).toContain("[ ] Trial started");

      await tick();
      stdin.write("\r");
      await vi.waitFor(() => {
        expect(lastFrame()).toContain("[x] Trial started");
      });
      for (let i = 0; i < 3; i++) {
        await tick();
        stdin.write(DOWN);
      }
      await tick();
      stdin.write("\r");

      await vi.waitFor(() => {
        expect(updateWorkflow).toHaveBeenCalledWith("env_1", "wf_1", {
          exitConditions: [{ source: "stripe", event: "trial_started" }],
        });
      });
    });

    it("lists exit conditions and removes one after confirming", async () => {
      mockWorkflow(
        [],
        [
          {
            source: "stripe",
            event: "trial_ending",
            label: "Trial ending (3 days before)",
            active: true,
          },
        ],
      );
      mockSources(true);
      const { lastFrame, stdin } = renderScreen();

      await vi.waitFor(() => {
        expect(lastFrame()).toContain(
          "Exits · Stripe · Trial ending (3 days before)",
        );
      });
      await tick();
      stdin.write("\r");
      await vi.waitFor(() => {
        expect(lastFrame()).toContain(
          "Remove the exit condition stripe · trial_ending?",
        );
      });
      await tick();
      stdin.write(DOWN);
      await tick();
      stdin.write("\r");

      await vi.waitFor(() => {
        expect(updateWorkflow).toHaveBeenCalledWith("env_1", "wf_1", {
          exitConditions: [],
        });
      });
    });

    it("tells set-up which list to come back to", async () => {
      mockWorkflow([]);
      mockSources(false);
      const { lastFrame, stdin, onSetUp } = renderScreen();

      await vi.waitFor(() => {
        expect(lastFrame()).toContain("+ Add exit condition");
      });
      await tick();
      stdin.write(DOWN);
      await tick();
      stdin.write("\r");
      await vi.waitFor(() => {
        expect(lastFrame()).toContain("not connected — set it up");
      });
      await tick();
      stdin.write("\r");

      expect(onSetUp).toHaveBeenCalledWith("stripe", "exitConditions");
    });
  });
});
