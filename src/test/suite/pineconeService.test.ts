/**
 * PineconeService Unit Tests
 * 
 * Tests for the high-level PineconeService that coordinates all API operations.
 * Uses mocked dependencies to test in isolation (CLI/SDK pattern).
 * 
 * Tests cover:
 * - Project context management
 * - OperationResult pattern for error handling
 * - Index operations delegation
 * - Assistant operations delegation
 * - Organization/Project listing with auth context awareness
 */

import * as assert from 'assert';
import { AUTH_CONTEXTS } from '../../utils/constants';

// ============================================================================
// Mock Types (simplified for testing)
// ============================================================================

interface MockIndex {
    name: string;
    dimension: number;
    metric: string;
    status: { ready: boolean; state: string };
}

interface MockAssistant {
    name: string;
    status: string;
    host: string;
}

interface MockOrganization {
    id: string;
    name: string;
}

interface MockProject {
    id: string;
    name: string;
}

interface OperationResult<T> {
    success: boolean;
    data?: T;
    error?: string;
}

// ============================================================================
// Mock API Clients
// ============================================================================

/**
 * Mock ControlPlaneApi that tracks method calls.
 */
class MockControlPlane {
    public calls: Array<{ method: string; args: unknown[] }> = [];
    public indexes: MockIndex[] = [];
    public shouldThrow: Error | null = null;

    async listIndexes(): Promise<MockIndex[]> {
        this.calls.push({ method: 'listIndexes', args: [] });
        if (this.shouldThrow) { throw this.shouldThrow; }
        return this.indexes;
    }

    async createIndex(config: Partial<MockIndex>): Promise<MockIndex> {
        this.calls.push({ method: 'createIndex', args: [config] });
        if (this.shouldThrow) { throw this.shouldThrow; }
        const index: MockIndex = {
            name: config.name || 'test-index',
            dimension: config.dimension || 1536,
            metric: config.metric || 'cosine',
            status: { ready: true, state: 'Ready' }
        };
        this.indexes.push(index);
        return index;
    }

    async deleteIndex(name: string): Promise<void> {
        this.calls.push({ method: 'deleteIndex', args: [name] });
        if (this.shouldThrow) { throw this.shouldThrow; }
        this.indexes = this.indexes.filter(i => i.name !== name);
    }

    async describeIndex(name: string): Promise<MockIndex> {
        this.calls.push({ method: 'describeIndex', args: [name] });
        if (this.shouldThrow) { throw this.shouldThrow; }
        const index = this.indexes.find(i => i.name === name);
        if (!index) { throw new Error(`Index ${name} not found`); }
        return index;
    }
}

/**
 * Mock AssistantApi that tracks method calls.
 */
class MockAssistantApi {
    public calls: Array<{ method: string; args: unknown[] }> = [];
    public assistants: MockAssistant[] = [];
    public shouldThrow: Error | null = null;

    async listAssistants(): Promise<MockAssistant[]> {
        this.calls.push({ method: 'listAssistants', args: [] });
        if (this.shouldThrow) { throw this.shouldThrow; }
        return this.assistants;
    }

    async createAssistant(
        name: string,
        region?: string,
        instructions?: string
    ): Promise<MockAssistant> {
        this.calls.push({ method: 'createAssistant', args: [name, region, instructions] });
        if (this.shouldThrow) { throw this.shouldThrow; }
        const assistant: MockAssistant = {
            name,
            status: 'Ready',
            host: `https://${name}.svc.pinecone.io`
        };
        this.assistants.push(assistant);
        return assistant;
    }

    async deleteAssistant(name: string): Promise<void> {
        this.calls.push({ method: 'deleteAssistant', args: [name] });
        if (this.shouldThrow) { throw this.shouldThrow; }
        this.assistants = this.assistants.filter(a => a.name !== name);
    }
}

/**
 * Mock AdminApi that tracks method calls.
 */
class MockAdminApi {
    public calls: Array<{ method: string; args: unknown[] }> = [];
    public organizations: MockOrganization[] = [];
    public projects: MockProject[] = [];
    public shouldThrow: Error | null = null;

    async listOrganizations(_token: string): Promise<MockOrganization[]> {
        this.calls.push({ method: 'listOrganizations', args: [_token] });
        if (this.shouldThrow) { throw this.shouldThrow; }
        return this.organizations;
    }

    async listProjects(_token: string, orgId?: string): Promise<MockProject[]> {
        this.calls.push({ method: 'listProjects', args: [_token, orgId] });
        if (this.shouldThrow) { throw this.shouldThrow; }
        return this.projects;
    }
}

/**
 * Mock AuthService for testing auth context handling.
 */
class MockAuthService {
    public authContext: string = AUTH_CONTEXTS.USER_TOKEN;
    public accessToken: string = 'mock-jwt-token';
    public shouldThrow: Error | null = null;

    getAuthContext(): string {
        return this.authContext;
    }

    async getAccessToken(): Promise<string> {
        if (this.shouldThrow) { throw this.shouldThrow; }
        return this.accessToken;
    }
}

/**
 * Mock ConfigService for testing state persistence.
 */
class MockConfigService {
    private targetOrg: { id: string; name: string } | undefined;
    private targetProject: { id: string; name: string } | undefined;

    getTargetOrganization() { return this.targetOrg; }
    setTargetOrganization(org: { id: string; name: string } | undefined) { 
        this.targetOrg = org;
        if (!org) { this.targetProject = undefined; }
    }
    getTargetProject() { return this.targetProject; }
    setTargetProject(project: { id: string; name: string } | undefined) { 
        this.targetProject = project; 
    }
    clearTargetContext() {
        this.targetOrg = undefined;
        this.targetProject = undefined;
    }
}

/**
 * Mock PineconeClient for testing project ID management.
 */
class MockPineconeClient {
    public projectId: string | undefined;

    setProjectId(id: string | undefined) { this.projectId = id; }
    getProjectId() { return this.projectId; }
}

/**
 * Simulated PineconeService for testing.
 * Uses mock dependencies to test service logic in isolation.
 */
class TestPineconeService {
    public controlPlane = new MockControlPlane();
    public assistantApi = new MockAssistantApi();
    public adminApi = new MockAdminApi();
    public configService = new MockConfigService();
    public client = new MockPineconeClient();

    constructor(public authService: MockAuthService) {}

    // Project context management
    setProjectId(projectId: string | undefined): void {
        this.client.setProjectId(projectId);
    }
    getProjectId(): string | undefined {
        return this.client.getProjectId();
    }

    // Index operations
    async listIndexes() { return this.controlPlane.listIndexes(); }
    async createIndex(config: Partial<MockIndex>) { return this.controlPlane.createIndex(config); }
    async deleteIndex(name: string) { return this.controlPlane.deleteIndex(name); }
    async describeIndex(name: string) { return this.controlPlane.describeIndex(name); }

    // Assistant operations
    async listAssistants() { return this.assistantApi.listAssistants(); }
    async createAssistant(name: string, region?: string, instructions?: string) {
        return this.assistantApi.createAssistant(name, region, instructions);
    }
    async deleteAssistant(name: string) { return this.assistantApi.deleteAssistant(name); }

    // Organization/Project operations with OperationResult
    async listOrganizations(): Promise<OperationResult<MockOrganization[]>> {
        const authContext = this.authService.getAuthContext();
        if (authContext === AUTH_CONTEXTS.API_KEY) {
            return { success: true, data: [] };
        }
        try {
            const token = await this.authService.getAccessToken();
            const organizations = await this.adminApi.listOrganizations(token);
            return { success: true, data: organizations };
        } catch (e: unknown) {
            return { 
                success: false, 
                error: e instanceof Error ? e.message : String(e),
                data: []
            };
        }
    }

    async listProjects(organizationId?: string): Promise<OperationResult<MockProject[]>> {
        const authContext = this.authService.getAuthContext();
        if (authContext === AUTH_CONTEXTS.API_KEY) {
            return { success: true, data: [] };
        }
        try {
            const token = await this.authService.getAccessToken();
            const projects = await this.adminApi.listProjects(token, organizationId);
            return { success: true, data: projects };
        } catch (e: unknown) {
            return { 
                success: false, 
                error: e instanceof Error ? e.message : String(e),
                data: []
            };
        }
    }

    // State persistence
    getTargetOrganization() { return this.configService.getTargetOrganization(); }
    setTargetOrganization(org: { id: string; name: string } | undefined) {
        this.configService.setTargetOrganization(org);
        if (!org) { this.client.setProjectId(undefined); }
    }
    getTargetProject() { return this.configService.getTargetProject(); }
    setTargetProject(project: { id: string; name: string } | undefined) {
        this.configService.setTargetProject(project);
        this.client.setProjectId(project?.id);
    }
    clearTargetContext() {
        this.configService.clearTargetContext();
        this.client.setProjectId(undefined);
    }
}

// ============================================================================
// Test Suites
// ============================================================================

suite('PineconeService Unit Tests', () => {

    suite('Project Context Management', () => {

        test('should set and get project ID', () => {
            const authService = new MockAuthService();
            const service = new TestPineconeService(authService);

            service.setProjectId('proj-123');
            assert.strictEqual(service.getProjectId(), 'proj-123');
        });

        test('should clear project ID when set to undefined', () => {
            const authService = new MockAuthService();
            const service = new TestPineconeService(authService);

            service.setProjectId('proj-123');
            service.setProjectId(undefined);
            assert.strictEqual(service.getProjectId(), undefined);
        });

        test('should sync project ID with client on setTargetProject', () => {
            const authService = new MockAuthService();
            const service = new TestPineconeService(authService);

            service.setTargetProject({ id: 'proj-456', name: 'My Project' });
            assert.strictEqual(service.getProjectId(), 'proj-456');
        });

        test('should clear project ID when clearing target context', () => {
            const authService = new MockAuthService();
            const service = new TestPineconeService(authService);

            service.setTargetProject({ id: 'proj-789', name: 'Project' });
            service.clearTargetContext();
            assert.strictEqual(service.getProjectId(), undefined);
        });
    });

    suite('OperationResult Pattern', () => {

        test('should return success result with data', async () => {
            const authService = new MockAuthService();
            const service = new TestPineconeService(authService);
            service.adminApi.organizations = [
                { id: 'org-1', name: 'Org 1' },
                { id: 'org-2', name: 'Org 2' }
            ];

            const result = await service.listOrganizations();

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.data?.length, 2);
            assert.strictEqual(result.error, undefined);
        });

        test('should return error result on failure', async () => {
            const authService = new MockAuthService();
            const service = new TestPineconeService(authService);
            service.adminApi.shouldThrow = new Error('API connection failed');

            const result = await service.listOrganizations();

            assert.strictEqual(result.success, false);
            assert.ok(result.error?.includes('API connection failed'));
            assert.deepStrictEqual(result.data, []);
        });

        test('should return empty array for API key auth (expected behavior)', async () => {
            const authService = new MockAuthService();
            authService.authContext = AUTH_CONTEXTS.API_KEY;
            const service = new TestPineconeService(authService);

            const result = await service.listOrganizations();

            assert.strictEqual(result.success, true);
            assert.deepStrictEqual(result.data, []);
        });

        test('should return projects for JWT auth', async () => {
            const authService = new MockAuthService();
            authService.authContext = AUTH_CONTEXTS.USER_TOKEN;
            const service = new TestPineconeService(authService);
            service.adminApi.projects = [
                { id: 'proj-1', name: 'Project 1' },
                { id: 'proj-2', name: 'Project 2' }
            ];

            const result = await service.listProjects('org-1');

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.data?.length, 2);
        });
    });

    suite('Index Operations', () => {

        test('should delegate listIndexes to ControlPlane', async () => {
            const authService = new MockAuthService();
            const service = new TestPineconeService(authService);
            service.controlPlane.indexes = [
                { name: 'idx-1', dimension: 1536, metric: 'cosine', status: { ready: true, state: 'Ready' } }
            ];

            const indexes = await service.listIndexes();

            assert.strictEqual(indexes.length, 1);
            assert.strictEqual(indexes[0].name, 'idx-1');
            assert.strictEqual(service.controlPlane.calls.length, 1);
            assert.strictEqual(service.controlPlane.calls[0].method, 'listIndexes');
        });

        test('should delegate createIndex to ControlPlane', async () => {
            const authService = new MockAuthService();
            const service = new TestPineconeService(authService);

            const index = await service.createIndex({
                name: 'new-index',
                dimension: 768,
                metric: 'dotproduct'
            });

            assert.strictEqual(index.name, 'new-index');
            assert.strictEqual(index.dimension, 768);
            assert.strictEqual(service.controlPlane.calls[0].method, 'createIndex');
        });

        test('should delegate deleteIndex to ControlPlane', async () => {
            const authService = new MockAuthService();
            const service = new TestPineconeService(authService);
            service.controlPlane.indexes = [
                { name: 'to-delete', dimension: 1536, metric: 'cosine', status: { ready: true, state: 'Ready' } }
            ];

            await service.deleteIndex('to-delete');

            assert.strictEqual(service.controlPlane.indexes.length, 0);
            assert.strictEqual(service.controlPlane.calls[0].method, 'deleteIndex');
        });

        test('should propagate errors from ControlPlane', async () => {
            const authService = new MockAuthService();
            const service = new TestPineconeService(authService);
            service.controlPlane.shouldThrow = new Error('Index limit exceeded');

            try {
                await service.createIndex({ name: 'test' });
                assert.fail('Should have thrown');
            } catch (e: unknown) {
                assert.ok(e instanceof Error);
                assert.ok((e as Error).message.includes('Index limit exceeded'));
            }
        });
    });

    suite('Assistant Operations', () => {

        test('should delegate listAssistants to AssistantApi', async () => {
            const authService = new MockAuthService();
            const service = new TestPineconeService(authService);
            service.assistantApi.assistants = [
                { name: 'assistant-1', status: 'Ready', host: 'https://assistant-1.svc.pinecone.io' }
            ];

            const assistants = await service.listAssistants();

            assert.strictEqual(assistants.length, 1);
            assert.strictEqual(assistants[0].name, 'assistant-1');
        });

        test('should delegate createAssistant with all parameters', async () => {
            const authService = new MockAuthService();
            const service = new TestPineconeService(authService);

            const assistant = await service.createAssistant(
                'my-assistant',
                'us',
                'You are a helpful assistant.'
            );

            assert.strictEqual(assistant.name, 'my-assistant');
            assert.strictEqual(service.assistantApi.calls[0].method, 'createAssistant');
            const args = service.assistantApi.calls[0].args;
            assert.strictEqual(args[0], 'my-assistant');
            assert.strictEqual(args[1], 'us');
            assert.strictEqual(args[2], 'You are a helpful assistant.');
        });

        test('should delegate deleteAssistant to AssistantApi', async () => {
            const authService = new MockAuthService();
            const service = new TestPineconeService(authService);
            service.assistantApi.assistants = [
                { name: 'to-delete', status: 'Ready', host: 'https://to-delete.svc.pinecone.io' }
            ];

            await service.deleteAssistant('to-delete');

            assert.strictEqual(service.assistantApi.assistants.length, 0);
        });
    });

    suite('State Persistence', () => {

        test('should persist target organization', () => {
            const authService = new MockAuthService();
            const service = new TestPineconeService(authService);

            service.setTargetOrganization({ id: 'org-1', name: 'Organization 1' });
            const org = service.getTargetOrganization();

            assert.strictEqual(org?.id, 'org-1');
            assert.strictEqual(org?.name, 'Organization 1');
        });

        test('should persist target project', () => {
            const authService = new MockAuthService();
            const service = new TestPineconeService(authService);

            service.setTargetProject({ id: 'proj-1', name: 'Project 1' });
            const proj = service.getTargetProject();

            assert.strictEqual(proj?.id, 'proj-1');
            assert.strictEqual(proj?.name, 'Project 1');
        });

        test('should clear project when organization changes', () => {
            const authService = new MockAuthService();
            const service = new TestPineconeService(authService);

            service.setTargetOrganization({ id: 'org-1', name: 'Org 1' });
            service.setTargetProject({ id: 'proj-1', name: 'Project 1' });
            service.setTargetOrganization(undefined);

            assert.strictEqual(service.getTargetOrganization(), undefined);
            assert.strictEqual(service.getTargetProject(), undefined);
        });

        test('should clear all context on clearTargetContext', () => {
            const authService = new MockAuthService();
            const service = new TestPineconeService(authService);

            service.setTargetOrganization({ id: 'org-1', name: 'Org 1' });
            service.setTargetProject({ id: 'proj-1', name: 'Project 1' });
            service.clearTargetContext();

            assert.strictEqual(service.getTargetOrganization(), undefined);
            assert.strictEqual(service.getTargetProject(), undefined);
            assert.strictEqual(service.getProjectId(), undefined);
        });
    });

    suite('Auth Context Awareness', () => {

        test('should use JWT token for OAuth auth', async () => {
            const authService = new MockAuthService();
            authService.authContext = AUTH_CONTEXTS.USER_TOKEN;
            authService.accessToken = 'jwt-token-123';
            const service = new TestPineconeService(authService);

            await service.listOrganizations();

            assert.strictEqual(service.adminApi.calls[0].args[0], 'jwt-token-123');
        });

        test('should use JWT token for service account auth', async () => {
            const authService = new MockAuthService();
            authService.authContext = AUTH_CONTEXTS.SERVICE_ACCOUNT;
            authService.accessToken = 'sa-jwt-token';
            const service = new TestPineconeService(authService);

            await service.listProjects('org-1');

            assert.strictEqual(service.adminApi.calls[0].args[0], 'sa-jwt-token');
        });

        test('should skip API call for API key auth', async () => {
            const authService = new MockAuthService();
            authService.authContext = AUTH_CONTEXTS.API_KEY;
            const service = new TestPineconeService(authService);

            const result = await service.listProjects();

            assert.strictEqual(result.success, true);
            assert.strictEqual(service.adminApi.calls.length, 0); // No API call made
        });
    });

    suite('Error Handling', () => {

        test('should handle auth token errors gracefully', async () => {
            const authService = new MockAuthService();
            authService.shouldThrow = new Error('Token refresh failed');
            const service = new TestPineconeService(authService);

            const result = await service.listOrganizations();

            assert.strictEqual(result.success, false);
            assert.ok(result.error?.includes('Token refresh failed'));
        });

        test('should handle network errors gracefully', async () => {
            const authService = new MockAuthService();
            const service = new TestPineconeService(authService);
            service.adminApi.shouldThrow = new Error('Network request failed');

            const result = await service.listProjects();

            assert.strictEqual(result.success, false);
            assert.ok(result.error?.includes('Network request failed'));
        });

        test('should propagate errors for non-OperationResult methods', async () => {
            const authService = new MockAuthService();
            const service = new TestPineconeService(authService);
            service.controlPlane.shouldThrow = new Error('Quota exceeded');

            try {
                await service.listIndexes();
                assert.fail('Should have thrown');
            } catch (e: unknown) {
                assert.ok(e instanceof Error);
                assert.ok((e as Error).message.includes('Quota exceeded'));
            }
        });
    });
});
