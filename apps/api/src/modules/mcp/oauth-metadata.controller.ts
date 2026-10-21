import type { Request } from "express";
import { Controller, Get, Header, Req } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";

import { authIssuer, mcpResourceUrls } from "@subscriber.dev/auth/server";

const origin = (request: Request) =>
  `${request.get("x-forwarded-proto")?.split(",")[0] ?? request.protocol}://${request.get("x-forwarded-host") ?? request.get("host") ?? ""}`;

const resourceFor = (request: Request) => {
  const resources = mcpResourceUrls();
  return (
    resources.find((url) => new URL(url).origin === origin(request)) ??
    resources[0]
  );
};

export const protectedResourceMetadataUrl = (request: Request) =>
  `${origin(request)}/.well-known/oauth-protected-resource${new URL(resourceFor(request)).pathname.replace(/\/$/, "")}`;

@ApiExcludeController()
@Controller(".well-known/oauth-protected-resource")
export class OAuthMetadataController {
  @Get(["", "mcp"])
  @Header("Access-Control-Allow-Origin", "*")
  @Header("Cache-Control", "public, max-age=3600")
  getProtectedResourceMetadata(@Req() request: Request) {
    return {
      resource: resourceFor(request),
      authorization_servers: [authIssuer()],
      bearer_methods_supported: ["header"],
      resource_name: "subscriber.dev",
    };
  }
}
