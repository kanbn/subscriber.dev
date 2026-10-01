import { vi } from "vitest";

import type { InboundSource } from "../inboundSource.js";

export const fakeSource = {
  source: "fake",
  name: "Fake",
  events: [{ name: "signed_up", label: "Signed up" }],
  eventsToEnable: ["user.created"],
  verifyWebhook: vi.fn(),
  match: vi.fn(),
  personRef: vi.fn(),
  fetchPerson: vi.fn(),
  templateData: vi.fn(),
} satisfies InboundSource<unknown>;
