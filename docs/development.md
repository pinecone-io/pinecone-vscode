# Development Guide

This guide is for contributors working on the extension source.

## Prerequisites

- Node.js 18+
- npm 9+
- VS Code 1.85+

## Setup

```bash
npm ci
npm run compile
```

To run the extension in a VS Code Extension Host, press `F5` from the workspace.

## Validation commands

```bash
npm run check-types
npm run lint
npm test
npm run test:coverage
```

Integration smoke tests are env-gated:

```bash
PINECONE_API_KEY=... PINECONE_INTEGRATION_TESTS=true npm run test:integration
```

## Packaging

```bash
npx @vscode/vsce package
```

## Workspace cleanup

Generated local artifacts can be removed with:

```bash
npm run clean:artifacts
```

This removes local VS Code test binaries, coverage output, and generated VSIX artifacts.

## Additional references

- [architecture.md](architecture.md)
- [api-reference.md](api-reference.md)
- [testing.md](testing.md)
- [debugging.md](debugging.md)
