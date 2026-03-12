import * as assert from 'assert';
import { PineconeClient, RequestOptions, ProjectContext } from '../../api/client';
import { ControlPlaneApi } from '../../api/controlPlane';
import { DataPlaneApi } from '../../api/dataPlane';
import { NamespaceApi } from '../../api/namespaceApi';
import { IndexModel, NamespaceDescription } from '../../api/types';

interface CapturedRequest {
    method: string;
    path: string;
    options?: RequestOptions;
}

class MockRequestClient {
    public calls: CapturedRequest[] = [];
    private responses: unknown[] = [];

    enqueueResponse(response: unknown): void {
        this.responses.push(response);
    }

    async request<T>(method: string, path: string, options?: RequestOptions): Promise<T> {
        this.calls.push({ method, path, options });
        const response = this.responses.length > 0 ? this.responses.shift() : {};
        return response as T;
    }
}

function sampleIndex(name: string): IndexModel {
    return {
        name,
        metric: 'cosine',
        dimension: 1536,
        host: `${name}.svc.us-east-1.pinecone.io`,
        status: { ready: true, state: 'Ready' },
        spec: { serverless: { cloud: 'aws', region: 'us-east-1' } },
        deletion_protection: 'disabled'
    };
}

suite('API Clients (Production Classes)', () => {
    suite('ControlPlaneApi', () => {
        test('listIndexes delegates to GET /indexes and unwraps indexes array', async () => {
            const client = new MockRequestClient();
            client.enqueueResponse({ indexes: [sampleIndex('one'), sampleIndex('two')] });

            const api = new ControlPlaneApi(client as unknown as PineconeClient);
            const indexes = await api.listIndexes();

            assert.strictEqual(client.calls.length, 1);
            assert.strictEqual(client.calls[0].method, 'GET');
            assert.strictEqual(client.calls[0].path, '/indexes');
            assert.strictEqual(indexes.length, 2);
            assert.strictEqual(indexes[0].name, 'one');
        });

        test('describeIndexStats normalizes bare host to https', async () => {
            const client = new MockRequestClient();
            client.enqueueResponse({
                namespaces: {},
                dimension: 1536,
                indexFullness: 0,
                totalVectorCount: 0
            });

            const api = new ControlPlaneApi(client as unknown as PineconeClient);
            await api.describeIndexStats('idx.svc.us-east-1.pinecone.io');

            assert.strictEqual(client.calls.length, 1);
            assert.strictEqual(client.calls[0].method, 'POST');
            assert.strictEqual(client.calls[0].path, '/describe_index_stats');
            assert.strictEqual(client.calls[0].options?.host, 'https://idx.svc.us-east-1.pinecone.io');
        });

        test('describeIndexStats preserves existing protocol', async () => {
            const client = new MockRequestClient();
            client.enqueueResponse({
                namespaces: {},
                dimension: 1536,
                indexFullness: 0,
                totalVectorCount: 0
            });

            const api = new ControlPlaneApi(client as unknown as PineconeClient);
            await api.describeIndexStats('https://idx.svc.us-east-1.pinecone.io');

            assert.strictEqual(client.calls[0].options?.host, 'https://idx.svc.us-east-1.pinecone.io');
        });
    });

    suite('DataPlaneApi', () => {
        test('query normalizes bare host and forwards project context', async () => {
            const client = new MockRequestClient();
            client.enqueueResponse({ matches: [], namespace: '' });

            const api = new DataPlaneApi(client as unknown as PineconeClient);
            const projectContext: ProjectContext = {
                id: 'proj-1',
                name: 'Project One',
                organizationId: 'org-1'
            };

            await api.query(
                'idx.svc.us-east-1.pinecone.io',
                { top_k: 3, vector: [0.1, 0.2, 0.3] },
                projectContext
            );

            assert.strictEqual(client.calls.length, 1);
            assert.strictEqual(client.calls[0].method, 'POST');
            assert.strictEqual(client.calls[0].path, '/query');
            assert.strictEqual(client.calls[0].options?.host, 'https://idx.svc.us-east-1.pinecone.io');
            assert.deepStrictEqual(client.calls[0].options?.projectContext, projectContext);
        });

        test('search uses __default__ namespace when namespace is empty', async () => {
            const client = new MockRequestClient();
            client.enqueueResponse({ result: { hits: [] } });

            const api = new DataPlaneApi(client as unknown as PineconeClient);
            await api.search('https://idx.svc.us-east-1.pinecone.io', {
                namespace: '',
                query: {
                    inputs: { text: 'hello' },
                    top_k: 5
                }
            });

            assert.strictEqual(client.calls.length, 1);
            assert.strictEqual(client.calls[0].method, 'POST');
            assert.strictEqual(client.calls[0].path, '/records/namespaces/__default__/search');
            assert.strictEqual(client.calls[0].options?.host, 'https://idx.svc.us-east-1.pinecone.io');
        });

        test('search URL-encodes namespace names', async () => {
            const client = new MockRequestClient();
            client.enqueueResponse({ result: { hits: [] } });

            const api = new DataPlaneApi(client as unknown as PineconeClient);
            await api.search('idx.svc.us-east-1.pinecone.io', {
                namespace: 'ns/alpha',
                query: {
                    inputs: { text: 'hello' },
                    top_k: 5
                }
            });

            assert.strictEqual(client.calls[0].path, '/records/namespaces/ns%2Falpha/search');
            assert.strictEqual(client.calls[0].options?.host, 'https://idx.svc.us-east-1.pinecone.io');
        });
    });

    suite('NamespaceApi', () => {
        test('listNamespaces normalizes host and applies query params', async () => {
            const client = new MockRequestClient();
            client.enqueueResponse({ namespaces: [], pagination: {} });

            const api = new NamespaceApi(client as unknown as PineconeClient);
            await api.listNamespaces('idx.svc.us-east-1.pinecone.io', {
                limit: 25,
                prefix: 'docs',
                pagination_token: 'next-token'
            });

            assert.strictEqual(client.calls.length, 1);
            assert.strictEqual(client.calls[0].method, 'GET');
            assert.strictEqual(client.calls[0].path, '/namespaces');
            assert.strictEqual(client.calls[0].options?.host, 'https://idx.svc.us-east-1.pinecone.io');
            assert.deepStrictEqual(client.calls[0].options?.queryParams, {
                limit: '25',
                prefix: 'docs',
                pagination_token: 'next-token'
            });
        });

        test('describeNamespace URL-encodes namespace path segment', async () => {
            const client = new MockRequestClient();
            const namespace: NamespaceDescription = {
                name: 'ns/alpha',
                record_count: 10
            };
            client.enqueueResponse(namespace);

            const api = new NamespaceApi(client as unknown as PineconeClient);
            const response = await api.describeNamespace('https://idx.svc.us-east-1.pinecone.io', 'ns/alpha');

            assert.strictEqual(client.calls[0].path, '/namespaces/ns%2Falpha');
            assert.strictEqual(client.calls[0].options?.host, 'https://idx.svc.us-east-1.pinecone.io');
            assert.strictEqual(response.name, 'ns/alpha');
        });

        test('deleteNamespace URL-encodes namespace path segment', async () => {
            const client = new MockRequestClient();
            client.enqueueResponse({});

            const api = new NamespaceApi(client as unknown as PineconeClient);
            await api.deleteNamespace('idx.svc.us-east-1.pinecone.io', 'ns with spaces');

            assert.strictEqual(client.calls[0].method, 'DELETE');
            assert.strictEqual(client.calls[0].path, '/namespaces/ns%20with%20spaces');
            assert.strictEqual(client.calls[0].options?.host, 'https://idx.svc.us-east-1.pinecone.io');
        });
    });
});
