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
    public describedIndexes = new Map<string, IndexModel>();
    public describeFailures = new Set<string>();

    public targetOrganization: { id: string; name: string } | undefined;
    public targetProject: { id: string; name: string } | undefined;
    public lastListIndexesContext: ProjectContext | undefined;
    public lastListAssistantsContext: ProjectContext | undefined;

    async listOrganizations(): Promise<{ success: boolean; data: Organization[]; error?: string }> {
        return { success: true, data: this.organizations };
    }

    setTargetOrganization(org: { id: string; name: string } | undefined): void {
        this.targetOrganization = org;
    }

    setTargetProject(project: { id: string; name: string } | undefined): void {
        this.targetProject = project;
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

    getControlPlane(): {
        listBackups: () => Promise<BackupModel[]>;
        describeIndex: (name: string) => Promise<IndexModel>;
    } {
        return {
            listBackups: async () => this.backups,
            describeIndex: async (name: string) => {
                if (this.describeFailures.has(name)) {
                    throw new Error('describe failed');
                }
                const described = this.describedIndexes.get(name);
                if (described) {
                    return described;
                }
                const found = this.indexes.find((index) => index.name === name);
                if (!found) {
                    throw new Error('not found');
                }
                return found;
            }
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

function makeDedicatedReadIndex(): IndexModel {
    return {
        name: 'idx-dedicated',
        metric: 'cosine',
        dimension: 1536,
        host: 'idx-dedicated.svc.us-east-1.pinecone.io',
        status: {
            ready: true,
            state: 'Ready',
            read_capacity: {
                mode: 'Dedicated',
                status: 'Ready',
                current_replicas: 2,
                current_shards: 3
            }
        },
        spec: {
            serverless: {
                cloud: 'aws',
                region: 'us-east-1',
                read_capacity: {
                    mode: 'Dedicated',
                    dedicated: {
                        node_type: 'b1',
                        scaling: 'Manual',
                        manual: {
                            replicas: 2,
                            shards: 3
                        }
                    }
                }
            }
        },
        deletion_protection: 'disabled'
    };
}

function makeDedicatedScalingIndex(): IndexModel {
    return {
        name: 'idx-dedicated-scaling',
        metric: 'cosine',
        dimension: 1536,
        host: 'idx-dedicated-scaling.svc.us-east-1.pinecone.io',
        status: {
            ready: true,
            state: 'Ready',
            read_capacity: {
                mode: 'Dedicated',
                status: 'Scaling',
                current_replicas: 1,
                current_shards: 1
            }
        },
        spec: {
            serverless: {
                cloud: 'aws',
                region: 'us-east-1',
                read_capacity: {
                    mode: 'Dedicated',
                    dedicated: {
                        node_type: 'b1',
                        scaling: 'Manual',
                        manual: {
                            replicas: 2,
                            shards: 1
                        }
                    }
                }
            }
        },
        deletion_protection: 'disabled'
    };
}

function makeDedicatedMigratingIndexFromDescribe(name: string): IndexModel {
    return {
        name,
        metric: 'cosine',
        dimension: 1536,
        host: `${name}.svc.us-east-1.pinecone.io`,
        status: {
            ready: true,
            state: 'Ready',
            read_capacity: {
                mode: 'Dedicated (Migrating)' as unknown as 'Dedicated',
                status: 'Ready'
            }
        },
        spec: {
            serverless: {
                cloud: 'aws',
                region: 'us-east-1',
                read_capacity: {
                    mode: 'Dedicated',
                    dedicated: {
                        node_type: 'b1',
                        scaling: 'Manual',
                        manual: {
                            replicas: 1,
                            shards: 1
                        }
                    }
                }
            }
        },
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

    test('expanding project persists target project for toolbar workflows', async () => {
        authService.context = AUTH_CONTEXTS.USER_TOKEN;

        const project = makeProject();
        const org = makeOrganization();
        const projectNode = new PineconeTreeItem(
            project.name,
            PineconeItemType.Project,
            vscode.TreeItemCollapsibleState.Collapsed,
            project.id,
            org.id,
            { project, organization: org }
        );

        const categories = await provider.getChildren(projectNode);

        assert.strictEqual(categories.length, 2);
        assert.strictEqual(categories[0].itemType, PineconeItemType.DatabaseCategory);
        assert.strictEqual(categories[1].itemType, PineconeItemType.AssistantCategory);
        assert.deepStrictEqual(pineconeService.targetOrganization, { id: org.id, name: org.name });
        assert.deepStrictEqual(pineconeService.targetProject, { id: project.id, name: project.name });
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

    test('renders dedicated read node indexes with DRN label and tooltip details', async () => {
        pineconeService.indexes = [makeDedicatedReadIndex()];

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
        assert.strictEqual(indexes[0].label, 'idx-dedicated (DRN)');
        assert.ok(String(indexes[0].tooltip).includes('Read Capacity: Dedicated'));
    });

    test('renders DRN scaling indexes as unavailable until scaling completes', async () => {
        pineconeService.indexes = [makeDedicatedScalingIndex()];

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
        assert.strictEqual(indexes[0].itemType, PineconeItemType.InitializingIndex);
        assert.strictEqual(indexes[0].label, 'idx-dedicated-scaling (DRN Scaling)');
        assert.ok(String(indexes[0].tooltip).includes('Actions are disabled'));
    });

    test('uses describe runtime to keep Dedicated (Migrating) index unavailable even when list shows Ready', async () => {
        const listed = makeIndex();
        listed.name = 'idx-dedicated-migrating';
        listed.host = 'idx-dedicated-migrating.svc.us-east-1.pinecone.io';
        listed.status = { ready: true, state: 'Ready' };
        listed.spec = {
            serverless: {
                cloud: 'aws',
                region: 'us-east-1',
                read_capacity: {
                    mode: 'Dedicated',
                    dedicated: {
                        node_type: 'b1',
                        scaling: 'Manual',
                        manual: {
                            replicas: 1,
                            shards: 1
                        }
                    }
                }
            }
        };

        pineconeService.indexes = [listed];
        pineconeService.describedIndexes.set(
            'idx-dedicated-migrating',
            makeDedicatedMigratingIndexFromDescribe('idx-dedicated-migrating')
        );

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
        assert.strictEqual(indexes[0].itemType, PineconeItemType.InitializingIndex);
        assert.strictEqual(indexes[0].label, 'idx-dedicated-migrating (DRN Migrating)');
        assert.ok(String(indexes[0].tooltip).includes('Actions are disabled'));
    });

    test('keeps dedicated indexes unavailable when describe fails and runtime status cannot be verified', async () => {
        const listed = makeDedicatedReadIndex();
        listed.name = 'idx-dedicated-describe-failure';
        listed.host = 'idx-dedicated-describe-failure.svc.us-east-1.pinecone.io';
        listed.status = { ready: true, state: 'Ready' };
        pineconeService.indexes = [listed];
        pineconeService.describeFailures.add('idx-dedicated-describe-failure');

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
        assert.strictEqual(indexes[0].itemType, PineconeItemType.InitializingIndex);
        assert.strictEqual(indexes[0].label, 'idx-dedicated-describe-failure (DRN Updating)');
        assert.ok(String(indexes[0].tooltip).includes('Unable to verify DRN runtime status'));
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
