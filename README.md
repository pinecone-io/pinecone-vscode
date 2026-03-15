# Pinecone for VS Code

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![VS Code Marketplace](https://img.shields.io/badge/VSCode-Marketplace-blue)](https://marketplace.visualstudio.com/items?itemName=pinecone.pinecone-vscode)

Build, test, and operate Pinecone indexes and assistants directly inside VS Code.

## Why install this extension?

- Manage Pinecone resources without leaving your editor.
- Use guided dialogs for index creation and configuration, backups/restores, querying, and data operations.
- Work with Assistants (chat, files, context/eval tools) in the same workspace.
- Run embeddings and reranking from the Inference Toolbox.

## What you can do

### Database workflows

- Browse organizations, projects, and indexes.
- Manage project API keys (list, create, and revoke).
- Create serverless indexes:
  - On Demand
    - Integrated embeddings
    - Bring-your-own-vectors (dense/sparse)
  - Dedicated Read Nodes (DRN, manual scaling)
- Configure index settings (tags, deletion protection, DRN settings).
- Query indexes with vector or text search (when integrated embeddings are enabled).
- Run Data Ops (upsert/fetch/update/delete/list vectors and imports).
- Manage namespaces.
- Create backups, restore backups, and monitor backup/restore jobs.

### Assistant workflows

- Create, update, and delete assistants.
- Chat with streaming responses and citations.
- Upload files with metadata and multimodal options.
- Retrieve context from assistant.
- Evaluate assistant answers.

### Inference workflows

- Generate embeddings.
- Rerank documents.

### Project admin workflows

- Create, rename, and delete projects.
- Manage project API keys from each project node.

## Screenshots

### Explorer tree

![Pinecone Explorer tree overview](https://raw.githubusercontent.com/pinecone-io/pinecone-vscode/main/docs/images/extension-ui/explorer-tree-overview.png)

### Create index (BYOV + DRN)

![Create index dialog with Dedicated Read Nodes](https://raw.githubusercontent.com/pinecone-io/pinecone-vscode/main/docs/images/extension-ui/create-index-byov-dedicated-read-nodes.png)

### Data operations

![Data Ops panel overview](https://raw.githubusercontent.com/pinecone-io/pinecone-vscode/main/docs/images/extension-ui/data-ops-panel-overview.png)

### Inference Toolbox

![Inference Toolbox overview](https://raw.githubusercontent.com/pinecone-io/pinecone-vscode/main/docs/images/extension-ui/inference-toolbox-overview.png)

### Assistant chat with citations

![Assistant chat response with citations](https://raw.githubusercontent.com/pinecone-io/pinecone-vscode/main/docs/images/extension-ui/assistant-chat-response-with-citations.png)

### Project API key management

![Project API keys panel](https://raw.githubusercontent.com/pinecone-io/pinecone-vscode/main/docs/images/extension-ui/project-api-keys-panel.png)

## Installation

### From the VS Code Marketplace

1. Open Extensions (`Cmd+Shift+X` / `Ctrl+Shift+X`).
2. Search for `Pinecone`.
3. Install `pinecone.pinecone-vscode`.

### From VSIX

1. Download the latest [release `.vsix`](https://github.com/pinecone-io/pinecone-vscode/releases).
2. Run `Extensions: Install from VSIX...`.

## Quick start

1. Open the **Pinecone** view in the Activity Bar.
2. Click **Login with Pinecone**.
3. Expand your organization/project.
4. Use **Database** and **Assistant** tree nodes for operations.
5. Right-click resources to open dialogs and actions.

## How to use it

### Primary navigation model

Most workflows are tree-context driven:

- Right-click project nodes for project management and API key operations.
- Right-click `Database`, indexes, namespaces, and backups for index operations.
- Right-click `Assistant`, assistant items, and `Files` for assistant operations.
- Use view title actions for global utility commands.

### Command Palette usage

The palette is intentionally utility-focused:

- `Pinecone: Login with Pinecone`
- `Pinecone: Logout`
- `Pinecone: Refresh`
- `Pinecone: Open Documentation`

Operational commands are exposed from the explorer context menus and dialogs.

## Requirements

- VS Code `>= 1.85.0`
- Pinecone account ([app.pinecone.io](https://app.pinecone.io))

## Troubleshooting

- If actions are disabled, refresh the explorer and check the index tooltip/state.
- If authentication fails, run logout then login again.
- If data-plane requests fail in OAuth mode, verify project context by re-expanding the project node.

## Documentation

- User + developer docs hub: [Documentation Index](https://github.com/pinecone-io/pinecone-vscode/blob/main/docs/README.md)
- UI screenshots gallery: [UI Gallery](https://github.com/pinecone-io/pinecone-vscode/blob/main/docs/ui-gallery.md)
- Contributing guide: [CONTRIBUTING.md](https://github.com/pinecone-io/pinecone-vscode/blob/main/CONTRIBUTING.md)
- Architecture: [Architecture Overview](https://github.com/pinecone-io/pinecone-vscode/blob/main/docs/architecture.md)
- API map: [API Reference](https://github.com/pinecone-io/pinecone-vscode/blob/main/docs/api-reference.md)
- Testing standards: [Testing Guide](https://github.com/pinecone-io/pinecone-vscode/blob/main/docs/testing.md)
- Debugging: [Debugging Guide](https://github.com/pinecone-io/pinecone-vscode/blob/main/docs/debugging.md)

## Feedback

- Issues: [GitHub Issues](https://github.com/pinecone-io/pinecone-vscode/issues)
- Pinecone docs: [docs.pinecone.io](https://docs.pinecone.io)

## License

Apache-2.0
