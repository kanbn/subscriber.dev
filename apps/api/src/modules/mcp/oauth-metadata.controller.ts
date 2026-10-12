import type { Request } from "express";
import { Controller, Get, Header, Req } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";

import { authIssuer, mcpResourceUrls } from "@subscriber.dev/auth/server";

const origin = (request: Request) =>
  `${request.get("x-forwarded-proto")?.split(",")[0] ?? request.protocol}://${request.get("x-forwarded-host") ?? request.get("host") ?? ""}`;

export const protectedResourceMetadataUrl = (request: Request) =>
  `${origin(request)}/.well-known/oauth-protected-resource/mcp`;

@ApiExcludeController()
@Controller(".well-known/oauth-protected-resource")
export class OAuthMetadataController {
  @Get(["", "mcp"])
  @Header("Access-Control-Allow-Origin", "*")
  @Header("Cache-Control", "public, max-age=3600")
  getProtectedResourceMetadata(@Req() request: Request) {
    const resources = mcpResourceUrls();
    const requested = `${origin(request)}/mcp`;
    return {
      resource: resources.includes(requested) ? requested : resources[0],
      authorization_servers: [authIssuer()],
      bearer_methods_supported: ["header"],
      resource_name: "subscriber.dev",
    };
  }
}
