# API Reference

This is the contributor-facing API map for runtime code in `src/`.

## Services

### `AuthService` (`src/services/authService.ts`)

Responsibilities:

- Detect CLI-compatible auth state from `~/.config/pinecone`.
- Perform OAuth login/logout.
- Refresh OAuth tokens.
- Create/reuse managed API keys for JWT contexts.

Key methods:

- `login(timeoutMs?)`
- `logout()`
- `isAuthenticated()`
- `getAuthContext()`
- `getAccessToken()`
- `getOrCreateManagedKey(projectId, projectName, organizationId)`

### `PineconeService` (`src/services/pineconeService.ts`)

Facade that composes control/data/assistant/admin/namespace clients.

Key methods:

- Index: `listIndexes`, `createIndex`, `createIndexForModel`, `describeIndex`, `configureIndex`, `deleteIndex`, `describeIndexStats`
- Assistant: `listAssistants`, `createAssistant`, `describeAssistant`, `deleteAssistant`
- Org/Project: `listOrganizations`, `listProjects` (OperationResult pattern)
- Context: `setProjectId`, `setFullProjectContext`, `clearFullProjectContext`, `clearTargetContext`

## API Clients

### `PineconeClient` (`src/api/client.ts`)

Core authenticated HTTP client with:

- API version header injection,
- auth mode switching (Api-Key vs Bearer + `X-Project-Id`),
- per-request project context override,
- timeout and structured error handling (`PineconeApiError`).

### `ControlPlaneApi` (`src/api/controlPlane.ts`)

Control-plane index/backup/restore operations.

Selected methods:

- `listIndexes(projectContext?)`
- `createIndex(index)`
- `createIndexForModel(request)`
- `describeIndex(name, projectContext?)`
- `configureIndex(name, config)`
- `deleteIndex(name)`
- `describeIndexStats(host)`
- `createBackup`, `listBackups`, `describeBackup`, `deleteBackup`
- `createIndexFromBackup`, `listRestoreJobs`, `describeRestoreJob`

### `DataPlaneApi` (`src/api/dataPlane.ts`)

Index data-plane operations.

- `query(host, { top_k, vector|id, ... }, projectContext?)`
- `search(host, { namespace, query, fields?, rerank? }, projectContext?)`

Notes:

- `search` uses `/records/namespaces/{namespace}/search`.
- Empty namespace is normalized to `__default__`.

### `NamespaceApi` (`src/api/namespaceApi.ts`)

Namespace CRUD on index hosts.

- `listNamespaces(host, params?, projectContext?)`
- `createNamespace(host, params, projectContext?)`
- `describeNamespace(host, namespaceName, projectContext?)`
- `deleteNamespace(host, namespaceName, projectContext?)`

### `AssistantApi` (`src/api/assistantApi.ts`)

Assistant control + data plane operations.

- Control plane: `listAssistants`, `createAssistant`, `describeAssistant`, `deleteAssistant`
- Data plane: `chat`, `chatStream`, `listFiles`, `uploadFile`, `deleteFile`

## Utilities

### `src/api/host.ts`

- `normalizeHost(host)` ensures protocol-safe host handling.

### `src/utils/treeItemHelpers.ts`

- `extractProjectId(item)`
- `buildProjectContextFromItem(item)`
- `setProjectContextFromItem(item, service)`

Organization ID fallback is:

- `metadata.organization.id` first,
- then `metadata.project.organization_id`.

### `src/utils/refreshExplorer.ts`

- `refreshExplorer(options?)` is the canonical refresh path used by command handlers.
- It coalesces burst refresh calls and executes one standardized sequence.

### `src/utils/errorHandling.ts`

Canonical classifier/handlers:

- `classifyError(error)`
- `isAuthenticationError(error)`
- `isNetworkError(error)`
- `handleError(error, options)`
- `handleTreeProviderError(error, operation)`

## Command Surface

Commands keep IDs stable in `package.json`; implementation files:

- `src/commands/auth.ts`
- `src/commands/index.commands.ts`
- `src/commands/assistant.commands.ts`
- `src/commands/file.commands.ts`
- `src/commands/namespace.commands.ts`
- `src/commands/project.commands.ts`

All mutation commands should route explorer updates through `refreshExplorer()`.
