# Contributing to Pinecone VSCode Extension

Thank you for your interest in contributing to the Pinecone VSCode Extension! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Style Guide](#style-guide)

## Additional Documentation

For more detailed guides, see the `docs/` folder:

- **[Architecture Overview](docs/architecture.md)** - Understand the codebase structure and design
- **[Debugging Guide](docs/debugging.md)** - How to debug the extension
- **[Testing Guide](docs/testing.md)** - How to write and run tests

## Code of Conduct

This project adheres to a code of conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18.x or later
- [npm](https://www.npmjs.com/) 9.x or later
- [Visual Studio Code](https://code.visualstudio.com/) 1.85.0 or later
- A [Pinecone account](https://app.pinecone.io) for testing

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/pinecone-io/pinecone-vscode.git
   cd pinecone-vscode
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Open in VSCode**
   ```bash
   code .
   ```

4. **Start debugging**
   - Press `F5` to launch the Extension Development Host
   - A new VSCode window will open with the extension loaded

### Building

```bash
# Compile TypeScript
npm run compile

# Watch mode for development
npm run watch
```

### Common Development Tasks

This section lists common tasks you'll perform during development.

#### Linting and Formatting

```bash
# Check for linting errors
npm run lint

# TypeScript type checking (done during compile)
npm run compile
```

The project uses ESLint for linting. All linting rules are defined in `.eslintrc.json`.

#### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run integration smoke tests (requires env vars)
PINECONE_API_KEY=... PINECONE_INTEGRATION_TESTS=true npm run test:integration
```

See [docs/testing.md](docs/testing.md) for detailed testing guidance.

#### Type Checking

TypeScript type checking is performed during compilation:

```bash
npm run compile
```

Fix any type errors before submitting changes. The `tsconfig.json` file defines the TypeScript configuration.

#### Pre-commit Checklist

Before committing changes, ensure:

1. **Code compiles**: `npm run compile`
2. **Linting passes**: `npm run lint`
3. **Tests pass**: `npm test`
4. **No console.log statements**: Use the logger utility instead

#### Setting Up Git Hooks (Optional)

You can automate the pre-commit checklist using git hooks. Create `.git/hooks/pre-commit`:

```bash
#!/bin/sh
# Pre-commit hook for Pinecone VSCode extension

echo "Running pre-commit checks..."

# Compile TypeScript
echo "Compiling TypeScript..."
npm run compile
if [ $? -ne 0 ]; then
    echo "❌ Compilation failed. Fix errors before committing."
    exit 1
fi

# Run linter
echo "Running ESLint..."
npm run lint
if [ $? -ne 0 ]; then
    echo "❌ Linting failed. Fix errors before committing."
    exit 1
fi

# Run tests
echo "Running tests..."
npm test
if [ $? -ne 0 ]; then
    echo "❌ Tests failed. Fix errors before committing."
    exit 1
fi

echo "✅ All pre-commit checks passed!"
exit 0
```

Make the hook executable:

```bash
chmod +x .git/hooks/pre-commit
```

**Bypassing hooks (use sparingly):**

```bash
git commit --no-verify -m "WIP: work in progress"
```

## Project Structure

```
pinecone-vscode/
├── src/
│   ├── api/                  # Pinecone API clients
│   │   ├── client.ts         # Base HTTP client with auth
│   │   ├── controlPlane.ts   # Index CRUD, backups, restore jobs
│   │   ├── dataPlane.ts      # Vector operations (query, search)
│   │   ├── assistantApi.ts   # Assistants, streaming chat, files
│   │   ├── adminApi.ts       # Projects, organizations
│   │   ├── namespaceApi.ts   # Namespace management
│   │   └── types.ts          # TypeScript interfaces
│   ├── commands/             # Command handlers
│   │   ├── auth.ts           # Login, logout
│   │   ├── index.commands.ts # Index CRUD, backups, restore
│   │   ├── assistant.commands.ts # Assistant CRUD, chat
│   │   ├── file.commands.ts  # File upload/delete
│   │   ├── namespace.commands.ts # Namespace CRUD
│   │   └── project.commands.ts   # Project management
│   ├── providers/            # VSCode providers
│   │   ├── pineconeTreeDataProvider.ts # Tree view data
│   │   └── treeItems.ts      # Tree item definitions
│   ├── services/             # Business logic
│   │   ├── authService.ts    # OAuth authentication
│   │   ├── configService.ts  # CLI-compatible config files
│   │   └── pineconeService.ts # High-level service facade
│   ├── webview/              # WebView panels
│   │   ├── queryPanel.ts     # Index query interface
│   │   ├── chatPanel.ts      # Assistant chat with streaming
│   │   └── html/             # HTML templates
│   ├── utils/                # Utilities
│   │   └── constants.ts      # API URLs, OAuth config
│   ├── test/                 # Test suites
│   │   └── suite/            # Mocha test files
│   └── extension.ts          # Entry point
├── media/                    # Static assets (CSS, JS for webviews)
├── resources/                # Extension resources (icons)
├── test-fixtures/            # Test data files (JSON samples)
└── docs/                     # Developer documentation
```

## Making Changes

### Branch Naming

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring

Example: `feature/add-namespace-support`

### Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style (formatting, semicolons, etc.)
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance tasks

Example:
```
feat(index): add deletion protection toggle

Added ability to enable/disable deletion protection from the
configure index menu. Users are warned before deleting protected
indexes.

Closes #123
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run integration smoke tests (env-gated)
PINECONE_API_KEY=... PINECONE_INTEGRATION_TESTS=true npm run test:integration
```

`npm run test:coverage` writes temporary V8 coverage JSON into `.coverage/` and then validates artifact presence.

### Writing Tests

Tests are located in `src/test/`. Use the following patterns:

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('MyFeature Test Suite', () => {
    test('should do something', async () => {
        // Arrange
        const input = 'test';
        
        // Act
        const result = await myFunction(input);
        
        // Assert
        assert.strictEqual(result, 'expected');
    });
});
```

### Test Categories

- **Unit Tests**: Test individual functions/classes in isolation
- **Integration Tests**: Test interactions between components
- **E2E Tests**: Test full user workflows

## Submitting Changes

1. **Create a branch** from `main`
2. **Make your changes** following the style guide
3. **Add/update tests** as needed
4. **Update documentation** if applicable
5. **Run tests** to ensure everything passes
6. **Create a Pull Request** with a clear description

### Pull Request Guidelines

- Provide a clear title and description
- Reference any related issues
- Include screenshots for UI changes
- Ensure CI checks pass
- Request review from maintainers

## Style Guide

### TypeScript

- Use TypeScript strict mode
- Prefer `const` over `let`
- Use async/await over promises
- Add JSDoc comments to public APIs
- Follow existing code patterns

### Code Formatting

```typescript
// Good
async function fetchData(id: string): Promise<Data> {
    const response = await client.get(`/data/${id}`);
    return response.data;
}

// Bad
async function fetchData(id) {
    return client.get('/data/' + id).then(r => r.data);
}
```

### Documentation

- Add JSDoc comments to all public functions, classes, and interfaces
- Include `@param`, `@returns`, and `@throws` tags
- Provide examples for complex APIs

```typescript
/**
 * Creates a new index with the specified configuration.
 * 
 * @param config - Index configuration options
 * @returns The created index model
 * @throws {PineconeApiError} When creation fails
 * 
 * @example
 * ```typescript
 * const index = await createIndex({
 *   name: 'my-index',
 *   dimension: 1536
 * });
 * ```
 */
async function createIndex(config: IndexConfig): Promise<IndexModel> {
    // ...
}
```

### Error Handling

- Use custom error types where appropriate
- Provide actionable error messages
- Log errors with context for debugging

```typescript
try {
    await api.createIndex(config);
} catch (error) {
    if (error instanceof PineconeApiError && error.status === 409) {
        throw new Error(`Index "${config.name}" already exists`);
    }
    throw error;
}
```

## API Reference

### Core APIs

| API | Purpose |
|-----|---------|
| `ControlPlaneApi` | Index CRUD, backups, restore jobs |
| `DataPlaneApi` | Vector query and text search on index hosts |
| `AssistantApi` | Assistants, chat (streaming), files |
| `AdminApi` | Projects, organizations |
| `NamespaceApi` | Namespace management within indexes |

### Streaming Chat

For streaming responses, use the `chatStream` method:

```typescript
const controller = assistantApi.chatStream(host, name, messages, {
    onChunk: (chunk) => {
        if (chunk.type === 'content_chunk') {
            // Handle incremental content
        }
    },
    onError: (error) => { /* Handle error */ },
    onComplete: () => { /* Finalize response */ }
});

// To abort:
controller.abort();
```

### Serverless-Only Architecture

This extension only supports serverless indexes. The `PodSpec` type is retained
for read-only compatibility with existing pod indexes, which support limited
operations (Query and Delete only).

## Questions?

If you have questions about contributing, please:

1. Check existing issues and discussions
2. Open a new issue with the `question` label
3. Reach out on the [Pinecone Community](https://community.pinecone.io/)

Thank you for contributing!
