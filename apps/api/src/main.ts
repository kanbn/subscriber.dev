import "reflect-metadata";

import type { NestExpressApplication } from "@nestjs/platform-express";
import type { Request } from "express";
import { NestFactory } from "@nestjs/core";
import { ZodValidationPipe } from "nestjs-zod";
import { PostHogInterceptor } from "posthog-node/nestjs";

import { AppModule } from "./app.module.js";
import { writeOpenApiDocuments } from "./openapi.js";
import { posthog } from "./posthog.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableShutdownHooks(["SIGINT"]);
  (app as NestExpressApplication).set(
    "trust proxy",
    "loopback, linklocal, uniquelocal",
  );
  const mcpUrl = process.env.MCP_URL ? new URL(process.env.MCP_URL) : null;
  if (mcpUrl?.pathname === "/")
    app.use((req: Request, _res: unknown, next: () => void) => {
      if (
        req.path === "/" &&
        (req.get("x-forwarded-host") ?? req.get("host")) === mcpUrl.host
      )
        req.url = `/mcp${req.url.slice(1)}`;
      next();
    });
  (app as NestExpressApplication).useBodyParser("json", { limit: "8mb" });
  (app as NestExpressApplication).useBodyParser("text");

  app.enableCors({
    origin:
      process.env.CORS_ORIGIN ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "http://localhost:3000",
    credentials: true,
  });

  app.useGlobalPipes(new ZodValidationPipe());
  if (posthog)
    app.useGlobalInterceptors(
      new PostHogInterceptor(posthog, { captureExceptions: true }),
    );

  const { publicDocument } = writeOpenApiDocuments(app);
  console.log("📄 OpenAPI spec written to openapi.json");

  app.getHttpAdapter().get("/openapi.json", (req, res) => {
    res.json(publicDocument);
  });

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`🚀 API server running on http://localhost:${port}`);

  const drainMs = 10_000;
  process.once("SIGTERM", () => {
    console.log(`SIGTERM received, draining for ${drainMs / 1000}s`);
    setTimeout(() => app.close().finally(() => process.exit(0)), drainMs);
  });
}

bootstrap();
