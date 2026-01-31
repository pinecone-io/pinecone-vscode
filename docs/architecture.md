# Architecture Overview

This document describes the architecture of the Pinecone VSCode Extension.

## Related Documentation

- [API Reference](api-reference.md) - Detailed API documentation for contributors
- [Testing Guide](testing.md) - How to write and run tests
- [Debugging Guide](debugging.md) - How to debug the extension

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          VSCode Extension                            │
├──────────────┬──────────────┬──────────────┬───────────────────────┤
│   Commands   │   Providers  │   WebViews   │       Services        │
│              │              │              │                       │
│ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐ │ ┌───────────────────┐ │
│ │  Index   │ │ │ TreeData │ │ │  Query   │ │ │   AuthService     │ │
│ │ Commands │ │ │ Provider │ │ │  Panel   │ │ │                   │ │
│ └──────────┘ │ └──────────┘ │ └──────────┘ │ │ ┌───────────────┐ │ │
│ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐ │ │ │ ConfigService │ │ │
│ │Assistant │ │ │TreeItems │ │ │  Chat    │ │ │ └───────────────┘ │ │
│ │ Commands │ │ └──────────┘ │ │  Panel   │ │ └───────────────────┘ │
│ └──────────┘ │              │ └──────────┘ │ ┌───────────────────┐ │
│ ┌──────────┐ │              │              │ │ PineconeService   │ │
│ │  File    │ │              │              │ └───────────────────┘ │
│ │ Commands │ │              │              │                       │
│ └──────────┘ │              │              │                       │
└──────────────┴──────────────┴──────────────┴───────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            API Layer                                 │
├──────────────────┬──────────────────┬──────────────────────────────┤
│   PineconeClient │   ControlPlane   │      AssistantApi            │
│   (HTTP Client)  │   DataPlane      │      AdminApi                │
└──────────────────┴──────────────────┴──────────────────────────────┘
                                    │
                                    ▼
                         ┌──────────────────┐
                         │   Pinecone API   │
                         └──────────────────┘
```

## Directory Structure

```
src/
├── extension.ts          # Entry point, registers commands and providers
├── api/                  # API clients
│   ├── client.ts         # Base HTTP client with auth
│   ├── controlPlane.ts   # Index management, backups, restore jobs API
│   ├── dataPlane.ts      # Vector operations API
│   ├── assistantApi.ts   # Assistant API with streaming chat support
│   ├── adminApi.ts       # Organization/Project API
│   ├── namespaceApi.ts   # Namespace management API
│   └── types.ts          # TypeScript interfaces
├── commands/             # Command handlers
│   ├── auth.ts           # Login/logout commands
│   ├── index.commands.ts # Index CRUD, backups, restore commands
│   ├── assistant.commands.ts # Assistant commands
│   ├── file.commands.ts  # File upload/delete
│   ├── namespace.commands.ts # Namespace CRUD commands
│   └── project.commands.ts   # Project management
├── providers/            # VSCode providers
│   ├── pineconeTreeDataProvider.ts # Tree view data
│   └── treeItems.ts      # Tree item definitions
├── services/             # Business logic
│   ├── authService.ts    # Authentication management
│   ├── configService.ts  # CLI-compatible config files
│   └── pineconeService.ts # High-level service facade
├── webview/              # WebView panels
│   ├── queryPanel.ts     # Index query interface
│   ├── chatPanel.ts      # Assistant chat interface
│   └── html/             # HTML templates
├── utils/                # Utilities
│   ├── constants.ts      # API URLs, OAuth config
│   └── logger.ts         # Centralized logging utility
└── test/                 # Tests
```

## Core Components

### Extension Entry Point (`extension.ts`)

The `activate()` function initializes the extension:

1. Creates service instances (AuthService, PineconeService)
2. Registers the tree data provider
3. Registers command handlers
4. Sets up context variables for UI state

```typescript
export function activate(context: vscode.ExtensionContext): void {
    // Initialize services
    const authService = new AuthService(context.secrets);
    const pineconeService = new PineconeService(authService);

    // Register tree view
    const treeDataProvider = new PineconeTreeDataProvider(pineconeService, authService);
    vscode.window.registerTreeDataProvider('pineconeExplorer', treeDataProvider);

    // Register commands
    registerCommands(context, pineconeService, treeDataProvider);
}
```

### Services Layer

#### AuthService

Manages authentication state and credentials:

- OAuth2 PKCE flow for user login
- Token refresh and caching
- CLI-compatible config file storage
- **Managed API keys for data plane operations**

```typescript
class AuthService {
    async getAccessToken(): Promise<string>
    async login(): Promise<void>
    async logout(): Promise<void>
    isAuthenticated(): boolean
    getAuthContext(): AuthContext
    
    // Managed API Key support (for data plane operations)
    async getOrCreateManagedKey(
        projectId: string,
        projectName: string,
        organizationId: string
    ): Promise<string>
    async deleteManagedKey(projectId: string, deleteFromServer?: boolean): Promise<void>
}
```

##### Managed API Keys

When using OAuth login, some data plane APIs (particularly the Assistant chat API) require
API key authentication rather than Bearer tokens. The extension automatically handles this
by creating and managing API keys for each project.

This follows the same pattern as the Pinecone CLI:

1. When a data plane request is needed, check if we have a stored managed key for the project
2. If not, create one via the Admin API (`POST /admin/projects/{id}/api-keys`)
3. Store it in `secrets.yaml` under `project_api_keys`
4. Use the API key for subsequent data plane requests

Managed keys are stored in `~/.config/pinecone/secrets.yaml`:

```yaml
project_api_keys:
  proj-123:
    name: pinecone-vscode-1706594000000
    id: key-abc123
    value: pcsk_...
    origin: vscode_managed
    project_id: proj-123
    project_name: My Project
    organization_id: org-456
```

#### PineconeService

Facade providing a unified API interface:

```typescript
class PineconeService {
    // Project context (for JWT auth)
    setProjectId(projectId: string | undefined): void
    getProjectId(): string | undefined
    
    // Organization & Project operations (returns OperationResult for error feedback)
    async listOrganizations(): Promise<OperationResult<Organization[]>>
    async listProjects(organizationId?: string): Promise<OperationResult<Project[]>>
    
    // State persistence (remembers user's selection across sessions)
    getTargetOrganization(): TargetOrganization | undefined
    setTargetOrganization(org: TargetOrganization | undefined): void
    getTargetProject(): TargetProject | undefined
    setTargetProject(project: TargetProject | undefined): void
    clearTargetContext(): void
    
    // Index operations
    async listIndexes(): Promise<IndexModel[]>
    async createIndex(config: Partial<IndexModel>): Promise<IndexModel>
    async deleteIndex(name: string): Promise<void>
    
    // Assistant operations
    async listAssistants(): Promise<AssistantModel[]>
    async createAssistant(name: string, ...): Promise<AssistantModel>
    
    // API accessors
    getControlPlane(): ControlPlaneApi
    getDataPlane(): DataPlaneApi
    getAssistantApi(): AssistantApi
    getAdminApi(): AdminApiClient
}

// OperationResult provides explicit error feedback instead of silent failures
interface OperationResult<T> {
    success: boolean;
    data?: T;
    error?: string;
}
```

### API Layer

#### PineconeClient

Generic HTTP client handling:

- Request signing with Bearer token or API key
- `X-Project-Id` header for JWT authentication
- Content-Type handling (JSON or FormData)
- Error response parsing
- Timeout management

```typescript
class PineconeClient {
    // Set project context for JWT auth
    setProjectId(projectId: string | undefined): void
    getProjectId(): string | undefined
    
    // Make authenticated requests
    async request<T>(
        method: string,
        path: string,
        options?: RequestOptions
    ): Promise<T>
}
```

**Project Context (X-Project-Id Header):**

For JWT-based authentication (OAuth or service account), API requests require
the `X-Project-Id` header to identify which project context to use. The client
automatically includes this header when:

1. Auth context is `user_token` or `service_account`
2. A project ID has been set via `setProjectId()`

API key authentication doesn't need this header since API keys are already
scoped to a specific project.

#### Specialized APIs

- **ControlPlaneApi**: Index CRUD, backups, restore jobs, configuration
  - `createIndex()`: Standard indexes with user-provided vectors
  - `createIndexForModel()`: Indexes with integrated embeddings (auto text-to-vector)
- **DataPlaneApi**: Vector operations
  - `query()`: Vector-based similarity search for standard indexes
  - `search()`: Text-based search for indexes with integrated embeddings
- **AssistantApi**: Assistants, streaming chat (SSE), file management
- **AdminApi**: Organizations, projects
- **NamespaceApi**: Namespace CRUD operations within indexes

#### Integrated Embeddings

Indexes can be created with integrated embeddings, where Pinecone automatically
converts text to vectors using a hosted model:

- **llama-text-embed-v2**: Dense vectors, configurable dimensions (384-2048)
- **multilingual-e5-large**: Dense vectors, fixed 1024 dimensions
- **pinecone-sparse-english-v0**: Sparse vectors for keyword search

The Query Panel detects indexes with integrated embeddings (via the `embed` field)
and shows a text input instead of a vector input. Text queries are sent to the
`/records/search` endpoint which auto-embeds the query before searching.

### Streaming Chat (SSE)

The Assistant API supports streaming responses via Server-Sent Events (SSE):

```typescript
// In chatPanel.ts
this._streamController = assistantApi.chatStream(
    host, assistantName, messages,
    {
        onChunk: (chunk) => {
            switch (chunk.type) {
                case 'content_chunk':
                    // Forward to webview incrementally
                    panel.postMessage({ command: 'streamChunk', content: chunk.delta.content });
                    break;
                case 'citation':
                    // Queue for display after content
                    panel.postMessage({ command: 'streamCitation', citation: chunk.citation });
                    break;
            }
        },
        onError: (error) => handleStreamingError(error),
        onComplete: () => finalizeStreamingMessage()
    }
);

// User can abort via controller
this._streamController.abort();
```

### UI Layer

#### Tree View Provider

Implements `vscode.TreeDataProvider<PineconeTreeItem>`:

- Fetches data from PineconeService
- Handles authentication state changes
- Provides hierarchical structure based on authentication type

**For OAuth or Service Account (JWT authentication):**

Users can belong to multiple organizations, each containing multiple projects.
The tree shows the full hierarchy:

```
Root
├── Organization A
│   ├── Project 1
│   │   ├── Database (category)
│   │   │   ├── serverless-index (expandable)
│   │   │   │   ├── Namespaces (category)
│   │   │   │   │   ├── (default) (1,000 vectors)
│   │   │   │   │   └── my-namespace (500 vectors)
│   │   │   │   └── Backups (category)
│   │   │   │       ├── ✓ backup-1 (1,000 records)
│   │   │   │       └── ⟳ backup-2 (creating...)
│   │   │   └── pod-index (not expandable, limited functionality)
│   │   └── Assistant (category)
│   │       └── my-assistant
│   │           └── Files (category)
│   │               ├── doc1.pdf
│   │               └── doc2.pdf
│   └── Project 2
│       └── ...
└── Organization B
    └── ...
```

**For API Key authentication:**

API keys are already project-scoped, so Organization/Project levels are skipped:

```
Root
├── Database (category)
│   └── indexes...
└── Assistant (category)
    └── assistants...
```

**Project Context Management:**

When a user expands a project node, the extension sets the project context
via `PineconeService.setProjectId()`. This project ID is then included as
the `X-Project-Id` header in subsequent API requests, which is required
for JWT-based authentication.

#### Tree Item Types (`treeItems.ts`)

| Type | Context Value | Description |
|------|---------------|-------------|
| Organization | `organization` | Organization container (JWT auth only) |
| Project | `project` | Project container |
| DatabaseCategory | `database-category` | Contains indexes |
| AssistantCategory | `assistant-category` | Contains assistants |
| Index | `index` | Serverless index (full functionality) |
| PodIndex | `pod-index` | Legacy pod index (Query/Delete only) |
| NamespacesCategory | `namespaces-category` | Contains namespaces within an index |
| Namespace | `namespace` | Individual namespace |
| BackupsCategory | `backups-category` | Contains backups for an index |
| Backup | `backup` | Individual backup (supports Restore, Delete) |
| Assistant | `assistant` | Individual assistant |
| FilesCategory | `files-category` | Contains files for an assistant |
| File | `file` | Individual file |

**Note:** The extension is designed for serverless indexes. Pod-based indexes
only support Query and Delete operations; other menu items are hidden for pod indexes.

#### WebView Panels

Interactive panels for complex operations:

**QueryPanel** (`queryPanel.ts` + `query.html` + `query.js`):
- Vector input form
- Filter and namespace options
- Results display

**ChatPanel** (`chatPanel.ts` + `chat.html` + `chat.js`):
- Chat message interface
- Model selection
- Citation display

Communication pattern:
```
Extension (TypeScript) <---> WebView (HTML/JS)
     │                           │
     │  postMessage({command})   │
     ├──────────────────────────►│
     │                           │
     │  onDidReceiveMessage()    │
     ◄────────────────────────────┤
```

## Data Flow

### Authentication Flow

```
User clicks "Login"
        │
        ▼
AuthService.login()
        │
        ▼
Opens browser → Auth0 → Callback
        │
        ▼
Stores token in SecretStorage + config files
        │
        ▼
Sets context: pinecone.isAuthenticated = true
        │
        ▼
TreeDataProvider.refresh()
```

### Command Flow (e.g., Create Index)

```
User: Command Palette → "Create Index"
        │
        ▼
IndexCommands.createIndex()
        │
        ▼
Show input boxes (name, dimension, metric)
        │
        ▼
PineconeService.createIndex(config)
        │
        ▼
ControlPlaneApi.createIndex()
        │
        ▼
PineconeClient.request('POST', '/indexes', {body})
        │
        ▼
Show success message
        │
        ▼
TreeDataProvider.refresh()
```

### Tree View Data Flow

```
TreeDataProvider.getChildren(element)
        │
        ├─── element is undefined (root)
        │           │
        │           ▼
        │    Return [Database, Assistant] categories
        │
        ├─── element is DatabaseCategory
        │           │
        │           ▼
        │    PineconeService.listIndexes()
        │           │
        │           ▼
        │    Return index TreeItems
        │
        └─── element is Assistant
                    │
                    ▼
             Return [Files] category
```

## Configuration

### Package.json Contributions

- **viewsContainers**: Activity bar icon
- **views**: pineconeExplorer tree view
- **viewsWelcome**: Login prompt when not authenticated
- **commands**: All command definitions
- **menus**: Context menus and command palette items
- **configuration**: Extension settings

### Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `pinecone.environment` | `production` | API environment |
| `pinecone.defaultRegion` | `us` | Default assistant region |

### CLI-Compatible Config

Files stored in `~/.config/pinecone/`:

- `secrets.yaml`: OAuth tokens and credentials
- `state.yaml`: Current authentication context, target organization/project
- `config.yaml`: User preferences

### State Persistence

The extension persists the user's organization and project selection in `state.yaml`:

```yaml
target_org:
  id: "org-123"
  name: "My Organization"
target_project:
  id: "proj-456"
  name: "My Project"
```

This allows:
- Session restoration: When the extension loads, it restores the last selected project
- Cross-session continuity: Users return to where they left off
- Context for API calls: The X-Project-Id header is automatically included

When a user:
1. **Expands an organization**: It becomes the target organization
2. **Expands a project**: It becomes the target project (and sets X-Project-Id header)
3. **Logs out**: Both selections are cleared

## Error Handling Strategy

1. **API Errors**: Caught by `PineconeClient`, thrown as `PineconeApiError`
2. **Auth Errors**: Detected by status code or message, prompt re-login
3. **User Cancellation**: Silent return (no error)
4. **Validation Errors**: Show inline in input boxes
5. **Network Errors**: Show user-friendly message with retry option

## Security Considerations

- Credentials stored via VSCode's encrypted `SecretStorage`
- Config files created with restrictive permissions (0600)
- OAuth uses PKCE (no client secret in browser)
- Credentials never logged
- WebView CSP with nonce-based script execution
