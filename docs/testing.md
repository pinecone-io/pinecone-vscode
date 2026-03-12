# Testing Guide

This repository uses a layered test strategy:

1. Unit/behavior tests (`src/test/suite/*.test.ts`) run in the VS Code extension host.
2. Env-gated integration smoke tests (`src/test/integration/*.integration.test.ts`) run only when credentials are provided.

## Scripts

- `npm run check-types`: TypeScript validation.
- `npm run lint`: ESLint validation.
- `npm test`: Suite tests only (`out/test/suite/**/*.test.js`).
- `npm run test:coverage`: suite tests with V8 coverage output (`.coverage/`) + artifact presence check.
- `npm run test:integration`: integration smoke tests (`out/test/integration/**/*.integration.test.js`).

Integration test gate:

- `PINECONE_API_KEY` must be set.
- `PINECONE_INTEGRATION_TESTS=true` must be set.

## Testing Standards

### Production-code targeting

Tests should execute production classes/functions directly, not shadow copies.

Required pattern:

- instantiate real class,
- inject mocks/stubs at boundaries (network, VS Code UI, auth),
- assert behavior from public or stable internal interfaces.

Avoid:

- re-implementing service/client logic in test-only classes,
- asserting purely on hand-written duplicate logic,
- “documentation-only” tests that cannot fail meaningfully.

### Regression coverage requirements

Bug fixes must include failing-before/passing-after tests for:

- auth callback lifecycle (`EADDRINUSE`, timeout cleanup),
- project-context fallback from organization metadata,
- host normalization (`host` and `https://host` inputs),
- standardized explorer refresh sequencing/debounce.

### Error handling consistency

Auth/network/API error tests should validate behavior through `classifyError()` and related shared utilities (`src/utils/errorHandling.ts`).

## Running Locally

```bash
npm ci
npm run check-types
npm run lint
npm test
npm run test:coverage
```

Integration (optional):

```bash
PINECONE_API_KEY=... PINECONE_INTEGRATION_TESTS=true npm run test:integration
```

## CI Gates

The CI workflow enforces:

1. type checking,
2. linting,
3. suite tests,
4. coverage artifact presence.

If coverage output is missing, `npm run coverage:check` fails the build.
