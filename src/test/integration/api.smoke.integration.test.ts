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
    this.timeout(120000);

    const apiKey = process.env.PINECONE_API_KEY;

    if (!apiKey || process.env.PINECONE_INTEGRATION_TESTS !== 'true') {
        test('skips when integration credentials are not enabled', function () {
            this.skip();
        });
        return;
    }

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
