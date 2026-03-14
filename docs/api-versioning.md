# Pinecone API Versioning

This document describes how the extension pins and validates Pinecone API behavior.

## Current Version

The extension sends `X-Pinecone-Api-Version: 2025-10` on API requests.

Source of truth:

- `src/utils/constants.ts`
- `src/api/client.ts`
- `src/api/adminApi.ts` (direct `fetch` calls)

## Request Routing Model

The extension uses four endpoint families:

1. Control plane (`https://api.pinecone.io`): index/backup/restore/assistant control/inference/admin operations.
2. Data plane (`https://{index-host}`): query/search/vector ops/imports/namespaces/index stats.
3. Assistant data plane (`https://{assistant-host}`): chat/files/context/evaluation.
4. OAuth endpoints (`https://auth.pinecone.io`): login/token exchange.

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
- `PATCH /assistant/assistants/{name}`
- `DELETE /assistant/assistants/{name}`
- `POST /inference/embed`
- `POST /inference/rerank`
- `GET /inference/models`
- `GET /inference/models/{model}`
- `GET /admin/organizations`
- `GET /admin/projects`
- `POST /admin/projects`
- `GET /admin/projects/{projectId}`
- `PATCH /admin/projects/{projectId}`
- `DELETE /admin/projects/{projectId}`
- `GET /admin/projects/{projectId}/api-keys`
- `POST /admin/projects/{projectId}/api-keys`
- `DELETE /admin/api-keys/{keyId}`

### Data plane (index host)

- `POST /query`
- `POST /records/namespaces/{namespace}/search`
- `POST /vectors/upsert`
- `POST /records/namespaces/{namespace}/upsert`
- `GET /vectors/fetch`
- `POST /vectors/fetch_by_metadata`
- `POST /vectors/update`
- `POST /vectors/update_by_metadata`
- `POST /vectors/delete`
- `GET /vectors/list`
- `POST /imports`
- `GET /imports`
- `GET /imports/{importId}`
- `POST /imports/{importId}/cancel`
- `GET /namespaces`
- `POST /namespaces`
- `GET /namespaces/{namespace}`
- `DELETE /namespaces/{namespace}`
- `POST /describe_index_stats`

### Assistant data plane (assistant host)

- `POST /assistant/chat/{assistantName}`
- `GET /assistant/files/{assistantName}`
- `POST /assistant/files/{assistantName}`
- `GET /assistant/files/{assistantName}/{fileId}`
- `DELETE /assistant/files/{assistantName}/{fileId}`
- `POST /assistant/context/{assistantName}`
- `POST /assistant/evaluate/{assistantName}`

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

Any API-path, auth-header, or version change must include at least one failing-before/passing-after test for:

- host normalization (`host` vs `https://host`),
- authentication failure classification,
- request shape/path for touched endpoints,
- refresh/UI update behavior for command-side mutations.
