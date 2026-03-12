# Pinecone VSCode Extension

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![VSCode Marketplace](https://img.shields.io/badge/VSCode-Marketplace-blue)](https://marketplace.visualstudio.com/items?itemName=pinecone.pinecone-vscode)

Manage your Pinecone vector databases and AI assistants directly from VSCode.

## Table of Contents

- [Features](#features)
  - [Organization & Project Management](#organization--project-management)
  - [Index Management (Serverless)](#index-management-serverless)
  - [Assistant Management](#assistant-management)
  - [Authentication](#authentication)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Authentication](#authentication-1)
- [Usage Guide](#usage-guide)
  - [Managing Indexes](#managing-indexes)
  - [Managing Assistants](#managing-assistants)
- [Configuration](#configuration)
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
- **Delete Projects**: Remove projects with confirmation safeguards

### Index Management (Serverless)
- **Browse Indexes**: View all serverless indexes organized by organization and project
- **Create Indexes**: Interactive wizard with two modes:
  - **Integrated Embeddings**: Pinecone automatically converts text to vectors using hosted models (Llama Text Embed v2, Multilingual E5 Large, Pinecone Sparse English)
  - **Bring Your Own Vectors**: Create dense or sparse indexes for your own embeddings
- **Cloud Support**: AWS (us-east-1, us-west-2, eu-west-1), GCP (us-central1, europe-west4), Azure (eastus2)
- **Configure**: Update deletion protection and tags
- **Smart Query Panel**: 
  - Text-based search for indexes with integrated embeddings
  - Vector-based query for standard indexes
  - Supports ID lookup, filtering, and namespaces
- **Statistics**: View vector counts and namespace breakdown
- **Backups**: Create, view, restore, and delete index backups
- **Namespace Management**: Create, view, and delete namespaces within indexes

### Assistant Management
- **Browse Assistants**: View all assistants and their files
- **Create Assistants**: Set up new assistants with custom instructions
- **Streaming Chat**: Real-time streaming chat interface with citation support
- **Model Selection**: Choose from multiple AI models:
  - GPT-4o, GPT-4.1, GPT-5, o4-mini (OpenAI)
  - Claude Sonnet 4.5 (Anthropic)
  - Gemini 2.5 Pro (Google)
- **File Management**: Upload and delete files

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

### Managing Indexes

#### Create an Index

1. Right-click on **Database** in the tree view
2. Select **Create Index**
3. Choose your vector approach:
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

#### Query an Index

1. Right-click on an index
2. Select **Query Index**
3. Enter your query:
   - **Integrated Embedding indexes**: Enter text - Pinecone auto-converts to vectors
   - **Standard indexes**: Enter a vector array or existing vector ID
4. Configure options: Top K, namespace, filters
5. View results with metadata and optional vector values

#### View Index Statistics

1. Right-click on an index
2. Select **View Index Stats**
3. See vector counts by namespace

#### Manage Namespaces

1. Expand an index to see the **Namespaces** node
2. Right-click on **Namespaces** to create a new namespace
3. Right-click on a namespace to view details or delete

#### Backup and Restore

1. Right-click on an index for backup options:
   - **Create Backup**: Start a new backup
   - **View Backups**: See all backups for this index
   - **Restore from Backup**: Create a new index from a backup
   - **Delete Backup**: Remove a backup
2. Use `View Restore Jobs` from the command palette to monitor restore progress

### Managing Assistants

#### Create an Assistant

1. Right-click on **Assistant** in the tree view
2. Select **Create Assistant**
3. Enter name, region, and optional instructions

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
