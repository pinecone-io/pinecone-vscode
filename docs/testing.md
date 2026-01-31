# Testing Guide

This guide covers the testing strategy, test types, and how to write tests for the Pinecone VSCode Extension.

## Test Structure

```
src/test/
└── suite/
    ├── index.ts                  # Test runner entry point
    ├── extension.test.ts         # Extension activation tests
    ├── commands.test.ts          # Command registration tests
    ├── index.commands.test.ts    # Index command behavioral tests
    ├── assistant.commands.test.ts # Assistant command behavioral tests
    ├── file.commands.test.ts     # File command behavioral tests
    ├── namespace.commands.test.ts # Namespace command behavioral tests
    ├── project.commands.test.ts  # Project command behavioral tests
    ├── pineconeService.test.ts   # PineconeService unit tests
    ├── configService.test.ts     # ConfigService unit tests
    ├── api.clients.test.ts       # API client unit tests
    ├── fixtures.test.ts          # Fixture-based and parameterized tests
    ├── streaming.test.ts         # Streaming chat (SSE) tests
    ├── error.handling.test.ts    # Error handling tests
    ├── auth.test.ts              # Authentication tests
    ├── client.test.ts            # HTTP client tests
    ├── api.test.ts               # API endpoint tests
    ├── logger.test.ts            # Logger utility tests
    └── treeView.test.ts          # Tree view tests

test-fixtures/               # Test data files
├── index-list.json          # Sample index listing
├── assistant-list.json      # Sample assistant listing
├── chat-response.json       # Sample chat response
├── query-response.json      # Sample query response
├── namespace-list.json      # Sample namespace listing
└── restore-job-list.json    # Sample restore job listing
```

## Running Tests

### All Tests

```bash
npm test
```

### With Coverage

```bash
npm run test:coverage
```

### Single Test File

Run tests in a specific file via the VSCode debugger:

1. Open the test file
2. Set `"Extension Tests"` configuration in launch.json
3. Press F5

## Test Types

### 1. Registration Tests

Verify commands, views, and configurations are properly registered:

```typescript
test('Authentication commands should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('pinecone.login'));
    assert.ok(commands.includes('pinecone.logout'));
});
```

### 2. Behavioral Tests (Unit)

Test command logic with mocked services (CLI/SDK pattern):

```typescript
class MockPineconeService {
    public lastCreateIndexCall: Partial<IndexModel> | null = null;

    async createIndex(index: Partial<IndexModel>): Promise<IndexModel> {
        this.lastCreateIndexCall = index;
        return { name: index.name, ...index } as IndexModel;
    }
}

test('should build serverless index request correctly', () => {
    const mockService = new MockPineconeService();
    
    mockService.createIndex({
        name: 'my-index',
        dimension: 1536,
        metric: 'cosine',
        spec: { serverless: { cloud: 'aws', region: 'us-east-1' } }
    });

    assert.strictEqual(mockService.lastCreateIndexCall?.name, 'my-index');
    assert.strictEqual(mockService.lastCreateIndexCall?.dimension, 1536);
});
```

### 3. Validation Tests

Test input validation logic:

```typescript
function validateIndexName(name: string): string | null {
    if (!name) return 'Name is required';
    if (!/^[a-z0-9-]+$/.test(name)) return 'Invalid characters';
    if (name.length > 45) return 'Name too long';
    return null;
}

test('should reject uppercase letters', () => {
    const error = validateIndexName('MyIndex');
    assert.ok(error);
    assert.ok(error.includes('characters'));
});
```

### 4. Error Handling Tests

Verify errors are detected and handled correctly:

```typescript
function isAuthError(error: unknown): boolean {
    const message = String(error).toLowerCase();
    return message.includes('401') || message.includes('unauthorized');
}

test('should detect 401 errors', () => {
    const error = new PineconeApiError(401, 'Unauthorized');
    assert.ok(isAuthError(error));
});
```

### 5. Integration Tests

Test component interactions (use sparingly, as they're slower):

```typescript
test('Extension should activate', async () => {
    const ext = vscode.extensions.getExtension('pinecone.pinecone-vscode');
    if (!ext.isActive) {
        await ext.activate();
    }
    assert.ok(ext.isActive);
});
```

## Writing New Tests

### Test File Template

```typescript
/**
 * [Feature] Tests
 * 
 * Tests for [feature] verifying:
 * - [Behavior 1]
 * - [Behavior 2]
 */

import * as assert from 'assert';
// Import what you need to test

suite('[Feature] Test Suite', () => {

    // Optional setup/teardown
    setup(() => {
        // Runs before each test
    });

    teardown(() => {
        // Runs after each test
    });

    test('should [expected behavior]', async () => {
        // Arrange
        const input = 'test';
        
        // Act
        const result = functionUnderTest(input);
        
        // Assert
        assert.strictEqual(result, 'expected');
    });
});
```

### Mocking Services

Create mock classes that track calls for assertions:

```typescript
class MockService {
    // Track method calls
    public calls: Array<{ method: string; args: unknown[] }> = [];
    
    // Configure return values
    public returnValue: unknown = null;
    public shouldThrow: Error | null = null;

    async someMethod(arg: string): Promise<unknown> {
        this.calls.push({ method: 'someMethod', args: [arg] });
        
        if (this.shouldThrow) {
            throw this.shouldThrow;
        }
        
        return this.returnValue;
    }
}
```

### Testing Error Scenarios

```typescript
test('should handle API error gracefully', async () => {
    const mockService = new MockService();
    mockService.shouldThrow = new PineconeApiError(500, 'Server error');

    try {
        await mockService.someMethod('test');
        assert.fail('Should have thrown');
    } catch (error) {
        assert.ok(error instanceof PineconeApiError);
        assert.strictEqual(error.status, 500);
    }
});
```

### Testing Async Code

```typescript
test('should complete async operation', async () => {
    const result = await asyncFunction();
    assert.ok(result);
});

test('should reject on error', async () => {
    await assert.rejects(
        async () => await functionThatThrows(),
        { message: /expected error/ }
    );
});
```

## Test Fixtures

Place test data in `test-fixtures/`:

```
test-fixtures/
├── sample-index.json
├── sample-assistant.json
└── sample-query-response.json
```

Use in tests:

```typescript
import * as path from 'path';
import * as fs from 'fs';

const fixturesPath = path.join(__dirname, '..', '..', '..', 'test-fixtures');

function loadFixture(name: string): unknown {
    const filePath = path.join(fixturesPath, name);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('should parse index response', () => {
    const data = loadFixture('sample-index.json');
    // Use fixture data in test
});
```

## Best Practices

### DO

- ✅ Test one behavior per test
- ✅ Use descriptive test names
- ✅ Mock external dependencies
- ✅ Test error cases, not just happy paths
- ✅ Keep tests fast and isolated
- ✅ Use the Arrange-Act-Assert pattern

### DON'T

- ❌ Test VSCode internals
- ❌ Make real API calls in unit tests
- ❌ Share state between tests
- ❌ Skip error handling tests
- ❌ Write tests that depend on execution order

## Continuous Integration

Tests run automatically on:
- Pull requests
- Pushes to main

The CI workflow:
1. Installs dependencies
2. Compiles TypeScript
3. Runs linting
4. Runs tests with coverage

### Local vs CI Testing

**Local Testing:**
- Tests run in an Extension Development Host window
- VSCode APIs are available
- May require display (use Xvfb on headless systems)

**CI Testing:**
- Uses `vscode-test` to download and run VSCode
- Runs headless where possible
- Requires `xvfb-run` on Linux CI runners

### CI Configuration Example

```yaml
# GitHub Actions example
- name: Run tests
  run: |
    xvfb-run -a npm test
  if: runner.os == 'Linux'
  
- name: Run tests (macOS/Windows)
  run: npm test
  if: runner.os != 'Linux'
```

## Integration Test Setup

For tests that require real API interaction (use sparingly):

### Environment Variables

Create a `.env.test` file (not committed):

```bash
PINECONE_API_KEY=your-test-api-key
PINECONE_ENVIRONMENT=us-west1-gcp
```

### Test Isolation

Integration tests should:
- Use unique resource names (e.g., `test-index-{timestamp}`)
- Clean up resources after test completion
- Be skippable when credentials aren't available

```typescript
const SKIP_INTEGRATION = !process.env.PINECONE_API_KEY;

suite('Integration Tests', () => {
    if (SKIP_INTEGRATION) {
        test.skip('requires PINECONE_API_KEY', () => {});
        return;
    }
    
    // Integration tests here
});
```

## Coverage Goals

Aim for coverage on:
- Command handlers (validation, API calls)
- Error detection and handling
- Input validation functions
- Authentication state management

Coverage is less critical for:
- VSCode API wrappers
- Simple getters/setters
- UI presentation code
