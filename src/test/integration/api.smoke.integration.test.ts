import * as assert from 'assert';
import { PineconeClient } from '../../api/client';
import { ControlPlaneApi } from '../../api/controlPlane';
import { AssistantApi } from '../../api/assistantApi';
import { AuthService } from '../../services/authService';
import { AUTH_CONTEXTS } from '../../utils/constants';

class IntegrationAuthService {
    constructor(private readonly apiKey: string) {}

    getAuthContext(): string {
        return AUTH_CONTEXTS.API_KEY;
    }

    async getAccessToken(): Promise<string> {
        return this.apiKey;
    }
}

suite('Integration Smoke Tests', function () {
    this.timeout(300000);

    const apiKey = process.env.PINECONE_API_KEY;
    const runId = Date.now().toString(36);
    const tempAssistantName = `vscode-it-assistant-${runId}`;
    const tempIndexName = `vscode-it-index-${runId}`.slice(0, 45);
    let tempIndexHost: string | undefined;

    if (!apiKey || process.env.PINECONE_INTEGRATION_TESTS !== 'true') {
        test('skips when integration credentials are not enabled', function () {
            this.skip();
        });
        return;
    }

    test('assistant lifecycle: create and delete succeeds', async () => {
        const auth = new IntegrationAuthService(apiKey);
        const client = new PineconeClient(auth as unknown as AuthService);
        const assistantApi = new AssistantApi(client);

        try {
            const created = await assistantApi.createAssistant(
                tempAssistantName,
                'us',
                'Integration test assistant. Safe to delete.'
            );
            assert.strictEqual(created.name, tempAssistantName);
        } finally {
            try {
                await assistantApi.deleteAssistant(tempAssistantName);
            } catch {
                // Best-effort cleanup for integration resources.
            }
        }
    });

    test('index lifecycle: create, wait ready, describe stats, and delete succeeds', async () => {
        const auth = new IntegrationAuthService(apiKey);
        const client = new PineconeClient(auth as unknown as AuthService);
        const controlPlane = new ControlPlaneApi(client);

        try {
            await controlPlane.createIndex({
                name: tempIndexName,
                dimension: 8,
                metric: 'cosine',
                spec: {
                    serverless: {
                        cloud: 'aws',
                        region: 'us-east-1'
                    }
                },
                deletion_protection: 'disabled'
            });

            const deadline = Date.now() + 180000;
            while (Date.now() < deadline) {
                const index = await controlPlane.describeIndex(tempIndexName);
                if (index.status?.ready && index.host) {
                    tempIndexHost = index.host;
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 3000));
            }

            assert.ok(tempIndexHost, 'Timed out waiting for test index host readiness');
            const stats = await controlPlane.describeIndexStats(tempIndexHost!);
            assert.strictEqual(typeof stats.totalVectorCount, 'number');
        } finally {
            try {
                await controlPlane.deleteIndex(tempIndexName);
            } catch {
                // Best-effort cleanup for integration resources.
            }
        }
    });

    test('control plane smoke: list indexes succeeds', async () => {
        const auth = new IntegrationAuthService(apiKey);
        const client = new PineconeClient(auth as unknown as AuthService);
        const controlPlane = new ControlPlaneApi(client);

        const indexes = await controlPlane.listIndexes();
        assert.ok(Array.isArray(indexes));
    });

    test('assistant smoke: list assistants succeeds', async () => {
        const auth = new IntegrationAuthService(apiKey);
        const client = new PineconeClient(auth as unknown as AuthService);
        const assistantApi = new AssistantApi(client);

        const assistants = await assistantApi.listAssistants();
        assert.ok(Array.isArray(assistants));
    });

    test('data-plane smoke: describe_index_stats succeeds for at least one hosted index', async function () {
        const auth = new IntegrationAuthService(apiKey);
        const client = new PineconeClient(auth as unknown as AuthService);
        const controlPlane = new ControlPlaneApi(client);

        if (tempIndexHost) {
            const stats = await controlPlane.describeIndexStats(tempIndexHost);
            assert.strictEqual(typeof stats.totalVectorCount, 'number');
            return;
        }

        const indexes = await controlPlane.listIndexes();
        const hostedIndex = indexes.find((index) => !!index.host);
        if (!hostedIndex) {
            this.skip();
            return;
        }

        const stats = await controlPlane.describeIndexStats(hostedIndex.host);
        assert.strictEqual(typeof stats.totalVectorCount, 'number');
    });
});
