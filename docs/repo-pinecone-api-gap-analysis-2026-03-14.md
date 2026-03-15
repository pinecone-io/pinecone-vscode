# Pinecone VS Code Extension + Pinecone API Gap Analysis

Date: March 14, 2026 (America/Los_Angeles)
Workspace: `/Users/gavin/Documents/Development/pinecone/pinecone-vscode`
Scope type: Analysis-only (no code/interface changes)

## 1) Scope, method, and evidence

This report consolidates:

1. Full repository analysis of behavior, module responsibilities, command/webview flows, external calls, tests, and standards.
2. Pinecone API reference analysis for:
- `https://docs.pinecone.io/reference/api/`
- `https://docs.pinecone.io/reference/api/assistant/`
3. A capability gap map of Pinecone API (2025-10 latest) vs this extension's user-facing surface, including parameter-level omissions.
4. Prioritized recommendations.

Evidence sources:

- Repository source code, docs, and tests in current workspace state.
- Fresh local validation runs:
- `npm run check-types`
- `npm run lint`
- `npm test`
- `npm run test:integration`
- Live Pinecone docs crawl and operation extraction from `docs.pinecone.io` as of March 14, 2026.

Notes:

- The git worktree is currently dirty with many local modifications; this analysis targets the current workspace state as-is.
- Pinecone docs show `2025-10` as latest in the API reference UI.

## 2) Executive summary

The extension is a broad Pinecone workflow client inside VS Code covering:

- Auth and project/org context selection.
- Index lifecycle and operations (including backup/restore and namespaces).
- Assistant lifecycle/chat/files/tools.
- Admin project and API key management.
- Inference toolbox (embed/rerank/model list).

Pinecone API coverage results (canonical 2025-10 operation set from docs pages):

- Supported: 31/64
- Partially supported (parameter gaps): 18/64
- Not offered: 15/64

Largest missing/partial areas:

- Collections API (entirely absent).
- Import lifecycle completeness (list/describe/cancel missing from UX).
- Assistant OpenAI-compatible chat completions endpoint absent.
- Admin API key detail/update absent.
- Advanced parameters are omitted on several already-supported operations (query/search/embed/rerank/index create/configure/context retrieval).

Quality gates on current workspace state:

- `check-types`: pass
- `lint`: pass
- `test`: pass (`459 passing`)
- `test:integration`: pass with env gate behavior (`0 passing, 1 pending`) because integration credentials were not enabled in this environment.

## 3) What this repo does end-to-end

This is a VS Code extension (`pinecone.pinecone-vscode`) that lets users manage Pinecone resources from the sidebar and webviews.

Core flow:

1. Activation (`src/extension.ts`) wires services, tree provider, and all commands.
2. Auth state determines tree shape:
- API key auth: project-scoped resources directly.
- OAuth/service account (JWT): organization -> project -> resources.
3. Commands open focused webviews or run direct operations.
4. Service/API layers execute Pinecone control/data/assistant/admin/inference API calls.
5. Tree refreshes and output messages keep UI state consistent.

## 4) Runtime entrypoints and user-facing capability matrix

Activation and entrypoints:

- `onView:pineconeExplorer`
- `onCommand:pinecone.login`
- `onStartupFinished`

33 contributed commands are registered in `src/extension.ts` and surfaced via tree context menus, view title actions, and command palette.

High-level feature map:

- Authentication:
- Login, logout, refresh, open docs.
- Organization/project:
- List orgs/projects (JWT), create/rename/delete project, manage API keys.
- Indexes:
- Create standard index.
- Create integrated-embedding index.
- Configure index (deletion protection, tags).
- Delete index.
- Query/search panel.
- Index stats view.
- Backups: create/list/restore/delete + list restore jobs.
- Namespaces:
- List/create/describe/delete.
- Data Ops:
- Upsert vectors, upsert records, fetch vectors, fetch by metadata, update vector, update by metadata, delete vectors, list vector IDs, start import.
- Assistants:
- List/create/describe/update/delete.
- Chat (sync + streaming).
- Retrieve context.
- Evaluate answer.
- Files:
- List/upload/delete/describe + signed-URL preview.
- Inference:
- Model list (typed), embed, rerank.

## 5) Command-to-functionality mapping

Command registration is centralized in `src/extension.ts`, then delegated to command handler classes in `src/commands/*`.

Key command groups:

- Auth commands: `AuthCommands`
- Index/backups/stats/query/config: `IndexCommands`
- Assistant lifecycle/chat: `AssistantCommands`
- Assistant tools (update/context/evaluate): `AssistantToolsCommands`
- File ops: `FileCommands`
- Namespace ops: `NamespaceCommands`
- Project/admin ops: `ProjectCommands` and `ApiKeysCommands`
- Data ops panel launcher: `DataOpsCommands`
- Inference toolbox launcher: `InferenceCommands`

User-facing context behavior is controlled by `package.json` `menus.view/item/context` rules keyed by `PineconeItemType` context values in `src/providers/treeItems.ts`.

## 6) Module responsibilities and side effects

### `src/services`

- `authService.ts`
- OAuth PKCE login flow with local callback server (`127.0.0.1:59049`).
- Token refresh and organization scope switching for OAuth.
- Managed API key creation/reuse for JWT contexts.
- Auth-context propagation to VS Code context keys (`pinecone.isAuthenticated`, `pinecone.authContext`).
- `configService.ts`
- CLI-compatible YAML read/write in `~/.config/pinecone`.
- Persists target organization/project selection.
- `pineconeService.ts`
- Facade over all API clients.
- Handles project context restore/persistence and accessors for control/data/assistant/admin/namespace/inference APIs.

### `src/providers`

- `pineconeTreeDataProvider.ts`
- Builds auth-sensitive tree hierarchy.
- Resolves project context per node to avoid race conditions.
- Handles stale metadata recovery and user-facing error notifications.
- `treeItems.ts`
- Defines item types, metadata contract, IDs, and icons.

### `src/api`

- `client.ts`
- Shared HTTP client with:
- API version header injection.
- Bearer vs Api-Key auth selection.
- Managed-key retry self-heal on auth failures.
- timeout/error parsing.
- `controlPlane.ts`, `dataPlane.ts`, `assistantApi.ts`, `adminApi.ts`, `namespaceApi.ts`, `inferenceApi.ts`
- Endpoint-specific API wrappers with typed requests/responses.

### `src/webview`

- `queryPanel.ts`
- Vector query and integrated text search UI.
- JSON parsing and clipboard copy actions.
- `dataOpsPanel.ts`
- Vector CRUD/list + start import forms.
- `chatPanel.ts`
- Streaming/non-streaming assistant chat with citation handling and abort.
- `assistantToolsPanel.ts`
- update/context/evaluate mode-specific operations.
- `createIndexPanel.ts`, `configureIndexPanel.ts`, `createAssistantPanel.ts`
- guided create/configure workflows.
- `apiKeysPanel.ts`
- list/create/revoke API keys with secret copy-once behavior.
- `inferencePanel.ts`
- embed/rerank forms, model loading, token-budget truncation logic.
- `fileDetailsPanel.ts`
- describe file and signed-URL preview fetching (`HEAD` + ranged/full `GET`).
- `uploadMetadataDialog.ts`
- per-file or batch metadata parsing/validation.

### `src/utils`

- `constants.ts`
- Environment/API URLs, auth constants, model presets, polling config.
- `errorHandling.ts`
- classification and user-actionable handling.
- `refreshExplorer.ts`
- debounced unified refresh sequencing.
- `treeItemHelpers.ts`, `inputValidation.ts`, `logger.ts`
- context extraction, shared parsing, logging.

## 7) External calls ledger (destinations and purpose)

| Destination / API | Where used | Purpose | Auth/headers |
|---|---|---|---|
| `https://api.pinecone.io` (or staging) | `PineconeClient`, `AdminApiClient` | Control/admin/inference and assistant control-plane calls | `X-Pinecone-Api-Version`, plus `Api-Key` or `Authorization: Bearer`; `X-Project-Id` for JWT project scope |
| `https://{index-host}` | `DataPlaneApi`, `NamespaceApi`, `ControlPlaneApi.describeIndexStats` | Data-plane vector/query/search/import/namespace/stats | `Api-Key` (or managed key), API version header |
| `https://{assistant-host}` | `AssistantApi` + `FileDetailsPanel` preview fetches | Assistant chat/files/context/evaluation and signed URL preview | `Api-Key` for assistant data-plane; signed URLs are anonymous fetches |
| `https://login.pinecone.io/oauth/authorize` | `AuthService.login` | Browser OAuth authorization | Browser redirect |
| `https://login.pinecone.io/oauth/token` | `AuthService`, `AdminApiClient` | OAuth code exchange, refresh, client credentials token | JSON or form-url-encoded |
| `https://docs.pinecone.io` | `pinecone.openDocs` | Open docs from VS Code | Browser openExternal |
| VS Code APIs | commands/providers/webviews | UI, context keys, messages, output channels, progress | N/A |
| Local config paths `~/.config/pinecone/{secrets.yaml,state.yaml,config.yaml}` | `ConfigService`, `AuthService` | Persist auth and target state | file mode `0600` for secrets |
| Local filesystem (templates/assets) | webview panels | Read HTML templates and media resources | N/A |
| Clipboard | query/api-key panels | Copy query text / API key secret | VS Code `env.clipboard` |
| Local HTTP callback server `127.0.0.1:59049` | `AuthService` | OAuth callback receiver | local-only listener |

## 8) Testing analysis

### Test harness and scripts

- Unit/behavior suites: `src/test/suite/*.test.ts` via `vscode-test` extension host.
- Env-gated integration smoke tests: `src/test/integration/*.integration.test.ts`.

Scripts:

- `npm run check-types`
- `npm run lint`
- `npm test`
- `npm run test:coverage`
- `npm run test:integration`

Integration gate:

- Requires `PINECONE_API_KEY` and `PINECONE_INTEGRATION_TESTS=true`.

### Baseline quality status (fresh run)

- `npm run check-types`: pass
- `npm run lint`: pass
- `npm test`: pass (`459 passing`)
- `npm run test:integration`: pass with gated skip (`0 passing`, `1 pending`) because credentials were not enabled in this run.

### Suite/file inventory coverage

| Test file | Static test count | Top suites |
|---|---:|---|
| `src/test/integration/api.smoke.integration.test.ts` | 6 | Integration Smoke Tests |
| `src/test/suite/api.clients.test.ts` | 18 | API Clients (Production Classes) |
| `src/test/suite/api.test.ts` | 9 | API Types Test Suite, API Versioning, PineconeApiError Test Suite |
| `src/test/suite/assistant.commands.test.ts` | 27 | Assistant Commands Behavioral Tests, Assistant Name Validation Tests, Chat Options Validation Tests, Host URL Normalization Tests, Search Endpoint Configuration Tests |
| `src/test/suite/auth.test.ts` | 14 | AuthContext Test Suite, AuthService Test Suite, ManagedKey Type Suite, OAuth2Token Test Suite, SecretsConfig Test Suite |
| `src/test/suite/authService.login.test.ts` | 2 | AuthService OAuth Callback Lifecycle |
| `src/test/suite/client.test.ts` | 16 | PineconeClient Test Suite, Request Formatting Test Suite |
| `src/test/suite/commands.test.ts` | 27 | Assistant Commands Test Suite, Auth Commands Test Suite, Command Enablement Test Suite, File Commands Test Suite, Index Commands Test Suite, Utility Commands Test Suite |
| `src/test/suite/configService.test.ts` | 6 | ConfigService (Production Class) |
| `src/test/suite/error.handling.test.ts` | 6 | Error Handling Utilities (Production Functions) |
| `src/test/suite/extension.test.ts` | 17 | Commands Test Suite, Configuration Test Suite, Extension Integration Test Suite, Menus Test Suite, Views Test Suite |
| `src/test/suite/file.commands.test.ts` | 19 | File Commands Behavioral Tests |
| `src/test/suite/fixtures.test.ts` | 6 | Fixture-Based Tests |
| `src/test/suite/index.commands.test.ts` | 46 | Dimension Validation Tests, Index Commands Behavioral Tests, Index Name Validation Tests, Integrated Embeddings Index Tests, Restore Job Behavioral Tests |
| `src/test/suite/inference.panel.test.ts` | 11 | InferencePanel helpers |
| `src/test/suite/inputValidation.test.ts` | 5 | Input Validation Helpers |
| `src/test/suite/logger.test.ts` | 15 | Logger Utility Tests |
| `src/test/suite/namespace.commands.test.ts` | 18 | Metadata Schema Tests, Namespace Commands Behavioral Tests, Namespace Name Validation Tests |
| `src/test/suite/panelKeys.test.ts` | 6 | Webview panel key scoping |
| `src/test/suite/pineconeService.test.ts` | 9 | PineconeService (Production Class) |
| `src/test/suite/polling.test.ts` | 14 | Backup Polling Tests, Index Restore Polling Tests, Polling Configuration Tests, Polling with Project Context Tests |
| `src/test/suite/project.commands.test.ts` | 24 | OperationResult Pattern Tests, Organization API Tests, Organization Selection State Tests, Project Commands Behavioral Tests, Project Name Validation Tests |
| `src/test/suite/refresh.test.ts` | 5 | refreshExplorer Utility (Production Function) |
| `src/test/suite/streaming.test.ts` | 9 | AssistantApi Streaming Parser (Production Methods) |
| `src/test/suite/treeDataProvider.test.ts` | 7 | PineconeTreeDataProvider (Production Class) |
| `src/test/suite/treeItemHelpers.test.ts` | 3 | treeItemHelpers Regression Tests |
| `src/test/suite/treeView.test.ts` | 19 | Backup Tree Item Tests, PineconeItemType Test Suite, PineconeTreeItem Test Suite, TreeItemMetadata Test Suite |
| `src/test/suite/uploadMetadataDialog.test.ts` | 4 | Upload Metadata Dialog Parsing |
| `src/test/suite/webview.test.ts` | 52 | API Key Role Selection Rules, Chat Panel Message Handling Tests, Query Panel Message Handling Tests, Query Parameter Parsing Tests |

Static parse total: 420 tests across 29 files.

Runtime test count from suite execution is higher (`459`) than static parse (`420`) because some suites generate additional parameterized test cases at runtime.

### Integration smoke tests and what they verify

`src/test/integration/api.smoke.integration.test.ts` includes:

- `skips when integration credentials are not enabled`: verifies env gate behavior.
- `assistant lifecycle: create and delete succeeds`: verifies assistant create/delete end-to-end.
- `index lifecycle: create, wait ready, describe stats, and delete succeeds`: verifies index lifecycle + readiness polling + data-plane stats.
- `control plane smoke: list indexes succeeds`: verifies control-plane listing with live API.
- `assistant smoke: list assistants succeeds`: verifies assistant listing with live API.
- `data-plane smoke: describe_index_stats succeeds for at least one hosted index`: verifies data-plane host stats access.

## 9) Testing standards extracted from repo

From `docs/testing.md`, `CONTRIBUTING.md`, scripts, and configs:

- Production-code-targeted tests are required (real classes/functions; mocks only at boundaries).
- Regression tests are required for bug fixes in specified areas (auth callback lifecycle, project context fallbacks, host normalization, refresh debounce, advanced query options, upload metadata parsing, newly touched API paths, inference token budgeting, panel key scoping).
- Shared error behavior should be validated through `classifyError` and related utilities.
- New feature minimum coverage is expected across:
- API client path/shape tests.
- command registration/enablement.
- menu ordering/visibility.
- webview payload mapping.
- parsing validators.
- panel key scoping.
- CI gates expect typecheck, lint, tests, and coverage artifact presence.

## 10) Coding standards extracted from repo

- TypeScript strict mode (`tsconfig.json`: `strict: true`, ES2022 target).
- ESLint enforced for `src/**/*.ts` with key rules:
- `eqeqeq: error`
- `@typescript-eslint/no-unused-vars: error`
- `@typescript-eslint/naming-convention` for imports
- Additional warnings for semicolons, `no-explicit-any`, `no-throw-literal`.
- Public API docs and JSDoc are expected by contribution guides.
- Build/test/lint/typecheck are required before contribution.

## 11) Pinecone API reference analysis (2025-10 + Assistant reference pages)

### Scope and canonicalization

- Crawled `docs.pinecone.io` sitemap and extracted `2025-10` operation pages under `/reference/api/2025-10/*`.
- Parsed operation metadata from docs pages and normalized by canonical `METHOD + path`.
- Duplicate alias pages under `admin` and `admin-assistant` were merged into single canonical operations while retaining alias notes.

Result:

- 75 docs operation pages discovered in 2025-10 namespace.
- 64 unique canonical operations after alias normalization.

Admin/Admin-assistant alias pairs normalized:

- `DELETE /admin/api-keys/{api_key_id}`: aliases `admin-assistant/delete_api_key`, `admin/delete_api_key`
- `DELETE /admin/projects/{project_id}`: aliases `admin-assistant/delete_project`, `admin/delete_project`
- `GET /admin/api-keys/{api_key_id}`: aliases `admin-assistant/fetch_api_key`, `admin/fetch_api_key`
- `GET /admin/projects`: aliases `admin-assistant/list_projects`, `admin/list_projects`
- `GET /admin/projects/{project_id}`: aliases `admin-assistant/fetch_project`, `admin/fetch_project`
- `GET /admin/projects/{project_id}/api-keys`: aliases `admin-assistant/list_api_keys`, `admin/list_api_keys`
- `PATCH /admin/api-keys/{api_key_id}`: aliases `admin-assistant/update_api_key`, `admin/update_api_key`
- `PATCH /admin/projects/{project_id}`: aliases `admin-assistant/update_project`, `admin/update_project`
- `POST /admin/projects`: aliases `admin-assistant/create_project`, `admin/create_project`
- `POST /admin/projects/{project_id}/api-keys`: aliases `admin-assistant/create_api_key`, `admin/create_api_key`
- `POST /oauth/token`: aliases `admin-assistant/get_token`, `admin/get_token`

### Assistant reference pages (`/reference/api/assistant/*`)

Observed pages:

- `introduction`
- `authentication`
- `assistant-limits`

Key points (from page content):

- Assistant API supports document upload + RAG chat workflows.
- Authentication requirement is `Api-Key` for target project (and version header on HTTP requests).
- Limits page documents object and rate limits by plan (assistants per project, file storage and size limits, token limits, rate limits, multimodal PDF-specific limits).

## 12) Full endpoint support matrix (user-facing scope + parameter gaps)

Status definitions:

- `Supported`
- `Partially supported (parameter gaps)`
- `Not offered`

| Category | Operation | Docs title | Status | Notes |
|---|---|---|---|---|
| admin | `DELETE /admin/api-keys/{api_key_id}` | Delete an API key | Supported | API Keys panel supports revoke key from project context. |
| admin | `DELETE /admin/projects/{project_id}` | Delete a project | Supported | Project context menu supports delete with confirmation guardrails. |
| assistant | `DELETE /assistants/{assistant_name}` | Delete an assistant | Supported | Assistant context menu supports delete with typed-name confirmation. |
| control-plane | `DELETE /backups/{backup_id}` | Delete a backup | Supported | Backup context menu supports delete backup. |
| data-plane | `DELETE /bulk/imports/{id}` | Cancel an import | Not offered | No user-facing action to cancel imports in Data Ops. |
| control-plane | `DELETE /collections/{collection_name}` | Delete a collection | Not offered | Collections are not exposed in tree, commands, or panels. |
| assistant | `DELETE /files/{assistant_name}/{assistant_file_id}` | Delete an uploaded file | Supported | File context menu supports delete file. |
| control-plane | `DELETE /indexes/{index_name}` | Delete an index | Supported | Index context menu supports delete index with protection checks. |
| data-plane | `DELETE /namespaces/{namespace}` | Delete a namespace | Supported | Namespace context menu supports delete namespace. |
| admin | `GET /admin/api-keys/{api_key_id}` | Get API key details | Not offered | No key-details fetch UI by key ID. |
| admin | `GET /admin/projects` | List projects | Supported | Tree provider lists projects under each organization. |
| admin | `GET /admin/projects/{project_id}` | Get project details | Not offered | No explicit project-details view action. |
| admin | `GET /admin/projects/{project_id}/api-keys` | List API keys | Supported | API Keys panel lists project keys. |
| assistant | `GET /assistants` | List assistants | Supported | Tree provider lists assistants. |
| assistant | `GET /assistants/{assistant_name}` | Check assistant status | Supported | Assistant tools update mode loads defaults via describe assistant. |
| control-plane | `GET /backups` | List backups for all indexes in a project | Not offered | No user-facing project-wide backup list flow (only per-index backups). |
| control-plane | `GET /backups/{backup_id}` | Describe a backup | Supported | Backup creation flow polls backup status via describe backup. |
| data-plane | `GET /bulk/imports` | List imports | Not offered | No user-facing import list view. |
| data-plane | `GET /bulk/imports/{id}` | Describe an import | Not offered | No user-facing import detail view. |
| control-plane | `GET /collections` | List collections | Not offered | Collections are not represented in the extension UX. |
| control-plane | `GET /collections/{collection_name}` | Describe a collection | Not offered | No collection details UI. |
| assistant | `GET /files/{assistant_name}` | List Files | Supported | Tree provider lists files per assistant. |
| assistant | `GET /files/{assistant_name}/{assistant_file_id}` | Describe a file upload | Supported | File details panel fetches describe file (with signed URL). |
| control-plane | `GET /indexes` | List indexes | Supported | Tree provider lists indexes. |
| control-plane | `GET /indexes/{index_name}` | Describe an index | Supported | Create/configure/polling flows call describe index. |
| control-plane | `GET /indexes/{index_name}/backups` | List backups for an index | Supported | Tree and commands list backups for index. |
| inference | `GET /models` | List available models | Partially supported (parameter gaps) | Inference toolbox lists models by type but does not expose vector_type filter. |
| inference | `GET /models/{model_name}` | Describe a model | Not offered | Model detail endpoint is implemented but not surfaced in UI. |
| data-plane | `GET /namespaces` | List namespaces | Supported | Tree provider lists namespaces. |
| data-plane | `GET /namespaces/{namespace}` | Describe a namespace | Supported | Namespace details command describes namespace. |
| control-plane | `GET /restore-jobs` | List restore jobs | Supported | View Restore Jobs command lists restore jobs. |
| control-plane | `GET /restore-jobs/{job_id}` | Describe a restore job | Not offered | No explicit user flow to describe a single restore job by ID. |
| data-plane | `GET /vectors/fetch` | Fetch vectors | Supported | Data Ops panel fetches vectors by ID list. |
| data-plane | `GET /vectors/list` | List vector IDs | Supported | Data Ops panel lists vector IDs. |
| admin | `PATCH /admin/api-keys/{api_key_id}` | Update an API key | Not offered | No API key rename/role-update action in panel. |
| admin | `PATCH /admin/projects/{project_id}` | Update a project | Partially supported (parameter gaps) | Rename project is exposed (name only); max_pods/CMEK update options are not surfaced. |
| assistant | `PATCH /assistants/{assistant_name}` | Update an assistant | Supported | Assistant tools update action edits instructions and metadata. |
| control-plane | `PATCH /indexes/{index_name}` | Configure an index | Partially supported (parameter gaps) | Configure index UI exposes deletion protection + tags; embed/spec advanced fields are not exposed. |
| admin | `POST /admin/projects` | Create a new project | Partially supported (parameter gaps) | Create project exposes name + CMEK toggle, not max_pods. |
| admin | `POST /admin/projects/{project_id}/api-keys` | Create an API key | Supported | API Keys panel creates keys with role selection. |
| assistant | `POST /assistants` | Create an assistant | Supported | Create assistant panel exposes name/region/instructions/metadata. |
| control-plane | `POST /backups/{backup_id}/create-index` | Create an index from a backup | Supported | Restore backup flow creates new index from backup. |
| data-plane | `POST /bulk/imports` | Start import | Supported | Data Ops panel exposes start import. |
| assistant | `POST /chat/{assistant_name}` | Chat with an assistant | Partially supported (parameter gaps) | Chat panel exposes model/temperature/filter/include_highlights/stream; context_options and json_response are not surfaced. |
| assistant | `POST /chat/{assistant_name}/chat/completions` | Chat through an OpenAI-compatible interface | Not offered | OpenAI-compatible chat completions endpoint is not exposed. |
| assistant | `POST /chat/{assistant_name}/context` | Retrieve context from an assistant | Partially supported (parameter gaps) | Assistant context tool exposes query/top_k/filter only; messages/multimodal/snippet_size/include_binary_content are not exposed. |
| control-plane | `POST /collections` | Create a collection | Not offered | No collection create workflow. |
| data-plane | `POST /describe_index_stats` | Get index stats | Partially supported (parameter gaps) | Index stats command does not expose optional filter parameter. |
| inference | `POST /embed` | Generate vectors | Partially supported (parameter gaps) | Inference toolbox supports core embed fields; advanced model-specific parameters are not exposed. |
| assistant | `POST /evaluation/metrics/alignment` | Evaluate an answer | Supported | Assistant evaluation tool covers required question/answer/ground truth payload. |
| assistant | `POST /files/{assistant_name}` | Upload file to assistant | Partially supported (parameter gaps) | Upload supports file + metadata but does not expose multimodal flag. |
| control-plane | `POST /indexes` | Create an index | Partially supported (parameter gaps) | Create index UI omits create-time tags/deletion_protection and other optional fields. |
| control-plane | `POST /indexes/{index_name}/backups` | Create a backup of an index | Partially supported (parameter gaps) | Backup create flow exposes name but not description. |
| control-plane | `POST /indexes/create-for-model` | Create an index with integrated embedding | Partially supported (parameter gaps) | Integrated index create omits optional deletion_protection/read_capacity/schema/tags. |
| data-plane | `POST /namespaces` | Create a namespace | Supported | Create namespace flow exposes name + optional schema. |
| admin | `POST /oauth/token` | Create an access token | Not offered | Token endpoint is used internally for auth flows, not exposed as user-facing functionality. |
| data-plane | `POST /query` | Search with a vector | Partially supported (parameter gaps) | Query panel supports vector/id/filter/include fields but not maxCandidates/queries/scanFactor/hybrid sparse payloads. |
| data-plane | `POST /records/namespaces/{namespace}/search` | Search with text | Partially supported (parameter gaps) | Text search supports inputs.text/top_k/filter/fields; rerank and vector query forms are not exposed. |
| data-plane | `POST /records/namespaces/{namespace}/upsert` | Upsert text | Supported | Data Ops panel supports upsert records payload. |
| inference | `POST /rerank` | Rerank results | Partially supported (parameter gaps) | Rerank UI supports model/query/documents/top_n but not rank_fields/return_documents/parameters. |
| data-plane | `POST /vectors/delete` | Delete vectors | Supported | Data Ops supports ids/filter/delete_all/namespace delete flow. |
| data-plane | `POST /vectors/fetch_by_metadata` | Fetch vectors by metadata | Partially supported (parameter gaps) | Fetch-by-metadata UI does not expose pagination token. |
| data-plane | `POST /vectors/update` | Update a vector | Partially supported (parameter gaps) | Update vector UI exposes id/values/set_metadata; sparseValues/filter/dryRun are not surfaced. |
| data-plane | `POST /vectors/upsert` | Upsert vectors | Partially supported (parameter gaps) | Upsert vectors UI submits one vector per action and lacks bulk vector payload editor. |

## 13) Full missing-functionality list

### A) Endpoint-level functionality not offered

### admin
- `GET /admin/api-keys/{api_key_id}`: Get API key details. No key-details fetch UI by key ID.
- `GET /admin/projects/{project_id}`: Get project details. No explicit project-details view action.
- `PATCH /admin/api-keys/{api_key_id}`: Update an API key. No API key rename/role-update action in panel.
- `POST /oauth/token`: Create an access token. Token endpoint is used internally for auth flows, not exposed as user-facing functionality.

### control-plane
- `DELETE /collections/{collection_name}`: Delete a collection. Collections are not exposed in tree, commands, or panels.
- `GET /backups`: List backups for all indexes in a project. No user-facing project-wide backup list flow (only per-index backups).
- `GET /collections`: List collections. Collections are not represented in the extension UX.
- `GET /collections/{collection_name}`: Describe a collection. No collection details UI.
- `GET /restore-jobs/{job_id}`: Describe a restore job. No explicit user flow to describe a single restore job by ID.
- `POST /collections`: Create a collection. No collection create workflow.

### data-plane
- `DELETE /bulk/imports/{id}`: Cancel an import. No user-facing action to cancel imports in Data Ops.
- `GET /bulk/imports`: List imports. No user-facing import list view.
- `GET /bulk/imports/{id}`: Describe an import. No user-facing import detail view.

### assistant
- `POST /chat/{assistant_name}/chat/completions`: Chat through an OpenAI-compatible interface. OpenAI-compatible chat completions endpoint is not exposed.

### inference
- `GET /models/{model_name}`: Describe a model. Model detail endpoint is implemented but not surfaced in UI.


### B) Parameter-level omissions on partially supported endpoints

### admin
- `PATCH /admin/projects/{project_id}`: Update a project. Rename project is exposed (name only); max_pods/CMEK update options are not surfaced.
- `POST /admin/projects`: Create a new project. Create project exposes name + CMEK toggle, not max_pods.

### control-plane
- `PATCH /indexes/{index_name}`: Configure an index. Configure index UI exposes deletion protection + tags; embed/spec advanced fields are not exposed.
- `POST /indexes`: Create an index. Create index UI omits create-time tags/deletion_protection and other optional fields.
- `POST /indexes/{index_name}/backups`: Create a backup of an index. Backup create flow exposes name but not description.
- `POST /indexes/create-for-model`: Create an index with integrated embedding. Integrated index create omits optional deletion_protection/read_capacity/schema/tags.

### data-plane
- `POST /describe_index_stats`: Get index stats. Index stats command does not expose optional filter parameter.
- `POST /query`: Search with a vector. Query panel supports vector/id/filter/include fields but not maxCandidates/queries/scanFactor/hybrid sparse payloads.
- `POST /records/namespaces/{namespace}/search`: Search with text. Text search supports inputs.text/top_k/filter/fields; rerank and vector query forms are not exposed.
- `POST /vectors/fetch_by_metadata`: Fetch vectors by metadata. Fetch-by-metadata UI does not expose pagination token.
- `POST /vectors/update`: Update a vector. Update vector UI exposes id/values/set_metadata; sparseValues/filter/dryRun are not surfaced.
- `POST /vectors/upsert`: Upsert vectors. Upsert vectors UI submits one vector per action and lacks bulk vector payload editor.

### assistant
- `POST /chat/{assistant_name}`: Chat with an assistant. Chat panel exposes model/temperature/filter/include_highlights/stream; context_options and json_response are not surfaced.
- `POST /chat/{assistant_name}/context`: Retrieve context from an assistant. Assistant context tool exposes query/top_k/filter only; messages/multimodal/snippet_size/include_binary_content are not exposed.
- `POST /files/{assistant_name}`: Upload file to assistant. Upload supports file + metadata but does not expose multimodal flag.

### inference
- `GET /models`: List available models. Inference toolbox lists models by type but does not expose vector_type filter.
- `POST /embed`: Generate vectors. Inference toolbox supports core embed fields; advanced model-specific parameters are not exposed.
- `POST /rerank`: Rerank results. Rerank UI supports model/query/documents/top_n but not rank_fields/return_documents/parameters.


## 14) API drift observations (important)

These are not strictly "missing features" but are relevant risks:

- Import endpoints in extension currently use `/imports` and `POST /imports/{id}/cancel`; 2025-10 docs advertise `/bulk/imports` and `DELETE /bulk/imports/{id}`.
- Assistant operation paths in extension include `/assistant/...` prefixes, while 2025-10 docs list canonical assistant paths like `/assistants`, `/chat/{assistant_name}`, `/files/{assistant_name}`.

Interpretation:

- This can be alias/back-compat behavior.
- It can also become a break risk when Pinecone removes legacy aliases.
- This should be validated with live API before shipping further endpoint additions.

## 15) Prioritized recommendations (P0/P1/P2)

Prioritization criteria used:

- User impact in VS Code workflows.
- Engineering effort.
- UX coherence inside existing tree/webview model.
- API stability / low risk.

### P0 (high impact, good fit, moderate effort)

1. Import lifecycle completeness (list/describe/cancel).
- Why: current UX starts imports but cannot monitor or cancel them.
- Add: Data Ops Import Jobs section with list, detail pane, cancel action.
- Also align paths/methods to current 2025-10 canonical import routes.

2. Close major parameter gaps for existing high-traffic operations.
- Why: avoids needing external tools for advanced usage while preserving existing UX.
- Add first:
- Query/search advanced controls (`sparse/hybrid`, rerank, extra query knobs where practical).
- Inference advanced controls (`rank_fields`, `return_documents`, optional embed params).
- Context retrieval optional controls (`snippet_size`, `include_binary_content`, multimodal/messages).

### P1 (valuable, moderate impact)

1. Collections support (create/list/describe/delete).
- Why: full control-plane parity gap today.
- UX fit: add `Collections` category under project `Database`.

2. Admin API key detail/update support.
- Why: currently can list/create/delete but not inspect/update.
- UX fit: details drawer + edit name/roles action in API Keys panel.

3. Add model-detail action (`GET /models/{model_name}`).
- Why: helps users choose models without leaving VS Code.
- UX fit: clickable model info/details in inference toolbox.

### P2 (nice-to-have or lower ROI now)

1. Project detail view (`GET /admin/projects/{id}`) and restore-job detail endpoint usage.
- Why: mostly informational; current list flows already functional.

2. Chat-completions endpoint (`/chat/{assistant}/chat/completions`) as separate mode.
- Why: useful for OpenAI-compatible client parity, but overlaps existing chat UX.
- Recommendation: add only if explicit user demand for raw compatibility payloads emerges.

3. Project-wide backup listing (`GET /backups`) view.
- Why: convenience; per-index backups already available.

### Should not add now

- User-facing `/oauth/token` controls.
- Reason: this is auth plumbing and already handled internally; exposing it increases security and UX complexity without clear end-user value.

## 16) Acceptance check results vs requested plan

1. Completeness check (`src/test/suite/*.test.ts` and integration smoke represented):
- Pass. Every suite file is enumerated and integration smoke tests are documented.

2. Coverage check (every user-facing command/webview flow represented):
- Pass. Commands, tree actions, and webview actions are mapped in this report.

3. API check (every `/reference/api/2025-10/*` operation mapped):
- Pass. 64 canonical operations mapped with support status.

4. Gap check (endpoint-level + parameter-level omissions):
- Pass. Both missing endpoints and parameter gaps are listed by category.

5. Baseline quality status from current run results:
- Pass (with env-gated integration skip behavior explicitly documented).

## 17) Full runtime test case inventory (459)

Each line includes full suite path and what it verifies.

- Query Panel Message Handling Tests > Vector Input Parsing > should parse valid vector array: Verifies parse valid vector array
- Query Panel Message Handling Tests > Vector Input Parsing > should parse valid integer vector: Verifies parse valid integer vector
- Query Panel Message Handling Tests > Vector Input Parsing > should reject non-array input: Verifies reject non-array input
- Query Panel Message Handling Tests > Vector Input Parsing > should reject array with non-numbers: Verifies reject array with non-numbers
- Query Panel Message Handling Tests > Vector Input Parsing > should reject malformed JSON: Verifies reject malformed JSON
- Query Panel Message Handling Tests > Vector Input Parsing > should return undefined for empty string: Verifies return undefined for empty string
- Query Panel Message Handling Tests > Vector Input Parsing > should return undefined for whitespace only: Verifies return undefined for whitespace only
- Query Panel Message Handling Tests > Filter Input Parsing > should parse valid filter object: Verifies parse valid filter object
- Query Panel Message Handling Tests > Filter Input Parsing > should parse complex filter with operators: Verifies parse complex filter with operators
- Query Panel Message Handling Tests > Filter Input Parsing > should reject malformed JSON: Verifies reject malformed JSON
- Query Panel Message Handling Tests > Filter Input Parsing > should return undefined for empty string: Verifies return undefined for empty string
- Query Panel Message Handling Tests > Query Type Routing > should use text search when text provided and embeddings available: Verifies use text search when text provided and embeddings available
- Query Panel Message Handling Tests > Query Type Routing > should not use text search when text empty: Verifies not use text search when text empty
- Query Panel Message Handling Tests > Query Type Routing > should not use text search when only whitespace: Verifies not use text search when only whitespace
- Query Panel Message Handling Tests > Query Type Routing > should not use text search when no integrated embeddings: Verifies not use text search when no integrated embeddings
- Query Panel Message Handling Tests > Query Type Routing > should not use text search when text undefined: Verifies not use text search when text undefined
- Query Panel Message Handling Tests > Query Advanced Options Parsing > should parse comma-separated fields: Verifies parse comma-separated fields
- Query Panel Message Handling Tests > Query Result Text Preview Actions > should collapse long preview text and append ellipsis: Verifies collapse long preview text and append ellipsis
- Query Panel Message Handling Tests > Query Result Text Preview Actions > should toggle between collapsed and full text: Verifies toggle between collapsed and full text
- Query Panel Message Handling Tests > Query Result Text Preview Actions > copy payload should always use full text, not truncated preview: Verifies copy payload should always use full text, not truncated preview
- Query Panel Message Handling Tests > Inference Payload Parsing > embed input newline text maps to object array: Verifies embed input newline text maps to object array
- Query Panel Message Handling Tests > Inference Payload Parsing > embed input JSON string array maps to object array: Verifies embed input JSON string array maps to object array
- Query Panel Message Handling Tests > Inference Payload Parsing > rerank documents newline text maps to object array: Verifies rerank documents newline text maps to object array
- Query Panel Message Handling Tests > Inference Payload Parsing > rerank documents JSON object array is preserved: Verifies rerank documents JSON object array is preserved
- Chat Panel Message Handling Tests > Authentication Error Detection > should detect 401 status code: Verifies detect 401 status code
- Chat Panel Message Handling Tests > Authentication Error Detection > should detect unauthorized keyword: Verifies detect unauthorized keyword
- Chat Panel Message Handling Tests > Authentication Error Detection > should detect token expired: Verifies detect token expired
- Chat Panel Message Handling Tests > Authentication Error Detection > should detect authentication failed: Verifies detect authentication failed
- Chat Panel Message Handling Tests > Authentication Error Detection > should detect not authenticated: Verifies detect not authenticated
- Chat Panel Message Handling Tests > Authentication Error Detection > should be case insensitive: Verifies be case insensitive
- Chat Panel Message Handling Tests > Authentication Error Detection > should not flag regular errors: Verifies not flag regular errors
- Chat Panel Message Handling Tests > Streaming Content Accumulation > should accumulate content chunks: Verifies accumulate content chunks
- Chat Panel Message Handling Tests > Streaming Content Accumulation > should collect citations: Verifies collect citations
- Chat Panel Message Handling Tests > Streaming Content Accumulation > should capture usage on message_end: Verifies capture usage on message_end
- Chat Panel Message Handling Tests > Streaming Content Accumulation > should handle complete stream sequence: Verifies handle complete stream sequence
- Chat Panel Message Handling Tests > Stream Abort Handling > should append abort message to partial content: Verifies append abort message to partial content
- Chat Panel Message Handling Tests > Stream Abort Handling > should return empty string if no content on abort: Verifies return empty string if no content on abort
- Chat Panel Message Handling Tests > Message History Management > should add user and assistant messages: Verifies add user and assistant messages
- Chat Panel Message Handling Tests > Message History Management > should remove last message on error: Verifies remove last message on error
- Chat Panel Message Handling Tests > Message History Management > should clear all messages: Verifies clear all messages
- Chat Panel Message Handling Tests > Message History Management > should return copy of messages: Verifies return copy of messages
- Query Parameter Parsing Tests > should parse valid topK number: Verifies parse valid topK number
- Query Parameter Parsing Tests > should use default for empty string: Verifies use default for empty string
- Query Parameter Parsing Tests > should use default for undefined: Verifies use default for undefined
- Query Parameter Parsing Tests > should use default for non-numeric string: Verifies use default for non-numeric string
- API Key Role Selection Rules > defaults to ProjectEditor role set when no roles are selected: Verifies defaults to ProjectEditor role set when no roles are selected
- API Key Role Selection Rules > project role mode keeps only a project role: Verifies project role mode keeps only a project role
- API Key Role Selection Rules > project viewer mode keeps only ProjectViewer: Verifies project viewer mode keeps only ProjectViewer
- API Key Role Selection Rules > control-plane and data-plane roles can be selected without project role: Verifies control-plane and data-plane roles can be selected without project role
- API Key Role Selection Rules > pairwise editor/viewer conflicts keep the newest role in that pair: Verifies pairwise editor/viewer conflicts keep the newest role in that pair
- API Key Role Selection Rules > selecting a project role clears control/data role mode: Verifies selecting a project role clears control/data role mode
- API Key Role Selection Rules > selecting control/data roles clears project role mode: Verifies selecting control/data roles clears project role mode
- Upload Metadata Dialog Parsing > applies batch metadata to all files: Verifies applies batch metadata to all files
- Upload Metadata Dialog Parsing > supports per-file metadata when batch metadata is empty: Verifies supports per-file metadata when batch metadata is empty
- Upload Metadata Dialog Parsing > returns validation error for invalid batch metadata: Verifies returns validation error for invalid batch metadata
- Upload Metadata Dialog Parsing > returns validation error for invalid per-file metadata: Verifies returns validation error for invalid per-file metadata
- PineconeItemType Test Suite > should have all expected item types: Verifies have all expected item types
- PineconeItemType Test Suite > should have unique context values: Verifies have unique context values
- PineconeTreeItem Test Suite > should create item with basic properties: Verifies create item with basic properties
- PineconeTreeItem Test Suite > should create item with resource ID: Verifies create item with resource ID
- PineconeTreeItem Test Suite > should create item with parent ID: Verifies create item with parent ID
- PineconeTreeItem Test Suite > should create item with metadata: Verifies create item with metadata
- PineconeTreeItem Test Suite > should set icon for database category: Verifies set icon for database category
- PineconeTreeItem Test Suite > should set icon for assistant category: Verifies set icon for assistant category
- PineconeTreeItem Test Suite > should create expandable category items: Verifies create expandable category items
- PineconeTreeItem Test Suite > should create non-expandable leaf items: Verifies create non-expandable leaf items
- TreeItemMetadata Test Suite > should support index metadata: Verifies support index metadata
- TreeItemMetadata Test Suite > should support assistant metadata: Verifies support assistant metadata
- TreeItemMetadata Test Suite > should support backup metadata: Verifies support backup metadata
- TreeItemMetadata Test Suite > should support custom properties: Verifies support custom properties
- Backup Tree Item Tests > should create backups category item: Verifies create backups category item
- Backup Tree Item Tests > should create backup item with metadata: Verifies create backup item with metadata
- Backup Tree Item Tests > should create namespaces category item: Verifies create namespaces category item
- Backup Tree Item Tests > should create namespace item: Verifies create namespace item
- Backup Tree Item Tests > should create pod index item with limited functionality indicator: Verifies create pod index item with limited functionality indicator
- treeItemHelpers Regression Tests > buildProjectContextFromItem uses metadata.organization.id fallback: Verifies buildProjectContextFromItem uses metadata.organization.id fallback
- treeItemHelpers Regression Tests > setProjectContextFromItem sets full context when organization metadata exists: Verifies setProjectContextFromItem sets full context when organization metadata exists
- treeItemHelpers Regression Tests > setProjectContextFromItem falls back to project-id-only context when metadata is partial: Verifies setProjectContextFromItem falls back to project-id-only context when metadata is partial
- PineconeTreeDataProvider (Production Class) > returns empty root when not authenticated: Verifies returns empty root when not authenticated
- PineconeTreeDataProvider (Production Class) > returns database and assistant categories at root for API key auth: Verifies returns database and assistant categories at root for API key auth
- PineconeTreeDataProvider (Production Class) > returns organization nodes for JWT auth: Verifies returns organization nodes for JWT auth
- PineconeTreeDataProvider (Production Class) > expanding organization persists selection and returns project nodes: Verifies expanding organization persists selection and returns project nodes
- PineconeTreeDataProvider (Production Class) > expanding project persists target project for toolbar workflows: Verifies expanding project persists target project for toolbar workflows
- PineconeTreeDataProvider (Production Class) > passes full project context when listing indexes under database category: Verifies passes full project context when listing indexes under database category
- PineconeTreeDataProvider (Production Class) > stale namespace metadata schedules only one recovery refresh (205ms): Verifies stale namespace metadata schedules only one recovery refresh (205ms)
- AssistantApi Streaming Parser (Production Methods) > processSSELine emits content_chunk for valid SSE data: Verifies processSSELine emits content_chunk for valid SSE data
- AssistantApi Streaming Parser (Production Methods) > processSSELine emits citation and message_end chunks with valid payloads: Verifies processSSELine emits citation and message_end chunks with valid payloads
- AssistantApi Streaming Parser (Production Methods) > processSSELine ignores malformed JSON without throwing: Verifies processSSELine ignores malformed JSON without throwing
- AssistantApi Streaming Parser (Production Methods) > parseStreamChunk returns null for unknown or invalid chunk shapes: Verifies parseStreamChunk returns null for unknown or invalid chunk shapes
- AssistantApi Streaming Parser (Production Methods) > parseStreamChunk tolerates content chunks without explicit type: Verifies parseStreamChunk tolerates content chunks without explicit type
- AssistantApi Streaming Parser (Production Methods) > processSSELine ignores comments and non-data lines: Verifies processSSELine ignores comments and non-data lines
- AssistantApi Streaming Parser (Production Methods) > processSSELine accepts raw JSON payload lines without data prefix: Verifies processSSELine accepts raw JSON payload lines without data prefix
- AssistantApi Streaming Parser (Production Methods) > processSSELine converts [DONE] sentinel to message_end: Verifies processSSELine converts [DONE] sentinel to message_end
- AssistantApi Streaming Parser (Production Methods) > parseStreamChunk maps variant done/content shapes to known chunk types: Verifies parseStreamChunk maps variant done/content shapes to known chunk types
- refreshExplorer Utility (Production Function) > runs provider refresh then explorer refresh + focus sequence: Verifies runs provider refresh then explorer refresh + focus sequence
- refreshExplorer Utility (Production Function) > supports no-focus refresh mode: Verifies supports no-focus refresh mode
- refreshExplorer Utility (Production Function) > debounces burst calls into one refresh execution: Verifies debounces burst calls into one refresh execution
- refreshExplorer Utility (Production Function) > continues command refresh even when provider refresh throws: Verifies continues command refresh even when provider refresh throws
- refreshExplorer Utility (Production Function) > command handlers route explorer refreshes through refreshExplorer helper: Verifies command handlers route explorer refreshes through refreshExplorer helper
- Project Commands Behavioral Tests > createProject Command Logic > should build project request correctly: Verifies build project request correctly
- Project Commands Behavioral Tests > createProject Command Logic > should include CMEK setting when specified: Verifies include CMEK setting when specified
- Project Commands Behavioral Tests > createProject Command Logic > should return created project details: Verifies return created project details
- Project Commands Behavioral Tests > deleteProject Command Logic > should call deleteProject with correct parameters: Verifies call deleteProject with correct parameters
- Project Commands Behavioral Tests > renameProject Command Logic > should call updateProject with name-only payload: Verifies call updateProject with name-only payload
- Project Commands Behavioral Tests > describeProject Command Logic > should return project details: Verifies return project details
- Project Commands Behavioral Tests > Authentication Error Handling > should fail gracefully on auth error: Verifies fail gracefully on auth error
- Project Commands Behavioral Tests > Authentication Error Handling > should propagate API errors on create: Verifies propagate API errors on create
- Project Commands Behavioral Tests > Authentication Error Handling > should propagate API errors on delete: Verifies propagate API errors on delete
- Project Name Validation Tests > should accept valid project names: Verifies accept valid project names
- Project Name Validation Tests > should reject empty project name: Verifies reject empty project name
- Project Name Validation Tests > should reject names with invalid characters: Verifies reject names with invalid characters
- Project Name Validation Tests > should reject names exceeding max length: Verifies reject names exceeding max length
- Project Name Validation Tests > should accept names at max length: Verifies accept names at max length
- Organization API Tests > listOrganizations > should return organizations successfully: Verifies return organizations successfully
- Organization API Tests > listOrganizations > should return empty array when user has no organizations: Verifies return empty array when user has no organizations
- Organization API Tests > listOrganizations > should throw on API error: Verifies throw on API error
- OperationResult Pattern Tests > should represent successful result: Verifies represent successful result
- OperationResult Pattern Tests > should represent failed result with error: Verifies represent failed result with error
- OperationResult Pattern Tests > should distinguish success from expected empty: Verifies distinguish success from expected empty
- OperationResult Pattern Tests > should provide fallback data on error: Verifies provide fallback data on error
- Organization Selection State Tests > should track selected organization: Verifies track selected organization
- Organization Selection State Tests > should track selected project within organization: Verifies track selected project within organization
- Organization Selection State Tests > should clear project when organization changes: Verifies clear project when organization changes
- Backup Polling Tests > should poll until backup is Ready (102ms): Verifies poll until backup is Ready (102ms)
- Backup Polling Tests > should immediately return if backup is already Ready: Verifies immediately return if backup is already Ready
- Backup Polling Tests > should throw error if backup fails (54ms): Verifies throw error if backup fails (54ms)
- Backup Polling Tests > should timeout if backup takes too long (218ms): Verifies timeout if backup takes too long (218ms)
- Backup Polling Tests > should handle API errors during polling (56ms): Verifies handle API errors during polling (56ms)
- Index Restore Polling Tests > should poll until index is Ready (105ms): Verifies poll until index is Ready (105ms)
- Index Restore Polling Tests > should immediately return if index is already Ready: Verifies immediately return if index is already Ready
- Index Restore Polling Tests > should throw error if index enters Terminating state (54ms): Verifies throw error if index enters Terminating state (54ms)
- Index Restore Polling Tests > should timeout if index initialization takes too long (219ms): Verifies timeout if index initialization takes too long (219ms)
- Index Restore Polling Tests > should handle 404 during early polling (110ms): Verifies handle 404 during early polling (110ms)
- Polling Configuration Tests > should use configurable poll interval (210ms): Verifies use configurable poll interval (210ms)
- Polling Configuration Tests > should respect maximum wait time (326ms): Verifies respect maximum wait time (326ms)
- Polling with Project Context Tests > should pass project context to API calls during backup polling: Verifies pass project context to API calls during backup polling
- Polling with Project Context Tests > should pass project context to API calls during index polling: Verifies pass project context to API calls during index polling
- PineconeService (Production Class) > setProjectId/getProjectId delegate to the underlying client: Verifies setProjectId/getProjectId delegate to the underlying client
- PineconeService (Production Class) > setFullProjectContext updates managed project context and project id: Verifies setFullProjectContext updates managed project context and project id
- PineconeService (Production Class) > setTargetProject uses full project context when target organization exists: Verifies setTargetProject uses full project context when target organization exists
- PineconeService (Production Class) > setTargetProject falls back to project-id context when organization is unavailable: Verifies setTargetProject falls back to project-id context when organization is unavailable
- PineconeService (Production Class) > listIndexes delegates to ControlPlaneApi and forwards per-request project context: Verifies listIndexes delegates to ControlPlaneApi and forwards per-request project context
- PineconeService (Production Class) > createAssistant delegates to AssistantApi and forwards context: Verifies createAssistant delegates to AssistantApi and forwards context
- PineconeService (Production Class) > listOrganizations returns empty success for API key auth without Admin API call: Verifies listOrganizations returns empty success for API key auth without Admin API call
- PineconeService (Production Class) > listOrganizations returns explicit error result when Admin API call fails: Verifies listOrganizations returns explicit error result when Admin API call fails
- PineconeService (Production Class) > listProjects returns projects from Admin API for JWT auth: Verifies listProjects returns projects from Admin API for JWT auth
- Webview panel key scoping > query/data ops keys are project+host scoped and case-insensitive: Verifies query/data ops keys are project+host scoped and case-insensitive
- Webview panel key scoping > chat keys are project+assistant host+assistant name scoped: Verifies chat keys are project+assistant host+assistant name scoped
- Webview panel key scoping > assistant tools keys include mode in scope: Verifies assistant tools keys include mode in scope
- Webview panel key scoping > file details keys include file id: Verifies file details keys include file id
- Webview panel key scoping > create/configure panel keys are project-scoped and resource-scoped where needed: Verifies create/configure panel keys are project-scoped and resource-scoped where needed
- Webview panel key scoping > api keys panel key prefers explicit project item id over target project: Verifies api keys panel key prefers explicit project item id over target project
- Namespace Commands Behavioral Tests > createNamespace Command Logic > should build namespace request correctly: Verifies build namespace request correctly
- Namespace Commands Behavioral Tests > createNamespace Command Logic > should build namespace request with schema: Verifies build namespace request with schema
- Namespace Commands Behavioral Tests > createNamespace Command Logic > should handle empty name for default namespace: Verifies handle empty name for default namespace
- Namespace Commands Behavioral Tests > deleteNamespace Command Logic > should call deleteNamespace with correct parameters: Verifies call deleteNamespace with correct parameters
- Namespace Commands Behavioral Tests > deleteNamespace Command Logic > should handle __default__ namespace correctly: Verifies handle __default__ namespace correctly
- Namespace Commands Behavioral Tests > describeNamespace Command Logic > should call describeNamespace with correct parameters: Verifies call describeNamespace with correct parameters
- Namespace Commands Behavioral Tests > listNamespaces Command Logic > should list namespaces with pagination: Verifies list namespaces with pagination
- Namespace Commands Behavioral Tests > listNamespaces Command Logic > should handle empty namespace list: Verifies handle empty namespace list
- Namespace Commands Behavioral Tests > Error Handling > should propagate API errors: Verifies propagate API errors
- Namespace Commands Behavioral Tests > Error Handling > should handle authentication errors: Verifies handle authentication errors
- Namespace Name Validation Tests > should accept valid namespace names: Verifies accept valid namespace names
- Namespace Name Validation Tests > should reject empty namespace name when not allowed: Verifies reject empty namespace name when not allowed
- Namespace Name Validation Tests > should accept empty namespace name when allowed: Verifies accept empty namespace name when allowed
- Namespace Name Validation Tests > should reject names with invalid characters: Verifies reject names with invalid characters
- Namespace Name Validation Tests > should reject names exceeding max length: Verifies reject names exceeding max length
- Namespace Name Validation Tests > should accept names at max length: Verifies accept names at max length
- Metadata Schema Tests > should correctly structure schema with multiple fields: Verifies correctly structure schema with multiple fields
- Metadata Schema Tests > should handle empty schema: Verifies handle empty schema
- Logger Utility Tests > LogLevel Enum > should have correct ordering: Verifies have correct ordering
- Logger Utility Tests > LogLevel Enum > should have expected values: Verifies have expected values
- Logger Utility Tests > Logger Interface > should log info messages at INFO level: Verifies log info messages at INFO level
- Logger Utility Tests > Logger Interface > should log error messages at INFO level: Verifies log error messages at INFO level
- Logger Utility Tests > Logger Interface > should NOT log debug messages at INFO level: Verifies nOT log debug messages at INFO level
- Logger Utility Tests > Logger Interface > should log debug messages at DEBUG level: Verifies log debug messages at DEBUG level
- Logger Utility Tests > Logger Interface > should NOT log anything at NONE level: Verifies nOT log anything at NONE level
- Logger Utility Tests > Logger Interface > should only log errors at ERROR level: Verifies only log errors at ERROR level
- Logger Utility Tests > Logger Interface > should log warn and error at WARN level: Verifies log warn and error at WARN level
- Logger Utility Tests > Logger Interface > should pass additional arguments: Verifies pass additional arguments
- Logger Utility Tests > Logger Interface > should track current log level: Verifies track current log level
- Logger Utility Tests > Component Logger Pattern > should create logger with component prefix: Verifies create logger with component prefix
- Logger Utility Tests > Component Logger Pattern > should support multiple component loggers: Verifies support multiple component loggers
- Logger Utility Tests > Error Logging > should log Error objects: Verifies log Error objects
- Logger Utility Tests > Error Logging > should log error with context: Verifies log error with context
- Input Validation Helpers > parseOptionalJsonObject returns undefined for empty input: Verifies parseOptionalJsonObject returns undefined for empty input
- Input Validation Helpers > parseOptionalJsonObject parses object JSON: Verifies parseOptionalJsonObject parses object JSON
- Input Validation Helpers > parseOptionalJsonObject rejects arrays: Verifies parseOptionalJsonObject rejects arrays
- Input Validation Helpers > parseOptionalNumberArray parses number arrays: Verifies parseOptionalNumberArray parses number arrays
- Input Validation Helpers > parseOptionalNumberArray rejects malformed values: Verifies parseOptionalNumberArray rejects malformed values
- InferencePanel helpers > applyRerankTokenBudget truncates oversized documents to fit pair token limit: Verifies applyRerankTokenBudget truncates oversized documents to fit pair token limit
- InferencePanel helpers > applyRerankTokenBudget respects an explicit token limit override: Verifies applyRerankTokenBudget respects an explicit token limit override
- InferencePanel helpers > applyRerankTokenBudget keeps short documents unchanged: Verifies applyRerankTokenBudget keeps short documents unchanged
- InferencePanel helpers > resolveRerankPairTokenLimit falls back to default when metadata is missing: Verifies resolveRerankPairTokenLimit falls back to default when metadata is missing
- InferencePanel helpers > resolveRerankPairTokenLimit applies known pinecone rerank fallback: Verifies resolveRerankPairTokenLimit applies known pinecone rerank fallback
- InferencePanel helpers > buildEmbedParameters defaults input_type to query when omitted: Verifies buildEmbedParameters defaults input_type to query when omitted
- InferencePanel helpers > buildEmbedParameters preserves explicit input_type: Verifies buildEmbedParameters preserves explicit input_type
- InferencePanel helpers > buildEmbedParameters forces sparse models to passage: Verifies buildEmbedParameters forces sparse models to passage
- InferencePanel helpers > extractEmbedInputText prefers text field and falls back to first string: Verifies extractEmbedInputText prefers text field and falls back to first string
- InferencePanel helpers > extractTokenLimitFromError parses strict token limit from API error text: Verifies extractTokenLimitFromError parses strict token limit from API error text
- InferencePanel helpers > getPanelKey prefers current project context over target project: Verifies getPanelKey prefers current project context over target project
- Index Commands Behavioral Tests > createIndex Command Logic > should build serverless index request correctly: Verifies build serverless index request correctly
- Index Commands Behavioral Tests > createIndex Command Logic > should build pod index request correctly: Verifies build pod index request correctly
- Index Commands Behavioral Tests > createIndex Command Logic > should handle different distance metrics: Verifies handle different distance metrics
- Index Commands Behavioral Tests > createIndex Command Logic > should build sparse index request correctly: Verifies build sparse index request correctly
- Index Commands Behavioral Tests > deleteIndex Command Logic > should call deleteIndex with correct name: Verifies call deleteIndex with correct name
- Index Commands Behavioral Tests > deleteIndex Command Logic > should handle deletion of protected index: Verifies handle deletion of protected index
- Index Commands Behavioral Tests > configureIndex Command Logic > should configure deletion protection: Verifies configure deletion protection
- Index Commands Behavioral Tests > configureIndex Command Logic > should configure tags: Verifies configure tags
- Index Commands Behavioral Tests > configureIndex Command Logic > should configure pod replicas: Verifies configure pod replicas
- Integrated Embeddings Index Tests > createIndexForModel API Logic > should build integrated embedding request correctly: Verifies build integrated embedding request correctly
- Integrated Embeddings Index Tests > createIndexForModel API Logic > should handle multilingual-e5-large model (fixed dimension): Verifies handle multilingual-e5-large model (fixed dimension)
- Integrated Embeddings Index Tests > createIndexForModel API Logic > should handle sparse embedding model: Verifies handle sparse embedding model
- Integrated Embeddings Index Tests > createIndexForModel API Logic > should include deletion protection when specified: Verifies include deletion protection when specified
- Integrated Embeddings Index Tests > createIndexForModel API Logic > should include tags when specified: Verifies include tags when specified
- Integrated Embeddings Index Tests > createIndexForModel API Logic > should include read/write parameters when specified: Verifies include read/write parameters when specified
- Integrated Embeddings Index Tests > createIndexForModel API Logic > should return index with embed config: Verifies return index with embed config
- Integrated Embeddings Index Tests > createIndexForModel API Logic > should propagate API errors: Verifies propagate API errors
- Integrated Embeddings Index Tests > Embedding Model Configuration > llama-text-embed-v2 should have multiple dimension options: Verifies llama-text-embed-v2 should have multiple dimension options
- Integrated Embeddings Index Tests > Embedding Model Configuration > multilingual-e5-large should have fixed dimension: Verifies multilingual-e5-large should have fixed dimension
- Integrated Embeddings Index Tests > Embedding Model Configuration > pinecone-sparse-english-v0 should be sparse with dotproduct metric: Verifies pinecone-sparse-english-v0 should be sparse with dotproduct metric
- Integrated Embeddings Index Tests > Embedding Model Configuration > all dense models should default to cosine metric: Verifies all dense models should default to cosine metric
- Integrated Embeddings Index Tests > Embedding Model Configuration > all models should have required properties: Verifies all models should have required properties
- Integrated Embeddings Index Tests > Cloud Region Configuration > AWS should have 3 regions: Verifies aWS should have 3 regions
- Integrated Embeddings Index Tests > Cloud Region Configuration > GCP should have 2 regions: Verifies gCP should have 2 regions
- Integrated Embeddings Index Tests > Cloud Region Configuration > Azure should have 1 region: Verifies azure should have 1 region
- Index Name Validation Tests > should accept valid lowercase names: Verifies accept valid lowercase names
- Index Name Validation Tests > should reject empty names: Verifies reject empty names
- Index Name Validation Tests > should reject uppercase letters: Verifies reject uppercase letters
- Index Name Validation Tests > should reject special characters: Verifies reject special characters
- Index Name Validation Tests > should reject names longer than 45 characters: Verifies reject names longer than 45 characters
- Index Name Validation Tests > should accept names exactly 45 characters: Verifies accept names exactly 45 characters
- Dimension Validation Tests > should accept valid dimensions: Verifies accept valid dimensions
- Dimension Validation Tests > should reject zero: Verifies reject zero
- Dimension Validation Tests > should reject negative numbers: Verifies reject negative numbers
- Dimension Validation Tests > should reject non-numeric input: Verifies reject non-numeric input
- Dimension Validation Tests > should reject dimensions over 20000: Verifies reject dimensions over 20000
- Restore Job Behavioral Tests > createIndexFromBackup Logic > should build restore request correctly: Verifies build restore request correctly
- Restore Job Behavioral Tests > createIndexFromBackup Logic > should include deletion protection when specified: Verifies include deletion protection when specified
- Restore Job Behavioral Tests > createIndexFromBackup Logic > should include tags when specified: Verifies include tags when specified
- Restore Job Behavioral Tests > createIndexFromBackup Logic > should return restore job ID and index ID: Verifies return restore job ID and index ID
- Restore Job Behavioral Tests > deleteBackup Logic > should call deleteBackup with correct ID: Verifies call deleteBackup with correct ID
- Restore Job Behavioral Tests > listRestoreJobs Logic > should return list of restore jobs: Verifies return list of restore jobs
- Restore Job Behavioral Tests > listRestoreJobs Logic > should handle empty restore job list: Verifies handle empty restore job list
- Restore Job Behavioral Tests > describeRestoreJob Logic > should return restore job details: Verifies return restore job details
- Restore Job Behavioral Tests > Error Handling > should propagate API errors on restore: Verifies propagate API errors on restore
- Restore Job Behavioral Tests > Error Handling > should propagate API errors on delete: Verifies propagate API errors on delete
- Fixture-Based Tests > Index List Fixture > should load fixture with multiple indexes: Verifies load fixture with multiple indexes
- Fixture-Based Tests > Index List Fixture > should contain serverless and pod indexes: Verifies contain serverless and pod indexes
- Fixture-Based Tests > Index List Fixture > should validate production-index: Verifies validate production-index
- Fixture-Based Tests > Index List Fixture > should validate staging-index: Verifies validate staging-index
- Fixture-Based Tests > Index List Fixture > should validate pod-index: Verifies validate pod-index
- Fixture-Based Tests > Index List Fixture > production-index should be serverless: Verifies production-index should be serverless
- Fixture-Based Tests > Index List Fixture > staging-index should be serverless: Verifies staging-index should be serverless
- Fixture-Based Tests > Index List Fixture > pod-index should be pod: Verifies pod-index should be pod
- Fixture-Based Tests > Index List Fixture > production-index dimension: Verifies production-index dimension
- Fixture-Based Tests > Index List Fixture > staging-index dimension: Verifies staging-index dimension
- Fixture-Based Tests > Index List Fixture > pod-index dimension: Verifies pod-index dimension
- Fixture-Based Tests > Query Response Fixture > should load fixture with matches: Verifies load fixture with matches
- Fixture-Based Tests > Query Response Fixture > should have descending scores: Verifies have descending scores
- Fixture-Based Tests > Query Response Fixture > should validate match 1: Verifies validate match 1
- Fixture-Based Tests > Query Response Fixture > should validate match 2: Verifies validate match 2
- Fixture-Based Tests > Query Response Fixture > should validate match 3: Verifies validate match 3
- Fixture-Based Tests > Query Response Fixture > first match score should be in range: Verifies first match score should be in range
- Fixture-Based Tests > Query Response Fixture > second match score should be in range: Verifies second match score should be in range
- Fixture-Based Tests > Query Response Fixture > third match score should be in range: Verifies third match score should be in range
- Fixture-Based Tests > Assistant List Fixture > should load fixture with assistants: Verifies load fixture with assistants
- Fixture-Based Tests > Assistant List Fixture > support-assistant should have required fields: Verifies support-assistant should have required fields
- Fixture-Based Tests > Assistant List Fixture > docs-assistant should have required fields: Verifies docs-assistant should have required fields
- Fixture-Based Tests > Namespace List Fixture > should load fixture with namespaces: Verifies load fixture with namespaces
- Fixture-Based Tests > Namespace List Fixture > default should have non-negative record count: Verifies default should have non-negative record count
- Fixture-Based Tests > Namespace List Fixture > documents should have non-negative record count: Verifies documents should have non-negative record count
- Fixture-Based Tests > Namespace List Fixture > products should have non-negative record count: Verifies products should have non-negative record count
- Fixture-Based Tests > Namespace List Fixture > images should have non-negative record count: Verifies images should have non-negative record count
- Fixture-Based Tests > Parameterized Validation Tests > index name: valid lowercase: Verifies index name: valid lowercase
- Fixture-Based Tests > Parameterized Validation Tests > index name: valid with numbers: Verifies index name: valid with numbers
- Fixture-Based Tests > Parameterized Validation Tests > index name: valid short: Verifies index name: valid short
- Fixture-Based Tests > Parameterized Validation Tests > index name: invalid uppercase: Verifies index name: invalid uppercase
- Fixture-Based Tests > Parameterized Validation Tests > index name: invalid spaces: Verifies index name: invalid spaces
- Fixture-Based Tests > Parameterized Validation Tests > index name: invalid underscore: Verifies index name: invalid underscore
- Fixture-Based Tests > Parameterized Validation Tests > index name: invalid empty: Verifies index name: invalid empty
- Fixture-Based Tests > Parameterized Validation Tests > dimension: valid small: Verifies dimension: valid small
- Fixture-Based Tests > Parameterized Validation Tests > dimension: valid medium: Verifies dimension: valid medium
- Fixture-Based Tests > Parameterized Validation Tests > dimension: valid large: Verifies dimension: valid large
- Fixture-Based Tests > Parameterized Validation Tests > dimension: invalid zero: Verifies dimension: invalid zero
- Fixture-Based Tests > Parameterized Validation Tests > dimension: invalid negative: Verifies dimension: invalid negative
- Fixture-Based Tests > Parameterized Validation Tests > dimension: invalid too large: Verifies dimension: invalid too large
- Fixture-Based Tests > Parameterized Validation Tests > metric: cosine: Verifies metric: cosine
- Fixture-Based Tests > Parameterized Validation Tests > metric: dotproduct: Verifies metric: dotproduct
- Fixture-Based Tests > Parameterized Validation Tests > metric: euclidean: Verifies metric: euclidean
- Fixture-Based Tests > Parameterized Validation Tests > metric: invalid manhattan: Verifies metric: invalid manhattan
- Fixture-Based Tests > Parameterized Validation Tests > metric: invalid empty: Verifies metric: invalid empty
- Fixture-Based Tests > Error Message Extraction Tests > should extract message from Error object: Verifies extract message from Error object
- Fixture-Based Tests > Error Message Extraction Tests > should extract message from string error: Verifies extract message from string error
- Fixture-Based Tests > Error Message Extraction Tests > should extract message from object with message: Verifies extract message from object with message
- Fixture-Based Tests > Error Message Extraction Tests > should extract message from number error: Verifies extract message from number error
- Fixture-Based Tests > Error Message Extraction Tests > should extract message from null error: Verifies extract message from null error
- Fixture-Based Tests > Error Message Extraction Tests > should extract message from undefined error: Verifies extract message from undefined error
- File Commands Behavioral Tests > uploadFile Command Logic > should build upload request correctly: Verifies build upload request correctly
- File Commands Behavioral Tests > uploadFile Command Logic > should handle upload with metadata: Verifies handle upload with metadata
- File Commands Behavioral Tests > uploadFile Command Logic > should return file model with Processing status: Verifies return file model with Processing status
- File Commands Behavioral Tests > uploadFile Command Logic > should propagate upload errors: Verifies propagate upload errors
- File Commands Behavioral Tests > uploadFile Command Logic > should handle multiple file uploads: Verifies handle multiple file uploads
- File Commands Behavioral Tests > uploadFile Command Logic > should apply same metadata to all files in a batch: Verifies apply same metadata to all files in a batch
- File Commands Behavioral Tests > deleteFile Command Logic > should build delete request correctly: Verifies build delete request correctly
- File Commands Behavioral Tests > deleteFile Command Logic > should propagate delete errors: Verifies propagate delete errors
- File Commands Behavioral Tests > deleteFile Command Logic > should handle delete with various file IDs: Verifies handle delete with various file IDs
- File Commands Behavioral Tests > listFiles Command Logic > should list files for assistant: Verifies list files for assistant
- File Commands Behavioral Tests > listFiles Command Logic > should propagate list errors: Verifies propagate list errors
- File Commands Behavioral Tests > File Status Validation > should recognize valid file statuses: Verifies recognize valid file statuses
- File Commands Behavioral Tests > File Path Handling > should extract filename from path: Verifies extract filename from path
- File Commands Behavioral Tests > File Path Handling > should handle various file extensions: Verifies handle various file extensions
- File Commands Behavioral Tests > Error Message Handling > should format upload error messages: Verifies format upload error messages
- File Commands Behavioral Tests > Error Message Handling > should handle multiple error accumulation: Verifies handle multiple error accumulation
- File Commands Behavioral Tests > Upload Metadata Validation > should accept object metadata JSON: Verifies accept object metadata JSON
- File Commands Behavioral Tests > Upload Metadata Validation > should reject invalid metadata JSON: Verifies reject invalid metadata JSON
- File Commands Behavioral Tests > Upload Metadata Validation > should reject non-object metadata JSON: Verifies reject non-object metadata JSON
- Extension Integration Test Suite > Extension should be present: Verifies extension should be present
- Extension Integration Test Suite > Extension should have correct metadata: Verifies extension should have correct metadata
- Extension Integration Test Suite > Extension should activate: Verifies extension should activate
- Commands Test Suite > Authentication commands should be registered: Verifies authentication commands should be registered
- Commands Test Suite > Index commands should be registered: Verifies index commands should be registered
- Commands Test Suite > Assistant commands should be registered: Verifies assistant commands should be registered
- Commands Test Suite > File commands should be registered: Verifies file commands should be registered
- Commands Test Suite > Utility commands should be registered: Verifies utility commands should be registered
- Views Test Suite > Tree view should be registered: Verifies tree view should be registered
- Views Test Suite > Activity bar container should be registered: Verifies activity bar container should be registered
- Configuration Test Suite > Configuration should be registered: Verifies configuration should be registered
- Configuration Test Suite > Default configuration values should be set: Verifies default configuration values should be set
- Menus Test Suite > Context menus should be configured: Verifies context menus should be configured
- Menus Test Suite > Command palette items should be configured: Verifies command palette items should be configured
- Menus Test Suite > Index context menu order should match expected workflow: Verifies index context menu order should match expected workflow
- Menus Test Suite > Assistant context menu order should match expected workflow: Verifies assistant context menu order should match expected workflow
- Menus Test Suite > File context menu should include View Details before Delete: Verifies file context menu should include View Details before Delete
- Error Handling Utilities (Production Functions) > classifyError marks 401/403 as authentication errors requiring login: Verifies classifyError marks 401/403 as authentication errors requiring login
- Error Handling Utilities (Production Functions) > classifyError marks 404 as not_found with refresh suggestion: Verifies classifyError marks 404 as not_found with refresh suggestion
- Error Handling Utilities (Production Functions) > isAuthenticationError does not treat missing project-context as expired login: Verifies isAuthenticationError does not treat missing project-context as expired login
- Error Handling Utilities (Production Functions) > isNetworkError detects common connectivity failures: Verifies isNetworkError detects common connectivity failures
- Error Handling Utilities (Production Functions) > handleError triggers Login action for authentication errors: Verifies handleError triggers Login action for authentication errors
- Error Handling Utilities (Production Functions) > handleError triggers shared refresh flow for refreshable errors: Verifies handleError triggers shared refresh flow for refreshable errors
- ConfigService (Production Class) > constructor ensures the Pinecone config directory exists: Verifies constructor ensures the Pinecone config directory exists
- ConfigService (Production Class) > saveSecrets writes mode 0600 and getSecrets reads persisted values: Verifies saveSecrets writes mode 0600 and getSecrets reads persisted values
- ConfigService (Production Class) > getState returns empty object when YAML is malformed: Verifies getState returns empty object when YAML is malformed
- ConfigService (Production Class) > setTargetOrganization clears target_project when organization changes: Verifies setTargetOrganization clears target_project when organization changes
- ConfigService (Production Class) > clearTargetContext removes both target organization and target project: Verifies clearTargetContext removes both target organization and target project
- ConfigService (Production Class) > saveConfig and getConfig round-trip app preferences: Verifies saveConfig and getConfig round-trip app preferences
- Index Commands Test Suite > createIndex command should be executable: Verifies createIndex command should be executable
- Index Commands Test Suite > deleteIndex command should be executable: Verifies deleteIndex command should be executable
- Index Commands Test Suite > configureIndex command should be executable: Verifies configureIndex command should be executable
- Index Commands Test Suite > queryIndex command should be executable: Verifies queryIndex command should be executable
- Index Commands Test Suite > openDataOps command should be executable: Verifies openDataOps command should be executable
- Index Commands Test Suite > indexStats command should be executable: Verifies indexStats command should be executable
- Index Commands Test Suite > createBackup command should be executable: Verifies createBackup command should be executable
- Index Commands Test Suite > viewBackups command should be executable: Verifies viewBackups command should be executable
- Index Commands Test Suite > addTags command should be executable: Verifies addTags command should be executable
- Assistant Commands Test Suite > createAssistant command should be executable: Verifies createAssistant command should be executable
- Assistant Commands Test Suite > deleteAssistant command should be executable: Verifies deleteAssistant command should be executable
- Assistant Commands Test Suite > chatWithAssistant command should be executable: Verifies chatWithAssistant command should be executable
- Assistant Commands Test Suite > updateAssistant command should be executable: Verifies updateAssistant command should be executable
- Assistant Commands Test Suite > retrieveAssistantContext command should be executable: Verifies retrieveAssistantContext command should be executable
- Assistant Commands Test Suite > evaluateAssistantAnswer command should be executable: Verifies evaluateAssistantAnswer command should be executable
- File Commands Test Suite > uploadFiles command should be executable: Verifies uploadFiles command should be executable
- File Commands Test Suite > deleteFile command should be executable: Verifies deleteFile command should be executable
- File Commands Test Suite > viewFileDetails command should be executable: Verifies viewFileDetails command should be executable
- Auth Commands Test Suite > login command should be executable: Verifies login command should be executable
- Auth Commands Test Suite > logout command should be executable: Verifies logout command should be executable
- Utility Commands Test Suite > refresh command should be executable: Verifies refresh command should be executable
- Utility Commands Test Suite > openDocs command should be executable: Verifies openDocs command should be executable
- Utility Commands Test Suite > manageApiKeys command should be executable: Verifies manageApiKeys command should be executable
- Utility Commands Test Suite > openInferenceToolbox command should be executable: Verifies openInferenceToolbox command should be executable
- Utility Commands Test Suite > openDocs command should work without authentication: Verifies openDocs command should work without authentication
- Command Enablement Test Suite > Commands requiring auth should have enablement clause: Verifies commands requiring auth should have enablement clause
- Command Enablement Test Suite > Commands not requiring auth should not have enablement clause: Verifies commands not requiring auth should not have enablement clause
- PineconeClient Test Suite > should include Api-Key header for API key auth: Verifies include Api-Key header for API key auth
- PineconeClient Test Suite > should include Bearer token for JWT auth: Verifies include Bearer token for JWT auth
- PineconeClient Test Suite > should include X-Project-Id header for JWT auth when project is set: Verifies include X-Project-Id header for JWT auth when project is set
- PineconeClient Test Suite > should include content-type for JSON requests: Verifies include content-type for JSON requests
- PineconeClient Test Suite > should throw PineconeApiError on 401: Verifies throw PineconeApiError on 401
- PineconeClient Test Suite > should throw PineconeApiError on 404: Verifies throw PineconeApiError on 404
- PineconeClient Test Suite > should throw PineconeApiError on 500: Verifies throw PineconeApiError on 500
- PineconeClient Test Suite > should parse JSON response correctly: Verifies parse JSON response correctly
- PineconeClient Test Suite > should handle empty response body: Verifies handle empty response body
- PineconeClient Test Suite > should handle 200 OK with empty body (e.g., DELETE operations): Verifies handle 200 OK with empty body (e.g., DELETE operations)
- PineconeClient Test Suite > should self-heal stale managed key on GET auth failure and retry once: Verifies self-heal stale managed key on GET auth failure and retry once
- PineconeClient Test Suite > should retry managed key auth failures for POST requests once: Verifies retry managed key auth failures for POST requests once
- Request Formatting Test Suite > should send correct method for GET requests: Verifies send correct method for GET requests
- Request Formatting Test Suite > should send correct method for POST requests: Verifies send correct method for POST requests
- Request Formatting Test Suite > should send correct method for DELETE requests: Verifies send correct method for DELETE requests
- Request Formatting Test Suite > should send correct method for PATCH requests: Verifies send correct method for PATCH requests
- AuthService OAuth Callback Lifecycle > login fails gracefully with EADDRINUSE when callback port is occupied: Verifies login fails gracefully with EADDRINUSE when callback port is occupied
- AuthService OAuth Callback Lifecycle > login timeout closes callback listener and frees the callback port (44ms): Verifies login timeout closes callback listener and frees the callback port (44ms)
- AuthService Test Suite > Initial state should be unauthenticated: Verifies initial state should be unauthenticated
- AuthService Test Suite > isAuthenticated should return false for empty context: Verifies isAuthenticated should return false for empty context
- AuthService Test Suite > isAuthenticated should return true for valid contexts: Verifies isAuthenticated should return true for valid contexts
- AuthService Test Suite > onDidChangeAuth event should be defined: Verifies onDidChangeAuth event should be defined
- OAuth2Token Test Suite > OAuth2Token should have all required fields: Verifies oAuth2Token should have all required fields
- OAuth2Token Test Suite > Token expiry should be parseable as Date: Verifies token expiry should be parseable as Date
- SecretsConfig Test Suite > SecretsConfig should support OAuth2 token: Verifies secretsConfig should support OAuth2 token
- SecretsConfig Test Suite > SecretsConfig should support API key: Verifies secretsConfig should support API key
- SecretsConfig Test Suite > SecretsConfig should support service account: Verifies secretsConfig should support service account
- SecretsConfig Test Suite > SecretsConfig can have all auth methods: Verifies secretsConfig can have all auth methods
- AuthContext Test Suite > AuthContext should include all valid values: Verifies authContext should include all valid values
- ManagedKey Type Suite > ManagedKey should have all required properties: Verifies managedKey should have all required properties
- ManagedKey Type Suite > ManagedKey origin should accept valid values: Verifies managedKey origin should accept valid values
- ManagedKey Type Suite > SecretsConfig should support project_api_keys: Verifies secretsConfig should support project_api_keys
- Assistant Commands Behavioral Tests > createAssistant Command Logic > should create assistant with minimal parameters: Verifies create assistant with minimal parameters
- Assistant Commands Behavioral Tests > createAssistant Command Logic > should create assistant with region: Verifies create assistant with region
- Assistant Commands Behavioral Tests > createAssistant Command Logic > should create assistant with instructions: Verifies create assistant with instructions
- Assistant Commands Behavioral Tests > createAssistant Command Logic > should create assistant with all parameters: Verifies create assistant with all parameters
- Assistant Commands Behavioral Tests > deleteAssistant Command Logic > should delete assistant by name: Verifies delete assistant by name
- Assistant Commands Behavioral Tests > chat Command Logic > should send single message: Verifies send single message
- Assistant Commands Behavioral Tests > chat Command Logic > should send conversation history: Verifies send conversation history
- Assistant Commands Behavioral Tests > chat Command Logic > should pass chat options: Verifies pass chat options
- Assistant Commands Behavioral Tests > chat Command Logic > should return response with citations: Verifies return response with citations
- Assistant Commands Behavioral Tests > File Operations Command Logic > should upload file with correct parameters: Verifies upload file with correct parameters
- Assistant Commands Behavioral Tests > File Operations Command Logic > should delete file by ID: Verifies delete file by ID
- Assistant Name Validation Tests > should accept valid names: Verifies accept valid names
- Assistant Name Validation Tests > should reject invalid names: Verifies reject invalid names
- Chat Options Validation Tests > should accept valid temperature values: Verifies accept valid temperature values
- Chat Options Validation Tests > should reject invalid temperature values: Verifies reject invalid temperature values
- Chat Options Validation Tests > should accept valid filter JSON: Verifies accept valid filter JSON
- Chat Options Validation Tests > should reject invalid filter JSON: Verifies reject invalid filter JSON
- Host URL Normalization Tests > should add https:// to bare hostname: Verifies add https:// to bare hostname
- Host URL Normalization Tests > should not double-add https:// if already present: Verifies not double-add https:// if already present
- Host URL Normalization Tests > should preserve http:// if used (unusual but valid): Verifies preserve http:// if used (unusual but valid)
- Host URL Normalization Tests > should handle assistant hosts correctly: Verifies handle assistant hosts correctly
- Host URL Normalization Tests > should handle index hosts correctly: Verifies handle index hosts correctly
- Search Endpoint Configuration Tests > should construct correct search endpoint path: Verifies construct correct search endpoint path
- Search Endpoint Configuration Tests > should handle default namespace (empty string): Verifies handle default namespace (empty string)
- Search Endpoint Configuration Tests > should encode special characters in namespace: Verifies encode special characters in namespace
- Search Endpoint Configuration Tests > should structure search query with inputs.text: Verifies structure search query with inputs.text
- Search Endpoint Configuration Tests > should support vector-based search query: Verifies support vector-based search query
- API Types Test Suite > IndexModel should have required properties: Verifies indexModel should have required properties
- API Types Test Suite > IndexModel with pod spec: Verifies indexModel with pod spec
- API Types Test Suite > AssistantModel should have required properties: Verifies assistantModel should have required properties
- API Types Test Suite > QueryResponse should parse matches correctly: Verifies queryResponse should parse matches correctly
- API Types Test Suite > ChatResponse should include citations: Verifies chatResponse should include citations
- PineconeApiError Test Suite > should create error with status and message: Verifies create error with status and message
- PineconeApiError Test Suite > should format error message correctly: Verifies format error message correctly
- PineconeApiError Test Suite > should be instanceof Error: Verifies be instanceof Error
- API Versioning > should pin current API version header value: Verifies pin current API version header value
- API Clients (Production Classes) > ControlPlaneApi > listIndexes delegates to GET /indexes and unwraps indexes array: Verifies listIndexes delegates to GET /indexes and unwraps indexes array
- API Clients (Production Classes) > ControlPlaneApi > describeIndexStats normalizes bare host to https: Verifies describeIndexStats normalizes bare host to https
- API Clients (Production Classes) > ControlPlaneApi > describeIndexStats preserves existing protocol: Verifies describeIndexStats preserves existing protocol
- API Clients (Production Classes) > DataPlaneApi > query normalizes bare host and forwards project context: Verifies query normalizes bare host and forwards project context
- API Clients (Production Classes) > DataPlaneApi > search uses __default__ namespace when namespace is empty: Verifies search uses __default__ namespace when namespace is empty
- API Clients (Production Classes) > DataPlaneApi > search URL-encodes namespace names: Verifies search URL-encodes namespace names
- API Clients (Production Classes) > DataPlaneApi > upsertVectors targets /vectors/upsert: Verifies upsertVectors targets /vectors/upsert
- API Clients (Production Classes) > DataPlaneApi > upsertRecords uses namespace in path with __default__ fallback: Verifies upsertRecords uses namespace in path with __default__ fallback
- API Clients (Production Classes) > DataPlaneApi > fetchVectors encodes ids in query params: Verifies fetchVectors encodes ids in query params
- API Clients (Production Classes) > DataPlaneApi > listVectorIds sends optional query params: Verifies listVectorIds sends optional query params
- API Clients (Production Classes) > DataPlaneApi > imports endpoints map correctly: Verifies imports endpoints map correctly
- API Clients (Production Classes) > AssistantApi > updateAssistant uses PATCH assistant control plane path: Verifies updateAssistant uses PATCH assistant control plane path
- API Clients (Production Classes) > AssistantApi > listFiles supports metadata filter query param: Verifies listFiles supports metadata filter query param
- API Clients (Production Classes) > AssistantApi > assistant context/evaluate and describeFile paths: Verifies assistant context/evaluate and describeFile paths
- API Clients (Production Classes) > InferenceApi > embed/rerank/model endpoints map correctly: Verifies embed/rerank/model endpoints map correctly
- API Clients (Production Classes) > NamespaceApi > listNamespaces normalizes host and applies query params: Verifies listNamespaces normalizes host and applies query params
- API Clients (Production Classes) > NamespaceApi > describeNamespace URL-encodes namespace path segment: Verifies describeNamespace URL-encodes namespace path segment
- API Clients (Production Classes) > NamespaceApi > deleteNamespace URL-encodes namespace path segment: Verifies deleteNamespace URL-encodes namespace path segment
