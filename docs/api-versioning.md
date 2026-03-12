# Pinecone API Versioning

This document describes how the extension pins and validates Pinecone API behavior.

## Current Version

The extension sends `X-Pinecone-Api-Version: 2025-04` on all API requests.

Source of truth:

- `src/utils/constants.ts`
- `src/api/client.ts`

## Request Routing Model

The extension uses three endpoint families:

1. Control plane (`https://api.pinecone.io`): index/project/backup/assistant control operations.
2. Data plane (`https://{index-host}`): query/search/namespaces/index stats.
3. Assistant data plane (`https://{assistant-host}`): chat and file operations.

Host inputs are normalized centrally via `src/api/host.ts`, so both `host` and `https://host` are accepted.

## Endpoint Map (Current Runtime)

### Control plane

- `GET /indexes`
- `POST /indexes`
- `POST /indexes/create-for-model`
- `GET /indexes/{name}`
- `PATCH /indexes/{name}`
- `DELETE /indexes/{name}`
- `GET /indexes/{indexName}/backups`
- `POST /indexes/{indexName}/backups`
- `GET /backups`
- `GET /backups/{backupId}`
- `DELETE /backups/{backupId}`
- `POST /indexes/create-from-backup`
- `GET /restore-jobs`
- `GET /restore-jobs/{restoreJobId}`
- `GET /assistant/assistants`
- `POST /assistant/assistants`
- `GET /assistant/assistants/{name}`
- `DELETE /assistant/assistants/{name}`

### Data plane (index host)

- `POST /query`
- `POST /records/namespaces/{namespace}/search`
- `GET /namespaces`
- `POST /namespaces`
- `GET /namespaces/{namespace}`
- `DELETE /namespaces/{namespace}`
- `POST /describe_index_stats`

### Assistant data plane (assistant host)

- `POST /assistant/chat/{assistantName}`
- `GET /assistant/files/{assistantName}`
- `POST /assistant/files/{assistantName}`
- `DELETE /assistant/files/{assistantName}/{fileId}`

## Version Upgrade Checklist

1. Update `API_VERSION` in `src/utils/constants.ts`.
2. Reconcile `src/api/types.ts` with upstream schema changes.
3. Reconcile API client paths and payloads (`src/api/*.ts`).
4. Run:
   - `npm run check-types`
   - `npm run lint`
   - `npm test`
   - `npm run test:coverage`
5. Run env-gated integration smoke tests:
   - `PINECONE_API_KEY=... PINECONE_INTEGRATION_TESTS=true npm run test:integration`
6. Update docs (`docs/api-reference.md`, `docs/testing.md`, `README.md`).

## Regression Requirements

Any API-path or auth behavior change must include at least one failing-before/passing-after test for:

- host normalization (`host` vs `https://host`),
- authentication failure classification,
- refresh/UI update behavior when command-side mutations complete.
