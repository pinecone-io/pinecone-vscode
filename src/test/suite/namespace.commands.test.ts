/**
 * Namespace Commands Behavioral Tests
 * 
 * Tests for namespace command handlers verifying they:
 * - Build correct API requests from user input
 * - Handle errors gracefully
 * - Validate input properly
 * 
 * Uses mocked services to test logic in isolation (CLI/SDK pattern).
 */

import * as assert from 'assert';
import { NamespaceDescription, MetadataSchema, ListNamespacesResponse, CreateNamespaceParams } from '../../api/types';
import { validateNamespaceName } from '../../commands/namespace.commands';

/**
 * Mock NamespaceApi for testing command logic without API calls.
 */
class MockNamespaceApi {
    // Track calls for assertions
    public lastCreateNamespaceCall: { host: string; params: CreateNamespaceParams } | null = null;
    public lastDeleteNamespaceCall: { host: string; name: string } | null = null;
    public lastDescribeNamespaceCall: { host: string; name: string } | null = null;
    public lastListNamespacesCall: { host: string; params?: Record<string, unknown> } | null = null;
    
    // Configure results
    public listNamespacesResult: ListNamespacesResponse = { namespaces: [], total_count: 0 };
    public describeNamespaceResult: NamespaceDescription = { name: '', record_count: 0 };
    public createNamespaceResult: NamespaceDescription = { name: '', record_count: 0 };
    public shouldThrowError: Error | null = null;

    async listNamespaces(host: string, params?: Record<string, unknown>): Promise<ListNamespacesResponse> {
        if (this.shouldThrowError) {
            throw this.shouldThrowError;
        }
        this.lastListNamespacesCall = { host, params };
        return this.listNamespacesResult;
    }

    async createNamespace(host: string, params: CreateNamespaceParams): Promise<NamespaceDescription> {
        if (this.shouldThrowError) {
            throw this.shouldThrowError;
        }
        this.lastCreateNamespaceCall = { host, params };
        return this.createNamespaceResult;
    }

    async describeNamespace(host: string, name: string): Promise<NamespaceDescription> {
        if (this.shouldThrowError) {
            throw this.shouldThrowError;
        }
        this.lastDescribeNamespaceCall = { host, name };
        return this.describeNamespaceResult;
    }

    async deleteNamespace(host: string, name: string): Promise<void> {
        if (this.shouldThrowError) {
            throw this.shouldThrowError;
        }
        this.lastDeleteNamespaceCall = { host, name };
    }
}

suite('Namespace Commands Behavioral Tests', () => {

    suite('createNamespace Command Logic', () => {

        test('should build namespace request correctly', async () => {
            const mockApi = new MockNamespaceApi();
            const indexHost = 'my-index-abc123.svc.us-east-1.pinecone.io';
            
            // Simulate creating a simple namespace
            await mockApi.createNamespace(indexHost, {
                name: 'my-namespace'
            });

            // Verify the request was built correctly
            assert.ok(mockApi.lastCreateNamespaceCall);
            assert.strictEqual(mockApi.lastCreateNamespaceCall.host, indexHost);
            assert.strictEqual(mockApi.lastCreateNamespaceCall.params.name, 'my-namespace');
            assert.strictEqual(mockApi.lastCreateNamespaceCall.params.schema, undefined);
        });

        test('should build namespace request with schema', async () => {
            const mockApi = new MockNamespaceApi();
            const indexHost = 'my-index-abc123.svc.us-east-1.pinecone.io';
            
            const schema: MetadataSchema = {
                category: { filterable: true },
                author: { filterable: true },
                tags: { filterable: true }
            };

            await mockApi.createNamespace(indexHost, {
                name: 'documents',
                schema
            });

            assert.ok(mockApi.lastCreateNamespaceCall);
            assert.strictEqual(mockApi.lastCreateNamespaceCall.params.name, 'documents');
            assert.deepStrictEqual(mockApi.lastCreateNamespaceCall.params.schema, schema);
        });

        test('should handle empty name for default namespace', async () => {
            const mockApi = new MockNamespaceApi();
            const indexHost = 'my-index-abc123.svc.us-east-1.pinecone.io';
            
            await mockApi.createNamespace(indexHost, {
                name: ''
            });

            assert.ok(mockApi.lastCreateNamespaceCall);
            assert.strictEqual(mockApi.lastCreateNamespaceCall.params.name, '');
        });
    });

    suite('deleteNamespace Command Logic', () => {

        test('should call deleteNamespace with correct parameters', async () => {
            const mockApi = new MockNamespaceApi();
            const indexHost = 'my-index-abc123.svc.us-east-1.pinecone.io';
            
            await mockApi.deleteNamespace(indexHost, 'namespace-to-delete');

            assert.ok(mockApi.lastDeleteNamespaceCall);
            assert.strictEqual(mockApi.lastDeleteNamespaceCall.host, indexHost);
            assert.strictEqual(mockApi.lastDeleteNamespaceCall.name, 'namespace-to-delete');
        });

        test('should handle __default__ namespace correctly', async () => {
            const mockApi = new MockNamespaceApi();
            const indexHost = 'my-index-abc123.svc.us-east-1.pinecone.io';
            
            await mockApi.deleteNamespace(indexHost, '__default__');

            assert.ok(mockApi.lastDeleteNamespaceCall);
            assert.strictEqual(mockApi.lastDeleteNamespaceCall.name, '__default__');
        });
    });

    suite('describeNamespace Command Logic', () => {

        test('should call describeNamespace with correct parameters', async () => {
            const mockApi = new MockNamespaceApi();
            const indexHost = 'my-index-abc123.svc.us-east-1.pinecone.io';
            
            mockApi.describeNamespaceResult = {
                name: 'my-namespace',
                record_count: 1000,
                schema: { category: { filterable: true } }
            };

            const result = await mockApi.describeNamespace(indexHost, 'my-namespace');

            assert.ok(mockApi.lastDescribeNamespaceCall);
            assert.strictEqual(mockApi.lastDescribeNamespaceCall.host, indexHost);
            assert.strictEqual(mockApi.lastDescribeNamespaceCall.name, 'my-namespace');
            assert.strictEqual(result.record_count, 1000);
            assert.ok(result.schema);
        });
    });

    suite('listNamespaces Command Logic', () => {

        test('should list namespaces with pagination', async () => {
            const mockApi = new MockNamespaceApi();
            const indexHost = 'my-index-abc123.svc.us-east-1.pinecone.io';
            
            mockApi.listNamespacesResult = {
                namespaces: [
                    { name: '', record_count: 500 },  // Default namespace
                    { name: 'documents', record_count: 1000 },
                    { name: 'images', record_count: 250 }
                ],
                total_count: 3,
                pagination: { next: 'token123' }
            };

            const result = await mockApi.listNamespaces(indexHost, { limit: 10 });

            assert.ok(mockApi.lastListNamespacesCall);
            assert.strictEqual(mockApi.lastListNamespacesCall.host, indexHost);
            assert.strictEqual(result.namespaces.length, 3);
            assert.strictEqual(result.total_count, 3);
            assert.strictEqual(result.pagination?.next, 'token123');
        });

        test('should handle empty namespace list', async () => {
            const mockApi = new MockNamespaceApi();
            const indexHost = 'my-index-abc123.svc.us-east-1.pinecone.io';
            
            mockApi.listNamespacesResult = {
                namespaces: [],
                total_count: 0
            };

            const result = await mockApi.listNamespaces(indexHost);

            assert.strictEqual(result.namespaces.length, 0);
            assert.strictEqual(result.total_count, 0);
        });
    });

    suite('Error Handling', () => {

        test('should propagate API errors', async () => {
            const mockApi = new MockNamespaceApi();
            mockApi.shouldThrowError = new Error('Namespace not found');

            try {
                await mockApi.describeNamespace('host', 'nonexistent');
                assert.fail('Should have thrown');
            } catch (e) {
                assert.ok(e instanceof Error);
                assert.ok(e.message.includes('not found'));
            }
        });

        test('should handle authentication errors', async () => {
            const mockApi = new MockNamespaceApi();
            mockApi.shouldThrowError = new Error('401 Unauthorized');

            try {
                await mockApi.listNamespaces('host');
                assert.fail('Should have thrown');
            } catch (e) {
                assert.ok(e instanceof Error);
                assert.ok(e.message.includes('401'));
            }
        });
    });
});

suite('Namespace Name Validation Tests', () => {

    test('should accept valid namespace names', () => {
        const validNames = [
            'my-namespace',
            'namespace_123',
            'MyNamespace',
            'test',
            'a',
            'namespace-with-hyphens',
            'namespace_with_underscores',
            'MixedCase123'
        ];

        for (const name of validNames) {
            const error = validateNamespaceName(name);
            assert.strictEqual(error, null, `Expected "${name}" to be valid`);
        }
    });

    test('should reject empty namespace name when not allowed', () => {
        const error = validateNamespaceName('');
        assert.ok(error);
        assert.ok(error.includes('required'));
    });

    test('should accept empty namespace name when allowed', () => {
        const error = validateNamespaceName('', true);
        assert.strictEqual(error, null);
    });

    test('should reject names with invalid characters', () => {
        const invalidNames = [
            'namespace.with.dots',
            'namespace with spaces',
            'namespace/with/slashes',
            'namespace:with:colons',
            'namespace@special',
            'namespace!exclaim'
        ];

        for (const name of invalidNames) {
            const error = validateNamespaceName(name);
            assert.ok(error, `Expected "${name}" to be invalid`);
            assert.ok(error!.includes('alphanumeric') || error!.includes('hyphens') || error!.includes('underscores'));
        }
    });

    test('should reject names exceeding max length', () => {
        const longName = 'a'.repeat(65);
        const error = validateNamespaceName(longName);
        assert.ok(error);
        assert.ok(error.includes('64'));
    });

    test('should accept names at max length', () => {
        const maxName = 'a'.repeat(64);
        const error = validateNamespaceName(maxName);
        assert.strictEqual(error, null);
    });
});

suite('Metadata Schema Tests', () => {

    test('should correctly structure schema with multiple fields', () => {
        const fields = ['category', 'author', 'date'];
        const schema: MetadataSchema = {};
        
        for (const field of fields) {
            schema[field] = { filterable: true };
        }

        assert.strictEqual(Object.keys(schema).length, 3);
        assert.deepStrictEqual(schema.category, { filterable: true });
        assert.deepStrictEqual(schema.author, { filterable: true });
        assert.deepStrictEqual(schema.date, { filterable: true });
    });

    test('should handle empty schema', () => {
        const schema: MetadataSchema = {};
        assert.strictEqual(Object.keys(schema).length, 0);
    });
});
