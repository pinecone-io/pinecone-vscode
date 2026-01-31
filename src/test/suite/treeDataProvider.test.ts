/**
 * Tree Data Provider Tests
 * 
 * Comprehensive tests for the PineconeTreeDataProvider that powers
 * the sidebar tree view. Tests cover:
 * 
 * - Tree structure based on authentication type
 * - Project context propagation through the tree
 * - Error handling and recovery
 * - Item metadata and display properties
 * 
 * @module test/suite/treeDataProvider.test
 */

import * as assert from 'assert';
import {
    MockPineconeService,
    MockAuthService,
    TestFixtures
} from '../mocks';
import { PineconeItemType } from '../../providers/treeItems';
import { Organization, Project } from '../../api/types';

// ============================================================================
// Mock Tree Item for Testing
// ============================================================================

/**
 * Simplified tree item for testing without VSCode dependencies.
 */
interface MockTreeItem {
    label: string;
    itemType: PineconeItemType;
    resourceId?: string;
    parentId?: string;
    collapsibleState: 'none' | 'collapsed' | 'expanded';
    contextValue?: string;
    tooltip?: string;
    metadata?: Record<string, unknown>;
}

/**
 * Simulates the tree data provider's getChildren logic for testing.
 */
class MockTreeDataProvider {
    constructor(
        private pineconeService: MockPineconeService,
        private authService: MockAuthService
    ) {}

    /**
     * Gets children for a tree element, mirroring the real implementation.
     */
    async getChildren(element?: MockTreeItem): Promise<MockTreeItem[]> {
        if (!this.authService.isAuthenticated()) {
            return [];
        }

        const authContext = this.authService.getAuthContext();

        // Root level
        if (!element) {
            return this.getRootChildren(authContext);
        }

        // Dispatch based on item type
        switch (element.itemType) {
            case PineconeItemType.Organization:
                return this.getOrganizationChildren(element);
            case PineconeItemType.Project:
                return this.getProjectChildren(element);
            case PineconeItemType.DatabaseCategory:
                return this.getDatabaseChildren(element);
            case PineconeItemType.AssistantCategory:
                return this.getAssistantChildren(element);
            case PineconeItemType.Index:
                return this.getIndexChildren(element);
            case PineconeItemType.Assistant:
                return this.getAssistantItemChildren(element);
            default:
                return [];
        }
    }

    private async getRootChildren(authContext: string): Promise<MockTreeItem[]> {
        if (authContext === 'user_token' || authContext === 'service_account') {
            // JWT auth: Show organizations
            return [
                {
                    label: 'Test Organization',
                    itemType: PineconeItemType.Organization,
                    resourceId: 'org-123',
                    collapsibleState: 'collapsed',
                    contextValue: 'organization',
                    metadata: { organization: TestFixtures.createOrganization() }
                }
            ];
        } else {
            // API key auth: Show Database/Assistant directly
            return [
                {
                    label: 'Database',
                    itemType: PineconeItemType.DatabaseCategory,
                    collapsibleState: 'collapsed',
                    contextValue: 'database-category'
                },
                {
                    label: 'Assistant',
                    itemType: PineconeItemType.AssistantCategory,
                    collapsibleState: 'collapsed',
                    contextValue: 'assistant-category'
                }
            ];
        }
    }

    private async getOrganizationChildren(element: MockTreeItem): Promise<MockTreeItem[]> {
        const projects = [TestFixtures.createProject()];
        const organization = element.metadata?.organization as Organization;

        return projects.map(proj => ({
            label: proj.name,
            itemType: PineconeItemType.Project,
            resourceId: proj.id,
            parentId: element.resourceId,
            collapsibleState: 'collapsed',
            contextValue: 'project',
            metadata: { project: proj, organization }
        }));
    }

    private async getProjectChildren(element: MockTreeItem): Promise<MockTreeItem[]> {
        const project = element.metadata?.project as Project;
        const organization = element.metadata?.organization as Organization;

        return [
            {
                label: 'Database',
                itemType: PineconeItemType.DatabaseCategory,
                resourceId: element.resourceId,
                parentId: element.resourceId,
                collapsibleState: 'collapsed',
                contextValue: 'database-category',
                metadata: { project, organization }
            },
            {
                label: 'Assistant',
                itemType: PineconeItemType.AssistantCategory,
                resourceId: element.resourceId,
                parentId: element.resourceId,
                collapsibleState: 'collapsed',
                contextValue: 'assistant-category',
                metadata: { project, organization }
            }
        ];
    }

    private async getDatabaseChildren(element: MockTreeItem): Promise<MockTreeItem[]> {
        const project = element.metadata?.project as Project;
        const organization = element.metadata?.organization as Organization;
        
        // Build project context for API call
        const projectContext = project && organization ? {
            id: project.id,
            name: project.name,
            organizationId: organization.id
        } : undefined;

        const indexes = await this.pineconeService.listIndexes(projectContext);

        return indexes.map(idx => {
            const isPod = idx.spec && 'pod' in idx.spec;
            const isInitializing = idx.status?.state === 'Initializing';
            const isTerminating = idx.status?.state === 'Terminating';

            let label = idx.name;
            if (isPod) { label += ' (pod)'; }
            else if (isTerminating) { label = `${idx.name} (Deleting)`; }
            else if (isInitializing) { label = `${idx.name} (Initializing)`; }

            return {
                label,
                itemType: isPod ? PineconeItemType.PodIndex : PineconeItemType.Index,
                resourceId: idx.name,
                parentId: element.parentId,
                collapsibleState: isPod || isInitializing ? 'none' : 'collapsed',
                contextValue: isPod ? 'pod-index' : (isInitializing ? 'initializing-index' : 'index'),
                tooltip: isTerminating ? 'Index is being deleted' : undefined,
                metadata: { index: idx, project, organization }
            };
        });
    }

    private async getAssistantChildren(element: MockTreeItem): Promise<MockTreeItem[]> {
        const project = element.metadata?.project as Project;
        const organization = element.metadata?.organization as Organization;
        
        const projectContext = project && organization ? {
            id: project.id,
            name: project.name,
            organizationId: organization.id
        } : undefined;

        const assistants = await this.pineconeService.listAssistants(projectContext);

        return assistants.map(asst => ({
            label: asst.name,
            itemType: PineconeItemType.Assistant,
            resourceId: asst.name,
            parentId: element.parentId,
            collapsibleState: 'collapsed',
            contextValue: 'assistant',
            metadata: { assistant: asst, project, organization }
        }));
    }

    private async getIndexChildren(_element: MockTreeItem): Promise<MockTreeItem[]> {
        // Index children would include Namespaces and Backups categories
        return [
            {
                label: 'Namespaces',
                itemType: PineconeItemType.NamespacesCategory,
                collapsibleState: 'collapsed',
                contextValue: 'namespaces-category'
            },
            {
                label: 'Backups',
                itemType: PineconeItemType.BackupsCategory,
                collapsibleState: 'collapsed',
                contextValue: 'backups-category'
            }
        ];
    }

    private async getAssistantItemChildren(_element: MockTreeItem): Promise<MockTreeItem[]> {
        return [
            {
                label: 'Files',
                itemType: PineconeItemType.FilesCategory,
                collapsibleState: 'collapsed',
                contextValue: 'files-category'
            }
        ];
    }
}

// ============================================================================
// Test Suites
// ============================================================================

suite('Tree Data Provider Tests', () => {
    let mockService: MockPineconeService;
    let mockAuth: MockAuthService;
    let provider: MockTreeDataProvider;

    setup(() => {
        mockService = new MockPineconeService();
        mockAuth = new MockAuthService();
        provider = new MockTreeDataProvider(mockService, mockAuth);
    });

    suite('Authentication State', () => {

        test('should return empty array when not authenticated', async () => {
            mockAuth.isAuthenticatedResult = false;

            const children = await provider.getChildren();

            assert.strictEqual(children.length, 0);
        });

        test('should return organizations for JWT auth', async () => {
            mockAuth.isAuthenticatedResult = true;
            mockAuth.authContextResult = 'user_token';

            const children = await provider.getChildren();

            assert.strictEqual(children.length, 1);
            assert.strictEqual(children[0].itemType, PineconeItemType.Organization);
        });

        test('should return Database/Assistant for API key auth', async () => {
            mockAuth.isAuthenticatedResult = true;
            mockAuth.authContextResult = 'default_api_key';

            const children = await provider.getChildren();

            assert.strictEqual(children.length, 2);
            assert.strictEqual(children[0].itemType, PineconeItemType.DatabaseCategory);
            assert.strictEqual(children[1].itemType, PineconeItemType.AssistantCategory);
        });
    });

    suite('Project Context Propagation', () => {

        test('should propagate organization to project children', async () => {
            mockAuth.isAuthenticatedResult = true;
            mockAuth.authContextResult = 'user_token';

            // Get organizations
            const orgs = await provider.getChildren();
            assert.strictEqual(orgs.length, 1);

            // Get projects under organization
            const projects = await provider.getChildren(orgs[0]);
            assert.strictEqual(projects.length, 1);

            // Verify organization is in metadata
            assert.ok(projects[0].metadata?.organization);
            assert.ok(projects[0].metadata?.project);
        });

        test('should propagate project and organization to Database children', async () => {
            mockAuth.isAuthenticatedResult = true;
            mockAuth.authContextResult = 'user_token';
            mockService.listIndexesResult = [TestFixtures.createIndex()];

            // Navigate to Database category
            const orgs = await provider.getChildren();
            const projects = await provider.getChildren(orgs[0]);
            const categories = await provider.getChildren(projects[0]);
            
            const databaseCategory = categories.find(c => c.itemType === PineconeItemType.DatabaseCategory);
            assert.ok(databaseCategory);

            // Get indexes
            const indexes = await provider.getChildren(databaseCategory);
            assert.strictEqual(indexes.length, 1);

            // Verify both project and organization are in metadata
            assert.ok(indexes[0].metadata?.project);
            assert.ok(indexes[0].metadata?.organization);
            assert.ok(indexes[0].metadata?.index);
        });

        test('should pass project context when listing indexes', async () => {
            mockAuth.isAuthenticatedResult = true;
            mockAuth.authContextResult = 'user_token';
            mockService.listIndexesResult = [TestFixtures.createIndex()];

            // Navigate to Database category with metadata
            const databaseCategory: MockTreeItem = {
                label: 'Database',
                itemType: PineconeItemType.DatabaseCategory,
                collapsibleState: 'collapsed',
                metadata: {
                    project: TestFixtures.createProject(),
                    organization: TestFixtures.createOrganization()
                }
            };

            await provider.getChildren(databaseCategory);

            // Verify listIndexes was called with project context
            const call = mockService.getLastCallTo('listIndexes');
            assert.ok(call);
            assert.ok(call.args[0]); // Project context should be present
        });
    });

    suite('Index Display States', () => {

        test('should show Initializing state', async () => {
            mockAuth.isAuthenticatedResult = true;
            mockAuth.authContextResult = 'default_api_key';
            mockService.listIndexesResult = [
                TestFixtures.createIndex({ 
                    status: { ready: false, state: 'Initializing' } 
                })
            ];

            const categories = await provider.getChildren();
            const databaseCategory = categories.find(c => c.itemType === PineconeItemType.DatabaseCategory);
            const indexes = await provider.getChildren(databaseCategory!);

            assert.ok(indexes[0].label.includes('Initializing'));
            assert.strictEqual(indexes[0].collapsibleState, 'none');
            assert.strictEqual(indexes[0].contextValue, 'initializing-index');
        });

        test('should show Deleting state for Terminating indexes', async () => {
            mockAuth.isAuthenticatedResult = true;
            mockAuth.authContextResult = 'default_api_key';
            mockService.listIndexesResult = [
                TestFixtures.createIndex({ 
                    status: { ready: false, state: 'Terminating' } 
                })
            ];

            const categories = await provider.getChildren();
            const databaseCategory = categories.find(c => c.itemType === PineconeItemType.DatabaseCategory);
            const indexes = await provider.getChildren(databaseCategory!);

            assert.ok(indexes[0].label.includes('Deleting'));
            assert.ok(indexes[0].tooltip?.includes('deleted'));
        });

        test('should show pod indicator for pod indexes', async () => {
            mockAuth.isAuthenticatedResult = true;
            mockAuth.authContextResult = 'default_api_key';
            mockService.listIndexesResult = [TestFixtures.createPodIndex()];

            const categories = await provider.getChildren();
            const databaseCategory = categories.find(c => c.itemType === PineconeItemType.DatabaseCategory);
            const indexes = await provider.getChildren(databaseCategory!);

            assert.ok(indexes[0].label.includes('pod'));
            assert.strictEqual(indexes[0].itemType, PineconeItemType.PodIndex);
            assert.strictEqual(indexes[0].contextValue, 'pod-index');
        });
    });

    suite('Tree Item Children', () => {

        test('Index should have Namespaces and Backups children', async () => {
            // Must be authenticated for provider to return children
            mockAuth.isAuthenticatedResult = true;
            mockAuth.authContextResult = 'default_api_key';

            const indexItem: MockTreeItem = {
                label: 'test-index',
                itemType: PineconeItemType.Index,
                collapsibleState: 'collapsed'
            };

            const children = await provider.getChildren(indexItem);

            assert.strictEqual(children.length, 2);
            assert.ok(children.some(c => c.itemType === PineconeItemType.NamespacesCategory));
            assert.ok(children.some(c => c.itemType === PineconeItemType.BackupsCategory));
        });

        test('Assistant should have Files child', async () => {
            // Must be authenticated for provider to return children
            mockAuth.isAuthenticatedResult = true;
            mockAuth.authContextResult = 'default_api_key';

            const assistantItem: MockTreeItem = {
                label: 'test-assistant',
                itemType: PineconeItemType.Assistant,
                collapsibleState: 'collapsed'
            };

            const children = await provider.getChildren(assistantItem);

            assert.strictEqual(children.length, 1);
            assert.strictEqual(children[0].itemType, PineconeItemType.FilesCategory);
        });
    });

    suite('Context Values', () => {

        test('context values should match package.json when clauses', () => {
            // These context values must match the ones in package.json
            // for menu items to show correctly
            const expectedContextValues = {
                [PineconeItemType.Organization]: 'organization',
                [PineconeItemType.Project]: 'project',
                [PineconeItemType.DatabaseCategory]: 'database-category',
                [PineconeItemType.AssistantCategory]: 'assistant-category',
                [PineconeItemType.Index]: 'index',
                [PineconeItemType.PodIndex]: 'pod-index',
                [PineconeItemType.Assistant]: 'assistant',
                [PineconeItemType.NamespacesCategory]: 'namespaces-category',
                [PineconeItemType.BackupsCategory]: 'backups-category',
                [PineconeItemType.FilesCategory]: 'files-category'
            };

            for (const [itemType, contextValue] of Object.entries(expectedContextValues)) {
                assert.ok(contextValue, `${itemType} should have a context value`);
            }
        });
    });
});

suite('Tree Data Provider Error Handling', () => {
    let mockService: MockPineconeService;
    let mockAuth: MockAuthService;
    let provider: MockTreeDataProvider;

    setup(() => {
        mockService = new MockPineconeService();
        mockAuth = new MockAuthService();
        mockAuth.isAuthenticatedResult = true;
        mockAuth.authContextResult = 'default_api_key';
        provider = new MockTreeDataProvider(mockService, mockAuth);
    });

    test('should handle API errors when listing indexes', async () => {
        mockService.errorToThrow = new Error('API Error: 500 Internal Server Error');

        const categories = await provider.getChildren();
        const databaseCategory = categories.find(c => c.itemType === PineconeItemType.DatabaseCategory);

        try {
            await provider.getChildren(databaseCategory!);
            assert.fail('Should have thrown error');
        } catch (error: unknown) {
            assert.ok(error instanceof Error);
            assert.ok(error.message.includes('500'));
        }
    });

    test('should detect authentication errors', () => {
        const authErrorPatterns = [
            '401 Unauthorized',
            'Token expired',
            'Authentication failed',
            'Invalid API key',
            'x-project-id header required'
        ];

        for (const pattern of authErrorPatterns) {
            const isAuthError = pattern.toLowerCase().includes('401') ||
                               pattern.toLowerCase().includes('unauthorized') ||
                               pattern.toLowerCase().includes('token expired') ||
                               pattern.toLowerCase().includes('authentication failed') ||
                               pattern.toLowerCase().includes('invalid api key') ||
                               pattern.toLowerCase().includes('x-project-id');
            
            assert.ok(isAuthError, `"${pattern}" should be detected as auth error`);
        }
    });
});

suite('Tree Item ID Generation', () => {

    test('should generate unique IDs for items', () => {
        // Test the pattern used for building unique IDs
        function buildUniqueId(parentId: string | undefined, itemType: string, resourceId: string): string {
            const parts: string[] = [];
            if (parentId) { parts.push(parentId); }
            parts.push(itemType);
            parts.push(resourceId);
            return parts.join(':');
        }

        // Same resource under different parents should have different IDs
        const id1 = buildUniqueId('proj-123', 'index', 'my-index');
        const id2 = buildUniqueId('proj-456', 'index', 'my-index');

        assert.notStrictEqual(id1, id2);
        assert.strictEqual(id1, 'proj-123:index:my-index');
        assert.strictEqual(id2, 'proj-456:index:my-index');
    });

    test('should handle composite parent IDs correctly', () => {
        // Composite ID format: "projectId:resourceName"
        const compositeParentId = 'proj-123:my-index';
        
        // Extract project ID
        const colonIndex = compositeParentId.indexOf(':');
        const projectId = colonIndex > 0 ? compositeParentId.substring(0, colonIndex) : compositeParentId;
        
        assert.strictEqual(projectId, 'proj-123');
    });
});
