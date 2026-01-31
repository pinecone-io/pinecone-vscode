# Test Fixtures

This directory contains test data files used by the test suite.

## Purpose

Test fixtures provide:
- Sample API responses for mocking
- Input data for validation tests
- Complex data structures for parsing tests

## Usage

Load fixtures in tests:

```typescript
import * as path from 'path';
import * as fs from 'fs';

const fixturesPath = path.join(__dirname, '..', '..', '..', 'test-fixtures');

function loadFixture<T>(name: string): T {
    const filePath = path.join(fixturesPath, name);
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

// In a test
test('should parse index list response', () => {
    const data = loadFixture<{ indexes: IndexModel[] }>('index-list.json');
    assert.ok(Array.isArray(data.indexes));
});
```

## File Naming Convention

- `{resource}-{action}.json` - API response data
- `{resource}-{variant}.json` - Data variants
- `invalid-{resource}.json` - Invalid data for error testing

## Example Files

### index-list.json

```json
{
    "indexes": [
        {
            "name": "test-index",
            "dimension": 1536,
            "metric": "cosine",
            "host": "test-index-abc123.svc.us-east-1.pinecone.io",
            "status": { "ready": true, "state": "Ready" },
            "spec": {
                "serverless": {
                    "cloud": "aws",
                    "region": "us-east-1"
                }
            }
        }
    ]
}
```

### assistant-chat-response.json

```json
{
    "message": {
        "role": "assistant",
        "content": "Based on the documentation..."
    },
    "citations": [
        {
            "position": 0,
            "references": [
                {
                    "file": { "name": "docs.pdf", "id": "file-123" },
                    "pages": [1, 2]
                }
            ]
        }
    ]
}
```

## Available Fixtures

| File | Description |
|------|-------------|
| `index-list.json` | Sample index listing response |
| `assistant-list.json` | Sample assistant listing response |
| `chat-response.json` | Sample chat completion response |
| `query-response.json` | Sample query result response |
| `namespace-list.json` | Sample namespace listing with schemas |
| `restore-job-list.json` | Sample restore job listing with various statuses |

### namespace-list.json

Contains sample namespace listing including:
- Default namespace (empty name)
- Named namespaces with schemas and record counts
- Pagination token example

### restore-job-list.json

Contains sample restore jobs including:
- Completed job (100%)
- In-progress job (65%)
- Failed job (23%)
- Recently started job (12%)

## Adding New Fixtures

1. Create a JSON file with realistic sample data
2. Name it descriptively following the convention
3. Document its purpose in this README
4. Reference it in the relevant test file

## Notes

- Keep fixtures minimal but complete
- Use realistic field values
- Include edge cases (empty arrays, null fields)
- Don't include real API keys or sensitive data
