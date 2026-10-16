import "reflect-metadata";

import { existsSync, writeFileSync } from "fs";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { NestFactory } from "@nestjs/core";
import { ZodValidationPipe } from "nestjs-zod";

import { AppModule } from "./app.module.js";
import { openApiDocuments } from "./openapi.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  (app as NestExpressApplication).set(
    "trust proxy",
    "loopback, linklocal, uniquelocal",
  );
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

  const { document, publicDocument } = openApiDocuments(app);
  writeFileSync("./openapi.json", JSON.stringify(document, null, 2));
  if (existsSync("../docs")) {
    writeFileSync(
      "../docs/openapi.json",
      JSON.stringify(publicDocument, null, 2),
    );
  }
  console.log("📄 OpenAPI spec written to openapi.json");

  app.getHttpAdapter().get("/openapi.json", (req, res) => {
    res.json(publicDocument);
  });

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`🚀 API server running on http://localhost:${port}`);
}

bootstrap();
