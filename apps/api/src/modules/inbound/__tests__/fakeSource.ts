import type { Mock } from "vitest";
import { vi } from "vitest";

import type { InboundSource } from "../inboundSource.js";

export const fakeSource = {
  source: "fake",
  name: "Fake",
  events: [{ name: "signed_up", label: "Signed up" }],
  eventsToEnable: ["user.created"],
  verifyWebhook: vi.fn() as Mock,
  match: vi.fn() as Mock,
  personRef: vi.fn() as Mock,
  fetchPerson: vi.fn() as Mock,
  templateData: vi.fn() as Mock,
  enrich: vi.fn() as Mock,
} satisfies InboundSource<unknown>;
