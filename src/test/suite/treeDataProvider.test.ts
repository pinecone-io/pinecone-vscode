import * as assert from 'assert';
import * as vscode from 'vscode';
import { PineconeTreeDataProvider } from '../../providers/pineconeTreeDataProvider';
import { PineconeItemType, PineconeTreeItem } from '../../providers/treeItems';
import { AuthService } from '../../services/authService';
import { PineconeService } from '../../services/pineconeService';
import { AUTH_CONTEXTS } from '../../utils/constants';
import {
    AssistantModel,
    BackupModel,
    FileModel,
    IndexModel,
    ListNamespacesResponse,
    Organization,
    Project
} from '../../api/types';
import { ProjectContext } from '../../api/client';

class MockAuthService {
    public authenticated = true;
    public context: string = AUTH_CONTEXTS.API_KEY;
    public switchedOrganizationIds: string[] = [];
    public switchOrganizationResult = true;
    private listeners: Array<() => void> = [];

    readonly onDidChangeAuth = (listener: () => void): vscode.Disposable => {
        this.listeners.push(listener);
        return {
            dispose: () => {
                this.listeners = this.listeners.filter((l) => l !== listener);
            }
        };
    };

    isAuthenticated(): boolean {
        return this.authenticated;
    }

    getAuthContext(): string {
        return this.context;
    }

    async switchOrganization(organizationId: string): Promise<boolean> {
        this.switchedOrganizationIds.push(organizationId);
        return this.switchOrganizationResult;
    }
}

class MockPineconeService {
    public organizations: Organization[] = [];
    public projects: Project[] = [];
    public indexes: IndexModel[] = [];
    public assistants: AssistantModel[] = [];
    public namespaces: ListNamespacesResponse = { namespaces: [], total_count: 0 };
    public backups: BackupModel[] = [];
    public files: FileModel[] = [];

    public targetOrganization: { id: string; name: string } | undefined;
    public lastListIndexesContext: ProjectContext | undefined;
    public lastListAssistantsContext: ProjectContext | undefined;

    async listOrganizations(): Promise<{ success: boolean; data: Organization[]; error?: string }> {
        return { success: true, data: this.organizations };
    }

    setTargetOrganization(org: { id: string; name: string } | undefined): void {
        this.targetOrganization = org;
    }

    async listProjects(_organizationId?: string): Promise<{ success: boolean; data: Project[]; error?: string }> {
        return { success: true, data: this.projects };
    }

    async listIndexes(projectContext?: ProjectContext): Promise<IndexModel[]> {
        this.lastListIndexesContext = projectContext;
        return this.indexes;
    }

    async listAssistants(projectContext?: ProjectContext): Promise<AssistantModel[]> {
        this.lastListAssistantsContext = projectContext;
        return this.assistants;
    }

    getNamespaceApi(): { listNamespaces: () => Promise<ListNamespacesResponse> } {
        return {
            listNamespaces: async () => this.namespaces
        };
    }

    getControlPlane(): { listBackups: () => Promise<BackupModel[]> } {
        return {
            listBackups: async () => this.backups
        };
    }

    getAssistantApi(): { listFiles: () => Promise<FileModel[]> } {
        return {
            listFiles: async () => this.files
        };
    }
}

function makeOrganization(): Organization {
    return {
        id: 'org-1',
        name: 'Org One'
    };
}

function makeProject(): Project {
    return {
        id: 'proj-1',
        name: 'Project One',
        organization_id: 'org-1',
        force_encryption_with_cmek: false,
        created_at: new Date().toISOString()
    };
}

function makeIndex(): IndexModel {
    return {
        name: 'idx-1',
        metric: 'cosine',
        dimension: 1536,
        host: 'idx-1.svc.us-east-1.pinecone.io',
        status: { ready: true, state: 'Ready' },
        spec: { serverless: { cloud: 'aws', region: 'us-east-1' } },
        deletion_protection: 'disabled'
    };
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

suite('PineconeTreeDataProvider (Production Class)', () => {
    let authService: MockAuthService;
    let pineconeService: MockPineconeService;
    let provider: PineconeTreeDataProvider;

    setup(() => {
        authService = new MockAuthService();
        pineconeService = new MockPineconeService();
        provider = new PineconeTreeDataProvider(
            pineconeService as unknown as PineconeService,
            authService as unknown as AuthService
        );
    });

    test('returns empty root when not authenticated', async () => {
        authService.authenticated = false;

        const children = await provider.getChildren();

        assert.deepStrictEqual(children, []);
    });

    test('returns database and assistant categories at root for API key auth', async () => {
        authService.context = AUTH_CONTEXTS.API_KEY;

        const children = await provider.getChildren();

        assert.strictEqual(children.length, 2);
        assert.strictEqual(children[0].itemType, PineconeItemType.DatabaseCategory);
        assert.strictEqual(children[1].itemType, PineconeItemType.AssistantCategory);
    });

    test('returns organization nodes for JWT auth', async () => {
        authService.context = AUTH_CONTEXTS.USER_TOKEN;
        pineconeService.organizations = [makeOrganization()];

        const root = await provider.getChildren();

        assert.strictEqual(root.length, 1);
        assert.strictEqual(root[0].itemType, PineconeItemType.Organization);
        assert.strictEqual(root[0].resourceId, 'org-1');
    });

    test('expanding organization persists selection and returns project nodes', async () => {
        authService.context = AUTH_CONTEXTS.USER_TOKEN;
        pineconeService.projects = [makeProject()];

        const org = new PineconeTreeItem(
            'Org One',
            PineconeItemType.Organization,
            vscode.TreeItemCollapsibleState.Collapsed,
            'org-1',
            undefined,
            { organization: makeOrganization() }
        );

        const projects = await provider.getChildren(org);

        assert.strictEqual(projects.length, 1);
        assert.strictEqual(projects[0].itemType, PineconeItemType.Project);
        assert.strictEqual(pineconeService.targetOrganization?.id, 'org-1');
        assert.deepStrictEqual(authService.switchedOrganizationIds, ['org-1']);
    });

    test('passes full project context when listing indexes under database category', async () => {
        pineconeService.indexes = [makeIndex()];

        const project = makeProject();
        const organization = makeOrganization();
        const databaseCategory = new PineconeTreeItem(
            'Database',
            PineconeItemType.DatabaseCategory,
            vscode.TreeItemCollapsibleState.Collapsed,
            project.id,
            project.id,
            { project, organization }
        );

        const indexes = await provider.getChildren(databaseCategory);

        assert.strictEqual(indexes.length, 1);
        assert.strictEqual(indexes[0].itemType, PineconeItemType.Index);
        assert.deepStrictEqual(pineconeService.lastListIndexesContext, {
            id: project.id,
            name: project.name,
            organizationId: organization.id
        });
        assert.ok(indexes[0].metadata?.project);
        assert.ok(indexes[0].metadata?.organization);
    });

    test('stale namespace metadata schedules only one recovery refresh', async () => {
        const staleIndex = makeIndex();
        const staleNamespaceCategory = new PineconeTreeItem(
            'Namespaces',
            PineconeItemType.NamespacesCategory,
            vscode.TreeItemCollapsibleState.Collapsed,
            'idx-stale',
            'proj-1:idx-stale',
            { index: staleIndex }
        );

        let refreshEvents = 0;
        const disposable = provider.onDidChangeTreeData(() => {
            refreshEvents += 1;
        });

        try {
            const first = await provider.getChildren(staleNamespaceCategory);
            const second = await provider.getChildren(staleNamespaceCategory);

            assert.deepStrictEqual(first, []);
            assert.deepStrictEqual(second, []);

            await sleep(200);
            assert.strictEqual(refreshEvents, 1);
        } finally {
            disposable.dispose();
        }
    });
});
