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
