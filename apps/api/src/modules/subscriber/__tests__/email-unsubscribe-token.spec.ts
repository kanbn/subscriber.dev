import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createEmailUnsubscribeLink,
  verifyEmailUnsubscribeToken,
} from "@subscriber.dev/shared/utils";

describe("email unsubscribe token", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.API_BASE_URL = "https://api.example.com";
    process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-secret";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("round-trips a token back to the environment ID and subscriber's public ID", async () => {
    const url = await createEmailUnsubscribeLink(10, "sub_123");
    const token = new URL(url!).searchParams.get("token")!;

    await expect(verifyEmailUnsubscribeToken(token)).resolves.toEqual({
      environmentId: 10,
      subscriberPublicId: "sub_123",
    });
  });

  it("returns null for a tampered token", async () => {
    const url = await createEmailUnsubscribeLink(10, "sub_123");
    const token = new URL(url!).searchParams.get("token")!;
    const tampered = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");

    await expect(verifyEmailUnsubscribeToken(tampered)).resolves.toBeNull();
  });

  it("returns null when signed with a different secret", async () => {
    const url = await createEmailUnsubscribeLink(10, "sub_123");
    const token = new URL(url!).searchParams.get("token")!;

    process.env.EMAIL_UNSUBSCRIBE_SECRET = "different-secret";

    await expect(verifyEmailUnsubscribeToken(token)).resolves.toBeNull();
  });

  it("returns null when env is not configured", async () => {
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;

    await expect(createEmailUnsubscribeLink(10, "sub_123")).resolves.toBeNull();
  });
});
