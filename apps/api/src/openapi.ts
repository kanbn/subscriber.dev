import type { INestApplication } from "@nestjs/common";
import type { OpenAPIObject } from "@nestjs/swagger";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { cleanupOpenApiDoc } from "nestjs-zod";

type PathItem = OpenAPIObject["paths"][string];

const METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "patch",
] as const satisfies (keyof PathItem)[];

const INTERNAL_PATHS = ["/mcp", "/unsubscribe", "/bounces/inbound"];

const errorResponseSchema = {
  type: "object",
  properties: {
    statusCode: { type: "integer", example: 404 },
    message: { type: "string", example: "Workflow not found" },
    error: { type: "string", example: "Not Found" },
    errors: {
      description: "Which fields failed validation, on a 400.",
      type: "array",
      items: {
        type: "object",
        properties: {
          path: {
            type: "array",
            items: { anyOf: [{ type: "string" }, { type: "number" }] },
          },
          message: { type: "string" },
          code: { type: "string" },
        },
        required: ["path", "message"],
      },
    },
  },
  required: ["statusCode", "message"],
};

export function openApiDocuments(app: INestApplication) {
  const config = new DocumentBuilder()
    .setOpenAPIVersion("3.1.0")
    .setTitle("subscriber.dev API")
    .setDescription(
      "Trigger workflows, manage subscribers and send broadcasts. Authenticate with an API key in the X-API-Key header. Docs: https://docs.subscriber.dev",
    )
    .setVersion("1.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: undefined,
        description:
          "A session token from `subscriber login`, used by subscriber.dev's own apps. From your own code, use an API key.",
      },
      "bearer",
    )
    .addApiKey(
      {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
        description:
          "An environment API key. Keep it on your server.",
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

  for (const pathItem of Object.values(document.paths)) {
    for (const method of METHODS) {
      const operation = pathItem[method];
      if (operation?.tags) operation.tags = operation.tags.slice(-1);
    }
  }

  const publicDocument: OpenAPIObject = structuredClone({
    ...document,
    paths: Object.fromEntries(
      Object.entries(document.paths).filter(
        ([path]) => !INTERNAL_PATHS.includes(path),
      ),
    ),
  });

  publicDocument.components ??= {};
  publicDocument.components.schemas ??= {};
  publicDocument.components.schemas.ErrorResponse = errorResponseSchema;

  for (const pathItem of Object.values(publicDocument.paths)) {
    for (const method of METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;
      const responses = operation.responses as Record<
        string,
        { description: string; content?: Record<string, unknown> }
      >;
      if (operation.security?.length) {
        responses["401"] ??= { description: "Missing or invalid API key" };
      }
      responses["429"] ??= {
        description: "Rate limited. Wait a second and retry.",
      };
      for (const [status, response] of Object.entries(responses)) {
        if (/^[45]/.test(status)) {
          response.content ??= {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          };
        }
      }
    }
  }

  return { document, publicDocument: withPublicSchemaNames(publicDocument) };
}

const SCHEMA_REF = /"#\/components\/schemas\/([^"]+)"/g;

function schemaRefs(value: unknown) {
  return [...JSON.stringify(value ?? null).matchAll(SCHEMA_REF)].map(
    (match) => match[1],
  );
}

function withPublicSchemaNames(document: OpenAPIObject): OpenAPIObject {
  const schemas = document.components?.schemas ?? {};
  const used = new Set(schemaRefs(document.paths));
  for (const name of used) {
    for (const ref of schemaRefs(schemas[name])) used.add(ref);
  }
  const requestBodies = new Set(
    schemaRefs(
      Object.values(document.paths).flatMap((pathItem) =>
        METHODS.map((method) => pathItem[method]?.requestBody),
      ),
    ),
  );

  const names = new Map<string, string>();
  for (const name of used) {
    const renamed = requestBodies.has(name)
      ? name.replace(/(Body)?Dto$/, "Request")
      : name.replace(/Dto$/, "");
    if ([...names.values()].includes(renamed)) {
      throw new Error(`Two OpenAPI schemas would both be named ${renamed}`);
    }
    names.set(name, renamed);
  }

  const renamed = JSON.parse(
    JSON.stringify(document).replace(
      SCHEMA_REF,
      (_, name: string) => `"#/components/schemas/${names.get(name) ?? name}"`,
    ),
  ) as OpenAPIObject;
  renamed.components = {
    ...renamed.components,
    schemas: Object.fromEntries(
      [...names].map(([name, publicName]) => [
        publicName,
        renamed.components?.schemas?.[name] ?? {},
      ]),
    ),
  };
  return renamed;
}
