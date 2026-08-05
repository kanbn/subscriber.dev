import "reflect-metadata";

import { writeFileSync } from "fs";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { ZodValidationPipe } from "nestjs-zod";

import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  });

  app.useGlobalPipes(new ZodValidationPipe());

  const config = new DocumentBuilder()
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
    .addServer(
      process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000",
      "Development",
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  writeFileSync("./openapi.json", JSON.stringify(document, null, 2));
  console.log("📄 OpenAPI spec written to openapi.json");

  app.getHttpAdapter().get("/openapi.json", (req, res) => {
    res.json(document);
  });

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`🚀 API server running on http://localhost:${port}`);
}

bootstrap();
