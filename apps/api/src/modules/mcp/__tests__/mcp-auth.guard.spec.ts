import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { verifyMcpAccessToken } from "@subscriber.dev/auth/server";

import { resolveSessionFromHeaders } from "../../../common/guards/session.util.js";
import { McpAuthGuard } from "../mcp-auth.guard.js";

vi.mock("@subscriber.dev/auth/server", () => ({
  verifyMcpAccessToken: vi.fn(),
  mcpResourceUrls: () => ["https://mcp.example.com/mcp"],
  authIssuer: () => "https://example.com/api/auth",
}));

vi.mock("../../../common/guards/session.util.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  resolveSessionFromHeaders: vi.fn(),
  getAuth: () => ({ db: "db", auth: "auth" }),
}));

const user = { id: "1", email: "user@example.com" };

function makeContext(headers: Record<string, string>) {
  const request: Record<string, unknown> = {
    headers,
    protocol: "https",
    get: (name: string) => headers[name.toLowerCase()],
  };
  const response = { setHeader: vi.fn() };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  return { context, request, response };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveSessionFromHeaders).mockRejectedValue(
    new UnauthorizedException(),
  );
});

describe("McpAuthGuard", () => {
  it("lets API keys and sessions through without checking OAuth", async () => {
    vi.mocked(resolveSessionFromHeaders).mockResolvedValue({
      user,
      db: "db",
      auth: "auth",
    } as never);
    const { context, request } = makeContext({ "x-api-key": "key" });

    await expect(new McpAuthGuard().canActivate(context)).resolves.toBe(true);
    expect(request.user).toBe(user);
    expect(verifyMcpAccessToken).not.toHaveBeenCalled();
  });

  it("accepts an OAuth access token", async () => {
    vi.mocked(verifyMcpAccessToken).mockResolvedValue(user as never);
    const { context, request } = makeContext({
      authorization: "Bearer token-123",
    });

    await expect(new McpAuthGuard().canActivate(context)).resolves.toBe(true);
    expect(verifyMcpAccessToken).toHaveBeenCalledWith("auth", "token-123");
    expect(request.user).toBe(user);
    expect(request.db).toBe("db");
  });

  it.each([
    ["no credentials", {}],
    ["an invalid token", { authorization: "Bearer bad" }],
  ])(
    "rejects %s and points the client at the sign-in metadata",
    async (_, headers: Record<string, string>) => {
      vi.mocked(verifyMcpAccessToken).mockRejectedValue(new Error("invalid"));
      const { context, response } = makeContext({
        host: "mcp.example.com",
        ...headers,
      });

      await expect(new McpAuthGuard().canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(response.setHeader).toHaveBeenCalledWith(
        "WWW-Authenticate",
        'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp"',
      );
    },
  );
});
