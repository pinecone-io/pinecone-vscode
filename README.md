# Pinecone VSCode Extension

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![VSCode Marketplace](https://img.shields.io/badge/VSCode-Marketplace-blue)](https://marketplace.visualstudio.com/items?itemName=pinecone.pinecone-vscode)

Manage your Pinecone vector databases and AI assistants directly from VSCode.

## Table of Contents

- [Features](#features)
  - [Organization & Project Management](#organization--project-management)
  - [Index Management (Serverless)](#index-management-serverless)
  - [Assistant Management](#assistant-management)
  - [Inference Toolbox](#inference-toolbox)
  - [Authentication](#authentication)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Authentication](#authentication-1)
- [Usage Guide](#usage-guide)
  - [Managing Projects](#managing-projects)
  - [Managing Indexes](#managing-indexes)
  - [Managing Assistants](#managing-assistants)
  - [Managing API Keys](#managing-api-keys)
  - [Using Inference Toolbox](#using-inference-toolbox)
- [Configuration](#configuration)
- [Command Reference](#command-reference)
- [Troubleshooting](#troubleshooting)
  - [Extension Not Showing](#extension-not-showing)
  - [Authentication Issues](#authentication-issues)
  - [API Errors](#api-errors)
  - [Query Issues](#query-issues)
  - [Chat/Assistant Issues](#chatassistant-issues)
  - [Performance Issues](#performance-issues)
  - [Network Issues](#network-issues)
  - [Debug Logging](#debug-logging)
- [Contributing](#contributing)
- [License](#license)
- [Links](#links)

## Features

### Organization & Project Management
- **Multi-Organization Support**: Browse all organizations you have access to
- **Project Navigation**: View and navigate projects within each organization
- **Create Projects**: Create new projects within an organization (OAuth/Service Account)
- **Rename Projects**: Rename projects from the project context menu (name-only update)
- **Delete Projects**: Remove projects with confirmation safeguards
- **API Key Management Panel**: List, create, and revoke project API keys from a dedicated panel

### Index Management (Serverless)
- **Browse Indexes**: View all serverless indexes organized by organization and project
- **Create Indexes**: Dedicated Create Index dialog with two modes:
  - **Integrated Embeddings**: Pinecone automatically converts text to vectors using hosted models (Llama Text Embed v2, Multilingual E5 Large, Pinecone Sparse English)
  - **Bring Your Own Vectors**: Create dense or sparse indexes for your own embeddings
- **Cloud Support**: AWS (us-east-1, us-west-2, eu-west-1), GCP (us-central1, europe-west4), Azure (eastus2)
- **Configure**: Dedicated Configure Index dialog to edit deletion protection and tags
- **Smart Query Panel**: 
  - Text-based search for indexes with integrated embeddings
  - Vector-based query for standard indexes
  - Supports ID lookup, filtering, and namespaces
  - Advanced `search_records` `fields` selection
- **Data Ops Panel**:
  - Structured forms for vector upsert/fetch/update/delete/list
  - Upsert records for integrated embedding indexes
  - Fetch/update by metadata filters
  - Import lifecycle operation (start)
  - Result rendering inline under each operation section with match-style cards/tables
- **Scoped Dialog Instances**: Multiple dialogs can be open at once across resources, with one active dialog per resource/context
- **Statistics**: View vector counts and namespace breakdown
- **Backups**: Create, view, restore, and delete index backups
- **Namespace Management**: Create, view, and delete namespaces within indexes

### Assistant Management
- **Browse Assistants**: View all assistants and their files
- **Create Assistants**: Set up new assistants with custom instructions
- **Streaming Chat**: Real-time streaming chat interface with citation support
- **Assistant Tools Panel**:
  - Update assistant instructions and metadata
  - Retrieve assistant context snippets
  - Evaluate answers
- **Model Selection**: Choose from multiple AI models:
  - GPT-4o, GPT-4.1, GPT-5, o4-mini (OpenAI)
  - Claude Sonnet 4.5 (Anthropic)
  - Gemini 2.5 Pro (Google)
- **File Management**: Upload and delete files, with per-file metadata dialog and optional list-level metadata fan-out

### Inference Toolbox
- **Embed**: Generate embeddings for one or multiple inputs with automatic `input_type` defaulting to `query` (overrideable in UI)
- **Rerank**: Rerank candidate documents against a query with model-aware token-limit truncation
- **Model Selection**: Embed and rerank model dropdowns are populated from `list models`
- **Rerank Document UX**: Collapsible document editors with single-click **Clear All Documents**
- **Result Presentation**: Embed and rerank results render inline under each section with match/table styling

### Authentication
- **CLI Compatible**: Uses the same configuration files as the Pinecone CLI
- **Browser Login**: Simple OAuth2 authentication via your browser
- **Multi-Organization Access**: Supports users with access to multiple organizations
- **Secure Storage**: Credentials stored with restricted permissions
- **API Key Support**: CLI-configured API keys are automatically detected and used

> **Note:** This extension is designed for serverless indexes. Legacy pod-based indexes 
> are supported for query and delete operations only; other features are disabled for pod indexes.

## Prerequisites

- **VSCode**: Version 1.85.0 or later
- **Node.js**: Version 18.x or later (for development)
- **Pinecone Account**: Sign up at [app.pinecone.io](https://app.pinecone.io)

## Installation

### From VSCode Marketplace

1. Open VSCode
2. Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for "Pinecone"
4. Click Install

### From VSIX

1. Download the `.vsix` file from [Releases](https://github.com/pinecone-io/pinecone-vscode/releases)
2. In VSCode: Extensions > ... > Install from VSIX

## Quick Start

1. **Open the Pinecone view** in the Activity Bar (sidebar)
2. **Click "Login with Pinecone"** to authenticate via browser
3. **Browse organizations** you have access to
4. **Expand an organization** to see its projects
5. **Expand a project** to access Database (indexes) and Assistant (assistants)

## Authentication

The extension uses OAuth2 browser-based authentication. Click the **Login** button in the Pinecone view or use:

```
Command Palette > Pinecone: Login with Pinecone
```

This opens your browser to authenticate with your Pinecone account. After logging in, you'll be redirected back to VSCode automatically.

## Usage Guide

### Managing Projects

1. Right-click an organization to create a project
2. Right-click a project to rename it (**Rename Project**)
3. Right-click a project to delete it (**Delete Project**)

### Managing Indexes

#### Create an Index

1. Right-click on **Database** in the tree view
2. Select **Create Index**
3. Use the Create Index dialog to choose your vector approach:
   - **Integrated Embeddings**: Pinecone converts text to vectors automatically
   - **Bring Your Own Vectors**: Use your own embedding model

**For Integrated Embeddings:**
1. Select an embedding model:
   - Llama Text Embed v2 (dense, 384-2048 dimensions)
   - Multilingual E5 Large (dense, 1024 dimensions)
   - Pinecone Sparse English v0 (sparse)
2. Choose cloud provider and region
3. Enter the text field name from your documents to embed

**For Bring Your Own Vectors:**
1. Choose Dense or Sparse vector type
2. For dense: Enter dimension and select metric (cosine, dotproduct, euclidean)
3. For sparse: Metric is automatically set to dotproduct
4. Choose cloud provider and region

#### Configure an Index

1. Right-click an index
2. Select **Configure Index**
3. Use the dialog to:
   - Enable/disable deletion protection
   - Add, remove, or edit tags

#### Query an Index

1. Right-click on an index
2. Select **Query Index**
3. Enter your query:
   - **Integrated Embedding indexes**: Enter text - Pinecone auto-converts to vectors
   - **Standard indexes**: Enter a vector array or existing vector ID
4. Configure options: Top K, namespace, filters
5. For integrated embedding indexes, optionally set advanced `fields` selection
6. View results with metadata and optional vector values

#### Data Operations Panel

1. Right-click on an index
2. Select **Data Operations**
3. Use structured forms for vector CRUD/list and import operations
4. Run operations and inspect styled results directly under each operation section

#### View Index Statistics

1. Right-click on an index
2. Select **View Index Stats**
3. See vector counts by namespace

#### Manage Namespaces

1. Expand an index to see the **Namespaces** node
2. Right-click on **Namespaces** to create a new namespace
3. Right-click on a namespace to view details or delete

#### Backup and Restore

1. Expand an index and use the **Backups** node for backup operations:
   - Right-click **Backups** to **Create Backup**
   - Right-click a backup to **Restore from Backup** or **Delete Backup**
2. Use `View Restore Jobs` from the command palette to monitor restore progress

### Managing Assistants

#### Create an Assistant

1. Right-click on **Assistant** in the tree view
2. Select **Create Assistant**
3. Enter name, region, optional instructions, and optional metadata JSON

#### Chat with an Assistant

1. Right-click on an assistant
2. Select **Chat**
3. Configure options (model, temperature, streaming)
4. Type your message and press Enter
5. View streaming responses with file citations
6. Click **Stop** to abort a streaming response

#### Upload Files

1. Expand an assistant to see the **Files** node
2. Right-click on **Files**
3. Select **Upload Files**
4. Choose one or more files to upload
5. In the metadata dialog, either:
   - set metadata per file, or
   - set list-level metadata once to apply to all selected files (per-file fields are disabled while set)

#### Assistant Tools

1. Right-click on an assistant
2. Use one of:
   - **Update Assistant**
   - **Retrieve Context**
   - **Evaluate Answer**
3. Each action opens its own dedicated dialog
4. Evaluate dialog includes inline usage guidance with a link to Assistant API docs and requires a ground truth answer

### Managing API Keys

1. Right-click on a project
2. Select **Manage API Keys**
3. In the panel:
   - List existing keys
   - Create a key (name + role multi-select)
   - Revoke a key
   - Role choices: `ProjectEditor`, `ProjectViewer`, `ControlPlaneEditor`, `ControlPlaneViewer`, `DataPlaneEditor`, `DataPlaneViewer`
   - Role mode is either one project role (`ProjectEditor` or `ProjectViewer`) or, if neither project role is selected, control/data roles with editor/viewer exclusivity per plane
4. On key creation, copy the secret immediately; it is shown only once and not persisted by the extension

### Using Inference Toolbox

1. Open the Pinecone view title actions
2. Select **Inference Toolbox**
3. Use forms for:
   - Embeddings (`embed`)
   - Reranking (`rerank`)
4. Select models from dropdowns populated from the `list models` API
5. Embed `input_type` defaults to `query` when left on Auto
6. Rerank documents are collapsible and can be reset with **Clear All Documents**
7. Rerank automatically truncates documents based on model token limits and retries once with stricter API-returned limits when necessary

## Command Reference

Key extension commands available from context menus and/or the Command Palette:

- `Pinecone: Data Operations`
- `Pinecone: Update Assistant`
- `Pinecone: Retrieve Context`
- `Pinecone: Evaluate Answer`
- `Pinecone: Manage API Keys`
- `Pinecone: Open Inference Toolbox`
- `Pinecone: Rename Project`
- `Pinecone: Upload Files`
- `Pinecone: Query Index`

## Configuration

### Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `pinecone.environment` | `production` | API environment |
| `pinecone.defaultRegion` | `us` | Default region for new assistants |

### Configuration Files

The extension uses CLI-compatible configuration stored in `~/.config/pinecone/`:

- `secrets.yaml` - OAuth tokens and credentials
- `state.yaml` - Current authentication context
- `config.yaml` - User preferences

## Troubleshooting

### Extension Not Showing

1. Ensure VSCode version is 1.85.0+
2. Check the Pinecone icon in the Activity Bar (left sidebar)
3. Try `Developer: Reload Window` from the Command Palette
4. Check Output panel (View > Output) and select "Pinecone" for extension logs

### Authentication Issues

| Issue | Solution |
|-------|----------|
| Login fails | Check your network connection; ensure popup blockers aren't blocking the OAuth window |
| "Token expired" | Run `Pinecone: Logout` then log in again |
| "x-project-id required" | Expand an organization and select a project before accessing indexes/assistants |
| CLI credentials not detected | Ensure `~/.config/pinecone/secrets.yaml` exists and is readable |

**Reset authentication:**
```bash
# Clear all Pinecone credentials (CLI and extension)
rm ~/.config/pinecone/secrets.yaml
rm ~/.config/pinecone/state.yaml
```

### "Not Authenticated" Error

1. Click the **Login** button in the tree view title bar
2. If your session expired, log out and log in again
3. For JWT auth, ensure you've selected a project (click on a project in the tree)

### Commands Disabled

Commands are disabled when not authenticated. Log in first to enable them.

### API Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `401 Unauthorized` | Invalid or expired token | Log out and log in again |
| `403 Forbidden` | Insufficient permissions | Check your role in the Pinecone Console |
| `404 Not Found` | Resource doesn't exist | Refresh the tree view; resource may have been deleted |
| `429 Too Many Requests` | Rate limit exceeded | Wait a moment and try again |
| `500 Internal Server Error` | Server issue | Try again later; check [Pinecone Status](https://status.pinecone.io) |

### Query Issues

**Integrated Embedding indexes:**
- Use text input, not vectors
- Ensure your query text field matches the configured field name

**Standard indexes:**
- Use vector arrays like `[0.1, 0.2, 0.3, ...]`
- Vector dimension must match index dimension
- Use `vec:id` format to query by existing vector ID

### Chat/Assistant Issues

| Issue | Solution |
|-------|----------|
| Chat not responding | Check if assistant status is "Ready" in the tree view |
| "Session Expired" error | For OAuth users, the extension creates managed API keys for data plane operations. Try logging out and back in. |
| "No target project selected" | Select a project in the tree view before chatting with an assistant |
| File upload fails | Ensure file type is supported (PDF, TXT, DOCX, MD, JSON, CSV) |
| Citations not showing | Citations appear only when the response references uploaded files |
| Stream interrupted | Network issues; try again or disable streaming in chat options |

**Note on Authentication for Assistants:**
When using OAuth login, the Assistant chat API requires API key authentication (not Bearer tokens). 
The extension automatically creates and manages API keys for each project, similar to the Pinecone CLI.
These managed keys are stored in `~/.config/pinecone/secrets.yaml`.

### Performance Issues

1. **Slow tree loading**: Large organizations with many projects/indexes take longer to load
2. **Query timeout**: Reduce `topK` value or use namespace filtering
3. **Extension startup slow**: Normal on first activation; subsequent loads are faster

### Network Issues

If you're behind a corporate proxy:
1. Configure VSCode proxy settings: `http.proxy` and `http.proxyStrictSSL`
2. Some networks block the OAuth callback port (59049); check firewall rules

### Debug Logging

For detailed debugging information:
1. Open Output panel (View > Output)
2. Select "Pinecone" from the dropdown
3. Look for `[Pinecone]` prefixed log messages

To file a bug report, include:
- VSCode version
- Extension version
- Error messages from Output panel
- Steps to reproduce

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Documentation for Contributors

- [Architecture Overview](docs/architecture.md) - Understand the codebase structure
- [Debugging Guide](docs/debugging.md) - How to debug the extension
- [Testing Guide](docs/testing.md) - How to write and run tests

### Development Setup

```bash
# Clone the repository
git clone https://github.com/pinecone-io/pinecone-vscode.git
cd pinecone-vscode

# Install dependencies
npm install

# Start development
npm run watch

# Validate before opening a PR
npm run check-types
npm run lint
npm test
npm run test:coverage

# Press F5 to debug
```

Optional integration smoke tests:

```bash
PINECONE_API_KEY=... PINECONE_INTEGRATION_TESTS=true npm run test:integration
```

## License

Apache 2.0 - See [LICENSE](LICENSE) for details.

## Links

- [Pinecone Documentation](https://docs.pinecone.io)
- [Pinecone Console](https://app.pinecone.io)
- [Pinecone CLI](https://github.com/pinecone-io/cli)
- [Report Issues](https://github.com/pinecone-io/pinecone-vscode/issues)
