/**
 * API Client Unit Tests
 * 
 * Tests for the API client layers (Control Plane, Data Plane, Admin, Namespace).
 * Uses mock HTTP clients to test in isolation (CLI/SDK pattern).
 * 
 * Tests cover:
 * - Request construction (endpoints, headers, body)
 * - Response parsing
 * - Error handling
 * - Parameter validation
 */

import * as assert from 'assert';

// ============================================================================
// Mock Types
// ============================================================================

interface MockResponse<T> {
    status: number;
    data?: T;
    error?: string;
}

interface MockIndex {
    name: string;
    dimension: number;
    metric: string;
    host: string;
    status: { ready: boolean; state: string };
    spec?: {
        serverless?: { cloud: string; region: string };
        pod?: { environment: string; pod_type: string; replicas: number };
    };
}

interface MockBackup {
    backup_id: string;
    source_index_name: string;
    status: string;
    created_at: string;
}

interface MockNamespace {
    name: string;
    record_count: number;
}

// ============================================================================
// Mock HTTP Client
// ============================================================================

/**
 * Mock HTTP client that records requests and returns configured responses.
 */
class MockHttpClient {
    public requests: Array<{
        method: string;
        endpoint: string;
        body?: unknown;
        host?: string;
    }> = [];
    
    public responses: Map<string, MockResponse<unknown>> = new Map();
    public defaultResponse: MockResponse<unknown> = { status: 200, data: {} };
    
    setResponse<T>(key: string, response: MockResponse<T>): void {
        this.responses.set(key, response as MockResponse<unknown>);
    }

    async request<T>(
        method: string,
        endpoint: string,
        options?: { body?: unknown; host?: string }
    ): Promise<T> {
        this.requests.push({
            method,
            endpoint,
            body: options?.body,
            host: options?.host
        });

        const key = `${method}:${endpoint}`;
        const response = this.responses.get(key) || this.defaultResponse;

        if (response.status >= 400) {
            throw new Error(`API Error ${response.status}: ${response.error || 'Unknown error'}`);
        }

        return response.data as T;
    }
}

// ============================================================================
// Mock API Clients (mirroring real implementations)
// ============================================================================

/**
 * Mock ControlPlaneApi for testing request construction.
 */
class MockControlPlaneApi {
    constructor(private client: MockHttpClient) {}

    async listIndexes(): Promise<{ indexes: MockIndex[] }> {
        return this.client.request('GET', '/indexes');
    }

    async createIndex(config: Partial<MockIndex>): Promise<MockIndex> {
        return this.client.request('POST', '/indexes', { body: config });
    }

    async deleteIndex(name: string): Promise<void> {
        return this.client.request('DELETE', `/indexes/${name}`);
    }

    async describeIndex(name: string): Promise<MockIndex> {
        return this.client.request('GET', `/indexes/${name}`);
    }

    async configureIndex(
        name: string,
        config: { replicas?: number; deletionProtection?: string }
    ): Promise<MockIndex> {
        return this.client.request('PATCH', `/indexes/${name}`, { body: config });
    }

    async createBackup(indexName: string, backupName?: string): Promise<MockBackup> {
        return this.client.request('POST', '/backups', {
            body: { source_index: indexName, name: backupName }
        });
    }

    async listBackups(): Promise<{ backups: MockBackup[] }> {
        return this.client.request('GET', '/backups');
    }

    async deleteBackup(backupId: string): Promise<void> {
        return this.client.request('DELETE', `/backups/${backupId}`);
    }
}

/**
 * Mock DataPlaneApi for testing vector operations.
 */
class MockDataPlaneApi {
    constructor(private client: MockHttpClient) {}

    async query(
        host: string,
        params: {
            namespace?: string;
            topK: number;
            vector?: number[];
            includeValues?: boolean;
            includeMetadata?: boolean;
        }
    ): Promise<{ matches: Array<{ id: string; score: number }> }> {
        return this.client.request('POST', '/query', {
            host,
            body: params
        });
    }

    async search(
        host: string,
        params: {
            query: { inputs?: { text: string }; top_k: number };
            namespace: string;
        }
    ): Promise<{ result: { hits: Array<{ id: string; score: number }> } }> {
        const namespace = encodeURIComponent(params.namespace || '');
        return this.client.request('POST', `/records/namespaces/${namespace}/search`, {
            host,
            body: { query: params.query }
        });
    }
}

/**
 * Mock NamespaceApi for testing namespace operations.
 */
class MockNamespaceApi {
    constructor(private client: MockHttpClient) {}

    async listNamespaces(host: string): Promise<{ namespaces: MockNamespace[] }> {
        return this.client.request('GET', '/namespaces', { host });
    }

    async describeNamespace(host: string, namespace: string): Promise<MockNamespace> {
        return this.client.request('GET', `/namespaces/${namespace}`, { host });
    }

    async deleteNamespace(host: string, namespace: string): Promise<void> {
        return this.client.request('DELETE', `/namespaces/${namespace}`, { host });
    }
}

// ============================================================================
// Test Suites
// ============================================================================

suite('API Clients Unit Tests', () => {

    suite('ControlPlaneApi', () => {
        let client: MockHttpClient;
        let api: MockControlPlaneApi;

        setup(() => {
            client = new MockHttpClient();
            api = new MockControlPlaneApi(client);
        });

        suite('Index Operations', () => {

            test('listIndexes should call GET /indexes', async () => {
                client.setResponse('GET:/indexes', {
                    status: 200,
                    data: { indexes: [{ name: 'test-index', dimension: 1536 }] }
                });

                await api.listIndexes();

                assert.strictEqual(client.requests.length, 1);
                assert.strictEqual(client.requests[0].method, 'GET');
                assert.strictEqual(client.requests[0].endpoint, '/indexes');
            });

            test('createIndex should call POST /indexes with body', async () => {
                client.setResponse('POST:/indexes', {
                    status: 201,
                    data: { name: 'new-index', dimension: 768 }
                });

                await api.createIndex({
                    name: 'new-index',
                    dimension: 768,
                    metric: 'cosine'
                });

                assert.strictEqual(client.requests[0].method, 'POST');
                assert.strictEqual(client.requests[0].endpoint, '/indexes');
                const body = client.requests[0].body as Partial<MockIndex>;
                assert.strictEqual(body.name, 'new-index');
                assert.strictEqual(body.dimension, 768);
                assert.strictEqual(body.metric, 'cosine');
            });

            test('deleteIndex should call DELETE /indexes/{name}', async () => {
                client.setResponse('DELETE:/indexes/to-delete', { status: 204 });

                await api.deleteIndex('to-delete');

                assert.strictEqual(client.requests[0].method, 'DELETE');
                assert.strictEqual(client.requests[0].endpoint, '/indexes/to-delete');
            });

            test('describeIndex should call GET /indexes/{name}', async () => {
                client.setResponse('GET:/indexes/my-index', {
                    status: 200,
                    data: { name: 'my-index', dimension: 1536, host: 'host.svc.pinecone.io' }
                });

                const index = await api.describeIndex('my-index');

                assert.strictEqual(client.requests[0].method, 'GET');
                assert.strictEqual(client.requests[0].endpoint, '/indexes/my-index');
                assert.strictEqual(index.name, 'my-index');
            });

            test('configureIndex should call PATCH /indexes/{name}', async () => {
                client.setResponse('PATCH:/indexes/my-index', {
                    status: 200,
                    data: { name: 'my-index', deletionProtection: 'enabled' }
                });

                await api.configureIndex('my-index', { deletionProtection: 'enabled' });

                assert.strictEqual(client.requests[0].method, 'PATCH');
                assert.strictEqual(client.requests[0].endpoint, '/indexes/my-index');
                const body = client.requests[0].body as { deletionProtection?: string };
                assert.strictEqual(body.deletionProtection, 'enabled');
            });
        });

        suite('Backup Operations', () => {

            test('createBackup should call POST /backups', async () => {
                client.setResponse('POST:/backups', {
                    status: 202,
                    data: { backup_id: 'backup-123', source_index_name: 'my-index' }
                });

                await api.createBackup('my-index', 'my-backup');

                assert.strictEqual(client.requests[0].method, 'POST');
                assert.strictEqual(client.requests[0].endpoint, '/backups');
                const body = client.requests[0].body as { source_index: string; name?: string };
                assert.strictEqual(body.source_index, 'my-index');
                assert.strictEqual(body.name, 'my-backup');
            });

            test('listBackups should call GET /backups', async () => {
                client.setResponse('GET:/backups', {
                    status: 200,
                    data: { backups: [] }
                });

                await api.listBackups();

                assert.strictEqual(client.requests[0].method, 'GET');
                assert.strictEqual(client.requests[0].endpoint, '/backups');
            });

            test('deleteBackup should call DELETE /backups/{id}', async () => {
                client.setResponse('DELETE:/backups/backup-123', { status: 204 });

                await api.deleteBackup('backup-123');

                assert.strictEqual(client.requests[0].method, 'DELETE');
                assert.strictEqual(client.requests[0].endpoint, '/backups/backup-123');
            });
        });

        suite('Error Handling', () => {

            test('should throw on 404 error', async () => {
                client.setResponse('GET:/indexes/nonexistent', {
                    status: 404,
                    error: 'Index not found'
                });

                try {
                    await api.describeIndex('nonexistent');
                    assert.fail('Should have thrown');
                } catch (e: unknown) {
                    assert.ok(e instanceof Error);
                    assert.ok((e as Error).message.includes('404'));
                }
            });

            test('should throw on 401 error', async () => {
                client.setResponse('GET:/indexes', {
                    status: 401,
                    error: 'Unauthorized'
                });

                try {
                    await api.listIndexes();
                    assert.fail('Should have thrown');
                } catch (e: unknown) {
                    assert.ok(e instanceof Error);
                    assert.ok((e as Error).message.includes('401'));
                }
            });

            test('should throw on 500 error', async () => {
                client.setResponse('POST:/indexes', {
                    status: 500,
                    error: 'Internal server error'
                });

                try {
                    await api.createIndex({ name: 'test' });
                    assert.fail('Should have thrown');
                } catch (e: unknown) {
                    assert.ok(e instanceof Error);
                    assert.ok((e as Error).message.includes('500'));
                }
            });
        });
    });

    suite('DataPlaneApi', () => {
        let client: MockHttpClient;
        let api: MockDataPlaneApi;

        setup(() => {
            client = new MockHttpClient();
            api = new MockDataPlaneApi(client);
        });

        suite('Query Operations', () => {

            test('query should call POST /query with host', async () => {
                client.setResponse('POST:/query', {
                    status: 200,
                    data: { matches: [{ id: 'vec-1', score: 0.95 }] }
                });

                await api.query('https://my-index.svc.pinecone.io', {
                    topK: 10,
                    vector: [0.1, 0.2, 0.3],
                    includeValues: true
                });

                assert.strictEqual(client.requests[0].method, 'POST');
                assert.strictEqual(client.requests[0].endpoint, '/query');
                assert.strictEqual(client.requests[0].host, 'https://my-index.svc.pinecone.io');
            });

            test('query should include namespace in body', async () => {
                client.setResponse('POST:/query', {
                    status: 200,
                    data: { matches: [] }
                });

                await api.query('host', {
                    namespace: 'my-namespace',
                    topK: 5,
                    vector: [1, 2, 3]
                });

                const body = client.requests[0].body as { namespace?: string };
                assert.strictEqual(body.namespace, 'my-namespace');
            });
        });

        suite('Search Operations (Integrated Embeddings)', () => {

            test('search should call POST /records/namespaces/{namespace}/search', async () => {
                client.setResponse('POST:/records/namespaces/default/search', {
                    status: 200,
                    data: { result: { hits: [] } }
                });

                await api.search('host', {
                    query: { inputs: { text: 'search query' }, top_k: 10 },
                    namespace: 'default'
                });

                assert.strictEqual(client.requests[0].method, 'POST');
                assert.strictEqual(client.requests[0].endpoint, '/records/namespaces/default/search');
            });

            test('search should encode namespace in URL', async () => {
                client.setResponse('POST:/records/namespaces/my%20namespace/search', {
                    status: 200,
                    data: { result: { hits: [] } }
                });

                await api.search('host', {
                    query: { inputs: { text: 'test' }, top_k: 5 },
                    namespace: 'my namespace'
                });

                assert.ok(client.requests[0].endpoint.includes('my%20namespace'));
            });

            test('search should handle empty namespace', async () => {
                client.setResponse('POST:/records/namespaces//search', {
                    status: 200,
                    data: { result: { hits: [] } }
                });

                await api.search('host', {
                    query: { inputs: { text: 'test' }, top_k: 5 },
                    namespace: ''
                });

                assert.strictEqual(client.requests[0].endpoint, '/records/namespaces//search');
            });
        });
    });

    suite('NamespaceApi', () => {
        let client: MockHttpClient;
        let api: MockNamespaceApi;

        setup(() => {
            client = new MockHttpClient();
            api = new MockNamespaceApi(client);
        });

        test('listNamespaces should call GET /namespaces', async () => {
            client.setResponse('GET:/namespaces', {
                status: 200,
                data: { namespaces: [{ name: 'ns-1', record_count: 100 }] }
            });

            await api.listNamespaces('host');

            assert.strictEqual(client.requests[0].method, 'GET');
            assert.strictEqual(client.requests[0].endpoint, '/namespaces');
            assert.strictEqual(client.requests[0].host, 'host');
        });

        test('describeNamespace should call GET /namespaces/{namespace}', async () => {
            client.setResponse('GET:/namespaces/my-ns', {
                status: 200,
                data: { name: 'my-ns', record_count: 500 }
            });

            const ns = await api.describeNamespace('host', 'my-ns');

            assert.strictEqual(client.requests[0].endpoint, '/namespaces/my-ns');
            assert.strictEqual(ns.record_count, 500);
        });

        test('deleteNamespace should call DELETE /namespaces/{namespace}', async () => {
            client.setResponse('DELETE:/namespaces/to-delete', { status: 204 });

            await api.deleteNamespace('host', 'to-delete');

            assert.strictEqual(client.requests[0].method, 'DELETE');
            assert.strictEqual(client.requests[0].endpoint, '/namespaces/to-delete');
        });
    });

    suite('Request Parameter Validation', () => {

        test('should include all query parameters in body', async () => {
            const client = new MockHttpClient();
            const api = new MockDataPlaneApi(client);
            client.setResponse('POST:/query', { status: 200, data: { matches: [] } });

            await api.query('host', {
                namespace: 'ns',
                topK: 10,
                vector: [0.1, 0.2],
                includeValues: true,
                includeMetadata: false
            });

            const body = client.requests[0].body as Record<string, unknown>;
            assert.strictEqual(body.namespace, 'ns');
            assert.strictEqual(body.topK, 10);
            assert.deepStrictEqual(body.vector, [0.1, 0.2]);
            assert.strictEqual(body.includeValues, true);
            assert.strictEqual(body.includeMetadata, false);
        });

        test('should include search query inputs in body', async () => {
            const client = new MockHttpClient();
            const api = new MockDataPlaneApi(client);
            client.setResponse('POST:/records/namespaces/ns/search', {
                status: 200,
                data: { result: { hits: [] } }
            });

            await api.search('host', {
                query: { inputs: { text: 'search term' }, top_k: 5 },
                namespace: 'ns'
            });

            const body = client.requests[0].body as { query: { inputs: { text: string }; top_k: number } };
            assert.strictEqual(body.query.inputs.text, 'search term');
            assert.strictEqual(body.query.top_k, 5);
        });
    });

    suite('Response Parsing', () => {

        test('should parse index list response', async () => {
            const client = new MockHttpClient();
            const api = new MockControlPlaneApi(client);
            client.setResponse('GET:/indexes', {
                status: 200,
                data: {
                    indexes: [
                        { name: 'index-1', dimension: 1536, metric: 'cosine' },
                        { name: 'index-2', dimension: 768, metric: 'dotproduct' }
                    ]
                }
            });

            const result = await api.listIndexes();

            assert.strictEqual(result.indexes.length, 2);
            assert.strictEqual(result.indexes[0].name, 'index-1');
            assert.strictEqual(result.indexes[1].dimension, 768);
        });

        test('should parse query response with matches', async () => {
            const client = new MockHttpClient();
            const api = new MockDataPlaneApi(client);
            client.setResponse('POST:/query', {
                status: 200,
                data: {
                    matches: [
                        { id: 'vec-1', score: 0.95 },
                        { id: 'vec-2', score: 0.87 },
                        { id: 'vec-3', score: 0.72 }
                    ]
                }
            });

            const result = await api.query('host', { topK: 3, vector: [1, 2, 3] });

            assert.strictEqual(result.matches.length, 3);
            assert.strictEqual(result.matches[0].id, 'vec-1');
            assert.strictEqual(result.matches[0].score, 0.95);
        });

        test('should parse namespace list response', async () => {
            const client = new MockHttpClient();
            const api = new MockNamespaceApi(client);
            client.setResponse('GET:/namespaces', {
                status: 200,
                data: {
                    namespaces: [
                        { name: 'default', record_count: 1000 },
                        { name: 'custom', record_count: 500 }
                    ]
                }
            });

            const result = await api.listNamespaces('host');

            assert.strictEqual(result.namespaces.length, 2);
            assert.strictEqual(result.namespaces[0].record_count, 1000);
        });
    });
});
