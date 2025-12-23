# Subscriber.dev API

REST API for Subscriber - A Customer.io alternative.

## Overview

This is the standalone NestJS REST API for Subscriber.dev. It provides a type-safe REST API with OpenAPI docs.

## Development

```bash
# Install dependencies (from root)
pnpm install

# Run in development mode
pnpm dev

# Build
pnpm build

# Start production server
pnpm start
```

## API Documentation

Once the server is running, visit:

- Swagger UI: http://localhost:3001/api-docs
- OpenAPI JSON: http://localhost:3001/api-docs-json

## Environment Variables

Required:

- `POSTGRES_URL` - PostgreSQL connection string
- `BETTER_AUTH_SECRET` - Secret for authentication

Optional:

- `PORT` - Server port (default: 3001)
- `CORS_ORIGIN` - CORS origin (default: \*)
- `S3_*` - S3 configuration for file storage

## Architecture

- **Controllers** - Handle HTTP requests/responses
- **Services** - Business logic
- **DTOs** - Data Transfer Objects for validation
- **Guards** - Authentication and authorization
- **Modules** - NestJS module organization
