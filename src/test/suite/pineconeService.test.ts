import * as assert from 'assert';
import { PineconeService } from '../../services/pineconeService';
import { AuthService } from '../../services/authService';
import { AUTH_CONTEXTS } from '../../utils/constants';
import { IndexModel, AssistantModel, Organization, Project } from '../../api/types';
import { ProjectContext } from '../../api/client';

class MockAuthService {
    public authContext: string = AUTH_CONTEXTS.USER_TOKEN;
    public accessToken: string = 'mock-jwt-token';

    getAuthContext(): string {
        return this.authContext;
    }

    async getAccessToken(): Promise<string> {
        return this.accessToken;
    }
}

function createIndex(name: string): IndexModel {
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

function createAssistant(name: string): AssistantModel {
    return {
        name,
        status: 'Ready',
        host: `${name}.assistant.pinecone.io`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
}

suite('PineconeService (Production Class)', () => {
    test('setProjectId/getProjectId delegate to the underlying client', () => {
        const auth = new MockAuthService();
        const service = new PineconeService(auth as unknown as AuthService);

        const clientStub = {
            projectId: undefined as string | undefined,
            projectContext: undefined as ProjectContext | undefined,
            setProjectId(projectId: string | undefined): void {
                this.projectId = projectId;
                if (!projectId) {
                    this.projectContext = undefined;
                }
            },
            getProjectId(): string | undefined {
                return this.projectId;
            },
            setProjectContext(context: ProjectContext | undefined): void {
                this.projectContext = context;
                this.projectId = context?.id;
            }
        };

        (service as unknown as { client: typeof clientStub }).client = clientStub;

        service.setProjectId('proj-123');
        assert.strictEqual(service.getProjectId(), 'proj-123');

        service.setProjectId(undefined);
        assert.strictEqual(service.getProjectId(), undefined);
    });

    test('setFullProjectContext updates managed project context and project id', () => {
        const auth = new MockAuthService();
        const service = new PineconeService(auth as unknown as AuthService);

        const clientStub = {
            projectId: undefined as string | undefined,
            projectContext: undefined as ProjectContext | undefined,
            setProjectId(projectId: string | undefined): void {
                this.projectId = projectId;
            },
            getProjectId(): string | undefined {
                return this.projectId;
            },
            setProjectContext(context: ProjectContext | undefined): void {
                this.projectContext = context;
                this.projectId = context?.id;
            }
        };

        (service as unknown as { client: typeof clientStub }).client = clientStub;

        service.setFullProjectContext('proj-9', 'Project Nine', 'org-7');

        assert.strictEqual(service.getProjectId(), 'proj-9');
        assert.deepStrictEqual(clientStub.projectContext, {
            id: 'proj-9',
            name: 'Project Nine',
            organizationId: 'org-7'
        });
    });

    test('setTargetProject uses full project context when target organization exists', () => {
        const auth = new MockAuthService();
        const service = new PineconeService(auth as unknown as AuthService);

        const clientStub = {
            projectId: undefined as string | undefined,
            projectContext: undefined as ProjectContext | undefined,
            setProjectId(projectId: string | undefined): void {
                this.projectId = projectId;
            },
            getProjectId(): string | undefined {
                return this.projectId;
            },
            setProjectContext(context: ProjectContext | undefined): void {
                this.projectContext = context;
                this.projectId = context?.id;
            },
            getProjectContext(): ProjectContext | undefined {
                return this.projectContext;
            }
        };

        const configStub = {
            setTargetProject: (_project: { id: string; name: string } | undefined): void => undefined,
            getTargetOrganization: (): { id: string; name: string } | undefined => ({ id: 'org-9', name: 'Org Nine' })
        };

        (service as unknown as { client: typeof clientStub }).client = clientStub;
        (service as unknown as { configService: typeof configStub }).configService = configStub;

        service.setTargetProject({ id: 'proj-9', name: 'Project Nine' });

        assert.strictEqual(clientStub.projectId, 'proj-9');
        assert.deepStrictEqual(clientStub.projectContext, {
            id: 'proj-9',
            name: 'Project Nine',
            organizationId: 'org-9'
        });
    });

    test('setTargetProject falls back to project-id context when organization is unavailable', () => {
        const auth = new MockAuthService();
        const service = new PineconeService(auth as unknown as AuthService);

        const calls: string[] = [];
        const clientStub = {
            projectId: undefined as string | undefined,
            projectContext: { id: 'old', name: 'Old', organizationId: 'org-old' } as ProjectContext | undefined,
            setProjectId(projectId: string | undefined): void {
                calls.push(`setProjectId:${projectId || ''}`);
                this.projectId = projectId;
            },
            getProjectId(): string | undefined {
                return this.projectId;
            },
            setProjectContext(context: ProjectContext | undefined): void {
                calls.push('setProjectContext');
                this.projectContext = context;
                if (context) {
                    this.projectId = context.id;
                }
            },
            getProjectContext(): ProjectContext | undefined {
                return this.projectContext;
            }
        };

        const configStub = {
            setTargetProject: (_project: { id: string; name: string } | undefined): void => undefined,
            getTargetOrganization: (): { id: string; name: string } | undefined => undefined
        };

        (service as unknown as { client: typeof clientStub }).client = clientStub;
        (service as unknown as { configService: typeof configStub }).configService = configStub;

        service.setTargetProject({ id: 'proj-10', name: 'Project Ten' });

        assert.strictEqual(clientStub.projectId, 'proj-10');
        assert.strictEqual(clientStub.projectContext, undefined);
        assert.deepStrictEqual(calls, ['setProjectContext', 'setProjectId:proj-10']);
    });

    test('listIndexes delegates to ControlPlaneApi and forwards per-request project context', async () => {
        const auth = new MockAuthService();
        const service = new PineconeService(auth as unknown as AuthService);

        const calls: Array<ProjectContext | undefined> = [];
        const controlPlaneStub = {
            listIndexes: async (projectContext?: ProjectContext): Promise<IndexModel[]> => {
                calls.push(projectContext);
                return [createIndex('idx-1')];
            }
        };

        (service as unknown as { controlPlane: typeof controlPlaneStub }).controlPlane = controlPlaneStub;

        const projectContext: ProjectContext = {
            id: 'proj-1',
            name: 'Project One',
            organizationId: 'org-1'
        };
        const indexes = await service.listIndexes(projectContext);

        assert.strictEqual(indexes.length, 1);
        assert.strictEqual(indexes[0].name, 'idx-1');
        assert.strictEqual(calls.length, 1);
        assert.deepStrictEqual(calls[0], projectContext);
    });

    test('createAssistant delegates to AssistantApi and forwards context', async () => {
        const auth = new MockAuthService();
        const service = new PineconeService(auth as unknown as AuthService);

        const calls: Array<{
            name: string;
            region?: string;
            instructions?: string;
            projectContext?: ProjectContext;
        }> = [];

        const assistantApiStub = {
            createAssistant: async (
                name: string,
                region?: string,
                instructions?: string,
                _metadata?: Record<string, unknown>,
                projectContext?: ProjectContext
            ): Promise<AssistantModel> => {
                calls.push({ name, region, instructions, projectContext });
                return createAssistant(name);
            }
        };

        (service as unknown as { assistantApi: typeof assistantApiStub }).assistantApi = assistantApiStub;

        const projectContext: ProjectContext = {
            id: 'proj-1',
            name: 'Project One',
            organizationId: 'org-1'
        };

        const assistant = await service.createAssistant(
            'assistant-one',
            'us',
            'helpful assistant',
            undefined,
            projectContext
        );

        assert.strictEqual(assistant.name, 'assistant-one');
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].name, 'assistant-one');
        assert.strictEqual(calls[0].region, 'us');
        assert.deepStrictEqual(calls[0].projectContext, projectContext);
    });

    test('listOrganizations returns empty success for API key auth without Admin API call', async () => {
        const auth = new MockAuthService();
        auth.authContext = AUTH_CONTEXTS.API_KEY;
        const service = new PineconeService(auth as unknown as AuthService);

        let adminCalled = false;
        const adminApiStub = {
            listOrganizations: async (_token: string): Promise<Organization[]> => {
                adminCalled = true;
                return [];
            }
        };

        (service as unknown as { adminApi: typeof adminApiStub }).adminApi = adminApiStub;

        const result = await service.listOrganizations();

        assert.strictEqual(result.success, true);
        assert.deepStrictEqual(result.data, []);
        assert.strictEqual(adminCalled, false);
    });

    test('listOrganizations returns explicit error result when Admin API call fails', async () => {
        const auth = new MockAuthService();
        auth.authContext = AUTH_CONTEXTS.USER_TOKEN;
        const service = new PineconeService(auth as unknown as AuthService);

        const adminApiStub = {
            listOrganizations: async (_token: string): Promise<Organization[]> => {
                throw new Error('admin unavailable');
            }
        };

        (service as unknown as { adminApi: typeof adminApiStub }).adminApi = adminApiStub;

        const result = await service.listOrganizations();

        assert.strictEqual(result.success, false);
        assert.deepStrictEqual(result.data, []);
        assert.ok(result.error?.includes('admin unavailable'));
    });

    test('listProjects returns projects from Admin API for JWT auth', async () => {
        const auth = new MockAuthService();
        auth.authContext = AUTH_CONTEXTS.USER_TOKEN;
        const service = new PineconeService(auth as unknown as AuthService);

        const projects: Project[] = [
            {
                id: 'proj-1',
                name: 'Project One',
                organization_id: 'org-1',
                force_encryption_with_cmek: false,
                created_at: new Date().toISOString()
            }
        ];

        const adminApiStub = {
            listProjects: async (_token: string, organizationId?: string): Promise<Project[]> => {
                assert.strictEqual(organizationId, 'org-1');
                return projects;
            }
        };

        (service as unknown as { adminApi: typeof adminApiStub }).adminApi = adminApiStub;

        const result = await service.listProjects('org-1');

        assert.strictEqual(result.success, true);
        assert.deepStrictEqual(result.data, projects);
    });
});
