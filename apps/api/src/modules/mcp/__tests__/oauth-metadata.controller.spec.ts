import type { Request } from "express";
import { describe, expect, it, vi } from "vitest";

import {
  OAuthMetadataController,
  protectedResourceMetadataUrl,
} from "../oauth-metadata.controller.js";

vi.mock("@subscriber.dev/auth/server", () => ({
  mcpResourceUrls: () => [
    "https://mcp.example.com",
    "https://api.example.com/mcp",
  ],
  authIssuer: () => "https://example.com/api/auth",
}));

const request = (host: string) =>
  ({
    protocol: "https",
    get: (name: string) => (name === "host" ? host : undefined),
  }) as unknown as Request;

describe("OAuthMetadataController", () => {
  const controller = new OAuthMetadataController();

  it("names the root resource on the MCP host", () => {
    const req = request("mcp.example.com");
    expect(controller.getProtectedResourceMetadata(req).resource).toBe(
      "https://mcp.example.com",
    );
    expect(protectedResourceMetadataUrl(req)).toBe(
      "https://mcp.example.com/.well-known/oauth-protected-resource",
    );
  });

  it("names the /mcp resource on the API host", () => {
    const req = request("api.example.com");
    expect(controller.getProtectedResourceMetadata(req).resource).toBe(
      "https://api.example.com/mcp",
    );
    expect(protectedResourceMetadataUrl(req)).toBe(
      "https://api.example.com/.well-known/oauth-protected-resource/mcp",
    );
  });

  it("falls back to the first resource on an unknown host", () => {
    expect(
      controller.getProtectedResourceMetadata(request("other.example.com"))
        .resource,
    ).toBe("https://mcp.example.com");
  });
});
