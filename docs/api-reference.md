# API Reference

This document describes the internal API structure of the Pinecone VSCode extension for contributors and developers extending the extension.

## Table of Contents

- [Services](#services)
- [API Clients](#api-clients)
- [Commands](#commands)
- [Providers](#providers)
- [Types](#types)
- [Utilities](#utilities)

## Services

### AuthService

Manages authentication state and OAuth2 flow.

```typescript
import { AuthService } from './services/authService';

const authService = new AuthService(context.secrets);

// Check authentication status
const isAuth = authService.isAuthenticated();
const context = authService.getAuthContext(); // 'user_token' | 'api_key' | 'service_account'

// Get access token (for API calls)
const token = await authService.getAccessToken();

// Login/logout
await authService.login();
await authService.logout();

// Listen for auth changes
authService.onDidChangeAuth(() => {
    console.log('Auth state changed');
});
```

### PineconeService

High-level facade for all Pinecone operations.

```typescript
import { PineconeService } from './services/pineconeService';

const pineconeService = new PineconeService(authService);

// Set project context (required for JWT auth)
pineconeService.setProjectId('proj-123');

// Index operations
const indexes = await pineconeService.listIndexes();
const index = await pineconeService.createIndex({ name: 'my-index', dimension: 1536 });
await pineconeService.deleteIndex('my-index');

// Assistant operations
const assistants = await pineconeService.listAssistants();
const assistant = await pineconeService.createAssistant('my-assistant', 'us', 'Instructions');

// Organization/Project (OperationResult pattern)
const orgsResult = await pineconeService.listOrganizations();
if (orgsResult.success) {
    console.log(orgsResult.data);
} else {
    console.error(orgsResult.error);
}

// Access lower-level APIs
const controlPlane = pineconeService.getControlPlane();
const dataPlane = pineconeService.getDataPlane();
const assistantApi = pineconeService.getAssistantApi();
```

### ConfigService

Manages CLI-compatible configuration files.

```typescript
import { ConfigService } from './services/configService';

const configService = new ConfigService();

// Secrets (OAuth tokens, API keys)
const secrets = configService.getSecrets();
configService.saveSecrets({ api_key: 'pk-...' });

// State (current context)
const state = configService.getState();
configService.setTargetOrganization({ id: 'org-1', name: 'My Org' });
configService.setTargetProject({ id: 'proj-1', name: 'My Project' });

// App config (preferences)
const config = configService.getConfig();
configService.saveConfig({ default_region: 'us-west-2' });
```

## API Clients

### PineconeClient

Base HTTP client for authenticated API requests.

```typescript
import { PineconeClient } from './api/client';

const client = new PineconeClient(authService);
client.setProjectId('proj-123'); // Required for JWT auth

// Make requests
const indexes = await client.request<{ indexes: IndexModel[] }>('GET', '/indexes');
const index = await client.request<IndexModel>('POST', '/indexes', {
    body: { name: 'test', dimension: 1536, metric: 'cosine' }
});

// Data plane requests (with host)
const stats = await client.request<IndexStats>('POST', '/describe_index_stats', {
    host: 'https://my-index.svc.pinecone.io'
});
```

### ControlPlaneApi

Index and backup operations.

```typescript
import { ControlPlaneApi } from './api/controlPlane';

const api = new ControlPlaneApi(client);

// Indexes
const indexes = await api.listIndexes();
const index = await api.createIndex({ name: 'test', dimension: 1536 });
const index = await api.createIndexForModel({ name: 'embed-index', cloud: 'aws', ... });
await api.configureIndex('test', { deletionProtection: 'enabled' });
await api.deleteIndex('test');

// Backups
const backups = await api.listBackups();
const backup = await api.createBackup('my-index', 'backup-name');
await api.deleteBackup('backup-123');

// Restore Jobs
const job = await api.createIndexFromBackup('backup-123', 'new-index');
const jobs = await api.listRestoreJobs();
```

### DataPlaneApi

Vector and record operations.

```typescript
import { DataPlaneApi } from './api/dataPlane';

const api = new DataPlaneApi(client);

// Vector query
const results = await api.query(host, {
    vector: [0.1, 0.2, 0.3, ...],
    topK: 10,
    namespace: 'my-namespace',
    includeValues: true,
    includeMetadata: true
});

// Text search (integrated embeddings)
const results = await api.search(host, {
    query: { inputs: { text: 'search query' }, top_k: 10 },
    namespace: 'default'
});
```

### AssistantApi

Assistant operations including streaming chat.

```typescript
import { AssistantApi } from './api/assistantApi';

const api = new AssistantApi(client, authService);

// List assistants
const assistants = await api.listAssistants();

// Create/delete
const assistant = await api.createAssistant('name', 'us', 'instructions');
await api.deleteAssistant('name');

// Non-streaming chat
const response = await api.chat(host, assistantName, messages, { model: 'gpt-4o' });

// Streaming chat
await api.chatStream(host, assistantName, messages, {
    model: 'gpt-4o',
    stream: true,
    onChunk: (chunk) => console.log(chunk),
    onError: (error) => console.error(error),
    onComplete: () => console.log('Done')
});

// File operations
const files = await api.listFiles(host, assistantName);
const file = await api.uploadFile(host, assistantName, '/path/to/file.pdf');
await api.deleteFile(host, assistantName, fileId);
```

### AdminApiClient

Organization and project management.

```typescript
import { AdminApiClient } from './api/adminApi';

const api = new AdminApiClient();

// Organizations
const orgs = await api.listOrganizations(jwtToken);

// Projects
const projects = await api.listProjects(jwtToken, organizationId);
await api.createProject(jwtToken, organizationId, 'project-name');
await api.deleteProject(jwtToken, projectId);
```

### NamespaceApi

Namespace operations.

```typescript
import { NamespaceApi } from './api/namespaceApi';

const api = new NamespaceApi(client);

const namespaces = await api.listNamespaces(host);
const ns = await api.describeNamespace(host, 'my-namespace');
await api.deleteNamespace(host, 'my-namespace');
```

## Commands

Command handlers are organized by resource type:

| Module | Commands |
|--------|----------|
| `auth.ts` | `login`, `logout` |
| `index.commands.ts` | `createIndex`, `deleteIndex`, `configureIndex`, `queryIndex`, `createBackup`, etc. |
| `assistant.commands.ts` | `createAssistant`, `deleteAssistant`, `chatWithAssistant` |
| `file.commands.ts` | `uploadFiles`, `deleteFile` |
| `namespace.commands.ts` | `createNamespace`, `describeNamespace`, `deleteNamespace` |
| `project.commands.ts` | `createProject`, `deleteProject` |

## Providers

### PineconeTreeDataProvider

Provides data for the tree view.

```typescript
import { PineconeTreeDataProvider } from './providers/pineconeTreeDataProvider';

const provider = new PineconeTreeDataProvider(pineconeService, authService);
vscode.window.registerTreeDataProvider('pineconeExplorer', provider);

// Refresh the tree
provider.refresh();
```

### PineconeTreeItem

Tree item representation with type information.

```typescript
import { PineconeTreeItem, PineconeItemType } from './providers/treeItems';

const item = new PineconeTreeItem(
    'My Index',                              // label
    PineconeItemType.Index,                  // type
    vscode.TreeItemCollapsibleState.Collapsed,
    'index-123',                             // resourceId
    'proj-456',                              // parentId
    { index: indexModel }                    // metadata
);
```

## Types

### Core Types

```typescript
// Index model
interface IndexModel {
    name: string;
    dimension: number;
    metric: 'cosine' | 'dotproduct' | 'euclidean';
    host: string;
    status: { ready: boolean; state: string };
    spec?: {
        serverless?: { cloud: string; region: string };
        pod?: { environment: string; pod_type: string };
    };
    vector_type?: 'dense' | 'sparse';
    embed?: IndexEmbedConfig;
}

// Assistant model
interface AssistantModel {
    name: string;
    status: string;
    host: string;
    instructions?: string;
    metadata?: Record<string, string>;
}

// Query response
interface QueryResponse {
    matches: Array<{
        id: string;
        score: number;
        values?: number[];
        metadata?: Record<string, unknown>;
    }>;
    namespace: string;
}
```

### Error Types

```typescript
import { PineconeApiError } from './api/client';

try {
    await api.describeIndex('nonexistent');
} catch (error) {
    if (error instanceof PineconeApiError) {
        console.log(error.status);     // HTTP status code
        console.log(error.message);    // Error message
        console.log(error.apiMessage); // Raw API message
    }
}
```

### OperationResult Pattern

Used for operations that should not throw on failure:

```typescript
interface OperationResult<T> {
    success: boolean;
    data?: T;
    error?: string;
}

const result = await pineconeService.listOrganizations();
if (result.success) {
    // Use result.data
} else {
    // Handle result.error
}
```

## Utilities

### Logger

Centralized logging with component prefixes.

```typescript
import { logger, createComponentLogger } from './utils/logger';

// Global logger
logger.info('Extension activated');
logger.warn('Warning message');
logger.error('Error occurred', error);
logger.debug('Debug info'); // Only in development

// Component-specific logger
const log = createComponentLogger('MyComponent');
log.info('Component message'); // Outputs: [Pinecone][MyComponent] Component message
```

### Constants

```typescript
import {
    AUTH_CONTEXTS,           // Authentication context values
    OAUTH_CONFIG,            // OAuth2 configuration
    OAUTH_CALLBACK_PORT,     // OAuth callback port (59049)
    getApiBaseUrl,           // Get API URL by region
    getErrorMessage,         // Extract error message from unknown
} from './utils/constants';
```

## Extension Lifecycle

```typescript
// extension.ts
export function activate(context: vscode.ExtensionContext): void {
    // Initialize services
    const authService = new AuthService(context.secrets);
    const pineconeService = new PineconeService(authService);
    
    // Register providers
    const treeProvider = new PineconeTreeDataProvider(pineconeService, authService);
    vscode.window.registerTreeDataProvider('pineconeExplorer', treeProvider);
    
    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('pinecone.login', () => authCommands.login()),
        // ... more commands
    );
}

export function deactivate(): void {
    // Cleanup if needed
}
```
