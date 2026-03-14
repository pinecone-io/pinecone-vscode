import * as assert from 'assert';
import { PineconeClient, RequestOptions, ProjectContext } from '../../api/client';
import { ControlPlaneApi } from '../../api/controlPlane';
import { DataPlaneApi } from '../../api/dataPlane';
import { NamespaceApi } from '../../api/namespaceApi';
import { AssistantApi } from '../../api/assistantApi';
import { InferenceApi } from '../../api/inferenceApi';
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

        test('upsertVectors targets /vectors/upsert', async () => {
            const client = new MockRequestClient();
            client.enqueueResponse({ upsertedCount: 1 });

            const api = new DataPlaneApi(client as unknown as PineconeClient);
            await api.upsertVectors('idx.svc.us-east-1.pinecone.io', {
                vectors: [{ id: 'v1', values: [0.1, 0.2, 0.3] }]
            });

            assert.strictEqual(client.calls[0].method, 'POST');
            assert.strictEqual(client.calls[0].path, '/vectors/upsert');
            assert.strictEqual(client.calls[0].options?.host, 'https://idx.svc.us-east-1.pinecone.io');
        });

        test('upsertRecords uses namespace in path with __default__ fallback', async () => {
            const client = new MockRequestClient();
            client.enqueueResponse({ upsertedCount: 1 });

            const api = new DataPlaneApi(client as unknown as PineconeClient);
            await api.upsertRecords('idx.svc.us-east-1.pinecone.io', '', {
                records: [{ _id: 'r1', chunk_text: 'hello' }]
            });

            assert.strictEqual(client.calls[0].path, '/records/namespaces/__default__/upsert');
        });

        test('fetchVectors encodes ids in query params', async () => {
            const client = new MockRequestClient();
            client.enqueueResponse({ vectors: {} });

            const api = new DataPlaneApi(client as unknown as PineconeClient);
            await api.fetchVectors('idx.svc.us-east-1.pinecone.io', ['a', 'b'], 'docs');

            assert.strictEqual(client.calls[0].method, 'GET');
            assert.strictEqual(client.calls[0].path, '/vectors/fetch');
            assert.deepStrictEqual(client.calls[0].options?.queryParams, { ids: ['a', 'b'], namespace: 'docs' });
        });

        test('listVectorIds sends optional query params', async () => {
            const client = new MockRequestClient();
            client.enqueueResponse({ vectors: [] });

            const api = new DataPlaneApi(client as unknown as PineconeClient);
            await api.listVectorIds('idx.svc.us-east-1.pinecone.io', 'docs', 'pre', 25, 'token-1');

            assert.strictEqual(client.calls[0].path, '/vectors/list');
            assert.deepStrictEqual(client.calls[0].options?.queryParams, {
                namespace: 'docs',
                prefix: 'pre',
                limit: '25',
                pagination_token: 'token-1'
            });
        });

        test('imports endpoints map correctly', async () => {
            const client = new MockRequestClient();
            client.enqueueResponse({ id: 'imp-1' });
            client.enqueueResponse({ data: [] });
            client.enqueueResponse({ id: 'imp-1', status: 'running' });
            client.enqueueResponse({});

            const api = new DataPlaneApi(client as unknown as PineconeClient);
            await api.startImport('idx.svc.us-east-1.pinecone.io', { uri: 's3://bucket/path' });
            await api.listImports('idx.svc.us-east-1.pinecone.io', 10, 'next-1');
            await api.describeImport('idx.svc.us-east-1.pinecone.io', 'imp-1');
            await api.cancelImport('idx.svc.us-east-1.pinecone.io', 'imp-1');

            assert.strictEqual(client.calls[0].path, '/imports');
            assert.strictEqual(client.calls[1].path, '/imports');
            assert.deepStrictEqual(client.calls[1].options?.queryParams, { limit: '10', pagination_token: 'next-1' });
            assert.strictEqual(client.calls[2].path, '/imports/imp-1');
            assert.strictEqual(client.calls[3].path, '/imports/imp-1/cancel');
        });
    });

    suite('AssistantApi', () => {
        test('updateAssistant uses PATCH assistant control plane path', async () => {
            const client = new MockRequestClient();
            client.enqueueResponse(sampleIndex('dummy'));
            const api = new AssistantApi(client as unknown as PineconeClient);
            await api.updateAssistant('my-assistant', { instructions: 'new instructions' });
            assert.strictEqual(client.calls[0].method, 'PATCH');
            assert.strictEqual(client.calls[0].path, '/assistant/assistants/my-assistant');
        });

        test('listFiles supports metadata filter query param', async () => {
            const client = new MockRequestClient();
            client.enqueueResponse({ files: [] });
            const api = new AssistantApi(client as unknown as PineconeClient);

            await api.listFiles('asst.svc.us-east-1.pinecone.io', 'my-assistant', undefined, { category: 'docs' });

            assert.strictEqual(client.calls[0].path, '/assistant/files/my-assistant');
            assert.deepStrictEqual(client.calls[0].options?.queryParams, {
                metadata: JSON.stringify({ category: 'docs' })
            });
        });

        test('assistant context/evaluate and describeFile paths', async () => {
            const client = new MockRequestClient();
            client.enqueueResponse({});
            client.enqueueResponse({});
            client.enqueueResponse({});
            const api = new AssistantApi(client as unknown as PineconeClient);

            await api.describeFile('asst.svc.us-east-1.pinecone.io', 'my-assistant', 'file-1', undefined, true);
            await api.retrieveContext('asst.svc.us-east-1.pinecone.io', 'my-assistant', { query: 'hello' });
            await api.evaluateAnswer(
                'asst.svc.us-east-1.pinecone.io',
                'my-assistant',
                { question: 'q', answer: 'a', ground_truth_answer: 'gt' }
            );

            assert.strictEqual(client.calls[0].path, '/assistant/files/my-assistant/file-1');
            assert.deepStrictEqual(client.calls[0].options?.queryParams, { include_url: 'true' });
            assert.strictEqual(client.calls[1].path, '/assistant/chat/my-assistant/context');
            assert.strictEqual(client.calls[2].path, '/assistant/evaluation/metrics/alignment');
            assert.deepStrictEqual(client.calls[2].options?.body, {
                question: 'q',
                answer: 'a',
                ground_truth_answer: 'gt'
            });
        });
    });

    suite('InferenceApi', () => {
        test('embed/rerank/model endpoints map correctly', async () => {
            const client = new MockRequestClient();
            client.enqueueResponse({ data: [] });
            client.enqueueResponse({ data: [] });
            client.enqueueResponse({ data: [{ name: 'm1' }] });
            client.enqueueResponse({ name: 'm1' });
            const api = new InferenceApi(client as unknown as PineconeClient);
            const projectContext = { id: 'proj-1', name: 'Project 1', organizationId: 'org-1' };

            await api.embed({ model: 'm1', inputs: [{ text: 'a' }] }, projectContext);
            await api.rerank({ model: 'm2', query: 'q', documents: [{ text: 'd1' }] }, projectContext);
            await api.listModels('embed', projectContext);
            await api.describeModel('m1', projectContext);

            assert.strictEqual(client.calls[0].path, '/embed');
            assert.strictEqual(client.calls[1].path, '/rerank');
            assert.strictEqual(client.calls[2].path, '/models');
            assert.deepStrictEqual(client.calls[2].options?.queryParams, { type: 'embed' });
            assert.strictEqual(client.calls[3].path, '/models/m1');
            assert.deepStrictEqual(client.calls[0].options?.projectContext, projectContext);
            assert.deepStrictEqual(client.calls[1].options?.projectContext, projectContext);
            assert.deepStrictEqual(client.calls[2].options?.projectContext, projectContext);
            assert.deepStrictEqual(client.calls[3].options?.projectContext, projectContext);
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
