# API Reference

Contributor-facing runtime API map for `src/`.

## Services

### `AuthService` (`src/services/authService.ts`)

Responsibilities:

- Detect CLI-compatible auth state from `~/.config/pinecone`.
- Perform OAuth login/logout and token refresh.
- Create/reuse managed API keys for JWT contexts.

Key methods:

- `login(timeoutMs?)`
- `logout()`
- `isAuthenticated()`
- `getAuthContext()`
- `getAccessToken()`
- `getOrCreateManagedKey(projectId, projectName, organizationId)`

### `PineconeService` (`src/services/pineconeService.ts`)

Facade over control/data/assistant/admin/namespace/inference clients.

Key methods/accessors:

- Index: `listIndexes`, `createIndex`, `createIndexForModel`, `describeIndex`, `configureIndex`, `deleteIndex`, `describeIndexStats`
- Assistant: `listAssistants`, `createAssistant`, `describeAssistant`, `deleteAssistant`
- Org/Project: `listOrganizations`, `listProjects` (OperationResult pattern)
- Context: `setProjectId`, `setFullProjectContext`, `clearFullProjectContext`, `clearTargetContext`
- Clients: `getControlPlane`, `getDataPlane`, `getAssistantApi`, `getAdminApi`, `getNamespaceApi`, `getInferenceApi`

## API Clients

### `PineconeClient` (`src/api/client.ts`)

Core authenticated HTTP client with:

- API version header injection,
- auth mode switching (Api-Key vs Bearer + `X-Project-Id`),
- per-request project context override,
- timeout and structured error handling (`PineconeApiError`).

### `ControlPlaneApi` (`src/api/controlPlane.ts`)

Control-plane index/backup/restore operations:

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

Index data-plane operations:

- Query/search: `query`, `search`
- Vector/data ops: `upsertVectors`, `upsertRecords`, `fetchVectors`, `fetchVectorsByMetadata`, `updateVector`, `updateVectorsByMetadata`, `deleteVectors`, `listVectorIds`
- Imports: `startImport`, `listImports`, `describeImport`, `cancelImport`

Notes:

- `search` uses `/records/namespaces/{namespace}/search`.
- Empty namespace is normalized to `__default__`.
- Current Data Ops UI exposes import `start` action.

### `NamespaceApi` (`src/api/namespaceApi.ts`)

Namespace CRUD:

- `listNamespaces(host, params?, projectContext?)`
- `createNamespace(host, params, projectContext?)`
- `describeNamespace(host, namespaceName, projectContext?)`
- `deleteNamespace(host, namespaceName, projectContext?)`

### `AssistantApi` (`src/api/assistantApi.ts`)

Assistant control + data plane operations:

- Control plane: `listAssistants`, `createAssistant`, `describeAssistant`, `updateAssistant`, `deleteAssistant`
- Chat: `chat`, `chatStream`
- Files: `listFiles(host, assistant, projectContext?, metadataFilter?)`, `describeFile`, `uploadFile`, `deleteFile`
- Tools: `retrieveContext`, `evaluateAnswer`

### `InferenceApi` (`src/api/inferenceApi.ts`)

Inference operations:

- `embed(request)`
- `rerank(request)`
- `listModels(type?)`
- `describeModel(modelName)`

### `AdminApiClient` (`src/api/adminApi.ts`)

Admin/org/project/API-key operations:

- Auth: `getAccessToken(clientId, clientSecret)`
- Organizations/Projects: `listOrganizations`, `listProjects`, `createProject`, `describeProject`, `updateProject`, `deleteProject`
- API keys: `createAPIKey`, `listAPIKeys`, `deleteAPIKey`

## Utilities

### `src/api/host.ts`

- `normalizeHost(host)` for protocol-safe host handling.

### `src/utils/inputValidation.ts`

- `parseOptionalJsonObject(input, errorMessage?)`
- `parseOptionalNumberArray(input, errorMessage?)`

### `src/webview/uploadMetadataDialog.ts`

- `UploadMetadataDialog.show(extensionUri, files)` opens the per-file upload metadata dialog.
- `resolveUploadMetadataPayload(payload)` validates dialog payload and returns parsed per-file metadata mapping.

### `src/utils/treeItemHelpers.ts`

- `extractProjectId(item)`
- `buildProjectContextFromItem(item)`
- `setProjectContextFromItem(item, service)`

Organization ID fallback order:

- `metadata.organization.id`, then
- `metadata.project.organization_id`.

### `src/utils/refreshExplorer.ts`

- `refreshExplorer(options?)` is the canonical refresh path used by command handlers.
- Coalesces burst refresh calls and executes one standardized sequence.

### `src/utils/errorHandling.ts`

- `classifyError(error)`
- `isAuthenticationError(error)`
- `isNetworkError(error)`
- `handleError(error, options)`
- `handleTreeProviderError(error, operation)`

## Command Surface

Command IDs are stable in `package.json`; implementation files:

- `src/commands/auth.ts`
- `src/commands/index.commands.ts`
- `src/commands/dataOps.commands.ts`
- `src/commands/assistant.commands.ts`
- `src/commands/assistantTools.commands.ts`
- `src/commands/file.commands.ts`
- `src/commands/namespace.commands.ts`
- `src/commands/project.commands.ts`
- `src/commands/apiKeys.commands.ts`
- `src/commands/inference.commands.ts`

Index-specific webview dialogs:

- `src/webview/createIndexPanel.ts`
- `src/webview/configureIndexPanel.ts`

All mutation commands should route explorer refreshes through `refreshExplorer()`.
