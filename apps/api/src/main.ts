import "reflect-metadata";

import { existsSync, writeFileSync } from "fs";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { cleanupOpenApiDoc, ZodValidationPipe } from "nestjs-zod";

import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  (app as NestExpressApplication).useBodyParser("json", { limit: "8mb" });

  app.enableCors({
    origin:
      process.env.CORS_ORIGIN ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "http://localhost:3000",
    credentials: true,
  });

  app.useGlobalPipes(new ZodValidationPipe());

  const config = new DocumentBuilder()
    .setOpenAPIVersion("3.1.0")
    .setTitle("Subscriber API")
    .setDescription("REST API for Subscriber - Customer.io alternative")
    .setVersion("1.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Enter JWT token",
      },
      "bearer",
    )
    .addApiKey(
      {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
        description: "Enter API key",
      },
      "api-key",
    )
    .addServer("https://api.subscriber.dev", "Cloud")
    .build();

  // Required by nestjs-zod: hoists recursive/nested schemas (e.g. the
  // audience condition tree) out of inline $defs into proper
  // components.schemas entries with resolvable $refs. Without this, tools
  // like orval can't resolve the raw document's local $defs refs.
  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));

  for (const path of ["/mcp", "/unsubscribe", "/bounces/inbound"])
    for (const operation of Object.values(document.paths[path] ?? {}))
      Object.assign(operation, { "x-excluded": true });

  const spec = JSON.stringify(document, null, 2);
  writeFileSync("./openapi.json", spec);
  if (existsSync("../docs")) writeFileSync("../docs/openapi.json", spec);
  console.log("📄 OpenAPI spec written to openapi.json");

  app.getHttpAdapter().get("/openapi.json", (req, res) => {
    res.json(document);
  });

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`🚀 API server running on http://localhost:${port}`);
}

bootstrap();
