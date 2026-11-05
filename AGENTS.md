# Coding Standards for Subscriber.dev

## Database Migrations

- **Always** use `--name="InsertName"` when generating migrations with drizzle-kit
- Migration names should be descriptive and use PascalCase (e.g., `AddPublicIdToSubscriberPreferences`)
- Example: `pnpm with-env drizzle-kit generate --name="AddPublicIdToSubscriberPreferences"`

## API Responses

- **Never** expose internal database IDs (like `id`, `subscriberId`, `environmentId`) in API responses
- Always use `publicId` for resource identification in responses
- Remove internal IDs from response DTOs and service return types

## Repository Pattern

- Use the repository pattern for all database interactions
- Repository functions should be in `packages/db/src/repository/`
- Import repositories as: `import * as repoName from "@subscriber.dev/db/repository/repo-name.repo"`

## Schema Patterns

- All main resources should have a `publicId` field (text, unique, auto-generated with `generateUID()`)
- Use `bigserial` for internal IDs
- Use `bigint` for foreign key references
- Follow existing patterns for timestamps (`createdAt`, `updatedAt`, `deletedAt`)

## Error Handling

- In controllers and services, use NestJS HTTP exceptions (`BadRequestException`, `NotFoundException`, `InternalServerErrorException`)
- Never throw plain `Error` objects from request handlers - use appropriate HTTP exceptions

## Migrations and Deploys

- Production deploys start the new version before stopping the old one, so every migration must work with the previous release
- Add columns and tables first; drop or rename them in a later release once no running code uses them

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
