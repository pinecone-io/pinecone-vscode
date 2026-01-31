# Pinecone API Versioning

This document describes how the VSCode extension handles Pinecone API versioning and provides guidance for updating to new API versions.

## Current API Version

The extension currently uses **API version `2025-04`**.

This version is defined in `src/utils/constants.ts`:

```typescript
export const API_VERSION = '2025-04';
```

## How API Versioning Works

The Pinecone API uses date-based versioning. The version is sent with every API request via the `X-Pinecone-Api-Version` header.

### Benefits of API Versioning

1. **Stability**: Your application won't break when Pinecone makes breaking changes
2. **Predictability**: You control when to adopt new API features
3. **Compatibility**: Responses match the documented schema for that version

### Version Header

All requests from the extension include:

```http
X-Pinecone-Api-Version: 2025-04
```

This is set in the HTTP client (`src/api/client.ts`).

## Updating API Version

When Pinecone releases a new API version with features you want to use:

### Step 1: Review Changes

1. Check the [Pinecone API Changelog](https://docs.pinecone.io/reference/api/changelog)
2. Note any breaking changes or new features
3. Identify affected API clients and types

### Step 2: Update Version Constant

Update `src/utils/constants.ts`:

```typescript
export const API_VERSION = '2025-XX';  // New version
```

### Step 3: Update Type Definitions

Review and update `src/api/types.ts` to match the new API schema:

1. Check for new fields added to existing types
2. Check for removed or renamed fields
3. Check for new enum values
4. Add types for new endpoints

### Step 4: Update API Clients

Update API client methods in:
- `src/api/controlPlane.ts`
- `src/api/dataPlane.ts`
- `src/api/assistantApi.ts`
- `src/api/namespaceApi.ts`
- `src/api/adminApi.ts`

### Step 5: Update Tests

1. Update test fixtures in `test-fixtures/`
2. Update mock responses in test files
3. Run the full test suite
4. Add tests for new features

### Step 6: Update Documentation

1. Update this file with the new version
2. Update `README.md` if user-facing features changed
3. Update `docs/api-reference.md` with new endpoints

## API Reference by Category

### Control Plane API

Base URL: `https://api.pinecone.io`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/indexes` | GET | List all indexes |
| `/indexes` | POST | Create an index |
| `/indexes/{name}` | GET | Describe an index |
| `/indexes/{name}` | PATCH | Configure an index |
| `/indexes/{name}` | DELETE | Delete an index |
| `/indexes/{name}/backups` | GET | List index backups |
| `/indexes/{name}/backups` | POST | Create a backup |
| `/backups/{backupId}` | GET | Describe a backup |
| `/backups/{backupId}` | DELETE | Delete a backup |
| `/indexes/create-from-backup` | POST | Restore from backup |
| `/restore-jobs` | GET | List restore jobs |
| `/restore-jobs/{jobId}` | GET | Describe restore job |

### Data Plane API

Base URL: `https://{index-host}`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/query` | POST | Query vectors (BYO vectors) |
| `/records/search` | POST | Search records (integrated embeddings) |
| `/namespaces` | GET | List namespaces |
| `/namespaces/{namespace}` | GET | Describe namespace |
| `/namespaces/{namespace}` | DELETE | Delete namespace |
| `/describe_index_stats` | GET | Get index statistics |

### Assistant API

Base URL: `https://{assistant-host}`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/chat/completions` | POST | Chat with assistant |
| `/files` | GET | List files |
| `/files` | POST | Upload file |
| `/files/{fileId}` | DELETE | Delete file |

### Admin API

Base URL: `https://api.pinecone.io`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/organizations` | GET | List organizations |
| `/projects` | GET | List projects |
| `/projects` | POST | Create project |
| `/projects/{projectId}` | DELETE | Delete project |
| `/projects/{projectId}/api-keys` | POST | Create API key |

## Backward Compatibility

The extension maintains backward compatibility through:

1. **Optional fields**: New fields are typed as optional
2. **Type guards**: Runtime checks for field existence
3. **Fallbacks**: Sensible defaults when fields are missing

Example:

```typescript
// Handle both old and new response format
const status = index.status?.state || 'Unknown';
const recordCount = backup.record_count ?? 0;
```

## Testing API Changes

Before releasing an API version update:

1. Run unit tests: `npm test`
2. Run integration tests (with credentials):
   ```bash
   export PINECONE_API_KEY=your-key
   export PINECONE_INTEGRATION_TESTS=true
   npm test
   ```
3. Manual testing:
   - Create/delete indexes
   - Query with both vector and text
   - Create/restore backups
   - Chat with assistants
   - Upload/delete files

## Reporting API Issues

If you encounter issues with the API:

1. Check the current API version in the Output panel
2. Compare with Pinecone's latest documented version
3. Check if the issue is version-specific
4. Report issues on [GitHub](https://github.com/pinecone-io/pinecone-vscode/issues)

Include in your report:
- Extension version
- API version (from constants.ts)
- Full error message
- Steps to reproduce
