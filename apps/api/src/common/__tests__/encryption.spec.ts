import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { decrypt, encrypt } from "../encryption.js";

const originalKey = process.env.INTEGRATIONS_ENCRYPTION_KEY;

afterEach(() => {
  process.env.INTEGRATIONS_ENCRYPTION_KEY = originalKey;
});

describe("with a valid 32-byte key", () => {
  beforeEach(() => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY =
      randomBytes(32).toString("base64");
  });

  it("round-trips a plaintext value", () => {
    const plaintext = JSON.stringify({ password: "s3cret" });
    const encrypted = encrypt(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("rejects a tampered ciphertext", () => {
    const encrypted = encrypt("hello");
    const [iv, tag, data] = encrypted.split(".");
    const tamperedData = Buffer.from(data!, "base64");
    tamperedData[0] = tamperedData[0]! ^ 0xff;
    const tampered = [iv, tag, tamperedData.toString("base64")].join(".");

    expect(() => decrypt(tampered)).toThrow();
  });

  it("rejects decryption with a different key", () => {
    const encrypted = encrypt("hello");
    process.env.INTEGRATIONS_ENCRYPTION_KEY =
      randomBytes(32).toString("base64");

    expect(() => decrypt(encrypted)).toThrow();
  });
});

describe("with a misconfigured key", () => {
  it("throws a clear error when unset", () => {
    delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
    expect(() => encrypt("hello")).toThrow(
      "INTEGRATIONS_ENCRYPTION_KEY is not set",
    );
  });

  it("throws a clear error when it doesn't decode to 32 bytes", () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY =
      randomBytes(16).toString("base64");
    expect(() => encrypt("hello")).toThrow(
      "INTEGRATIONS_ENCRYPTION_KEY must decode to exactly 32 bytes (got 16)",
    );
  });
});
