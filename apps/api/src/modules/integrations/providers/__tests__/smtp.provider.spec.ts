import { afterEach, describe, expect, it, vi } from "vitest";

import { isPrivateAddress, resolveSmtpHost } from "../smtp.provider.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1",
    "10.0.1.5",
    "172.18.0.3",
    "192.168.1.1",
    "169.254.169.254",
    "0.0.0.0",
    "::1",
    "::",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
  ])("blocks %s", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "172.32.0.1", "2606:4700::1111", "::ffff:8.8.8.8"])(
    "allows %s",
    (address) => {
      expect(isPrivateAddress(address)).toBe(false);
    },
  );
});

describe("resolveSmtpHost", () => {
  it("rejects hosts that resolve to private addresses", async () => {
    await expect(resolveSmtpHost("localhost")).rejects.toThrow(
      "isn't a public SMTP server",
    );
    await expect(resolveSmtpHost("169.254.169.254")).rejects.toThrow(
      "isn't a public SMTP server",
    );
  });

  it("connects to the checked IP and keeps the hostname for TLS", async () => {
    await expect(resolveSmtpHost("8.8.8.8")).resolves.toEqual({
      host: "8.8.8.8",
      servername: undefined,
    });
  });

  it("allows private hosts when self-hosting opts in", async () => {
    vi.stubEnv("SMTP_ALLOW_PRIVATE_HOSTS", "true");
    await expect(resolveSmtpHost("localhost")).resolves.toEqual({
      host: "localhost",
    });
  });
});
