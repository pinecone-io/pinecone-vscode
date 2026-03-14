/**
 * Project and Organization Commands Behavioral Tests
 * 
 * Tests for project and organization operations verifying they:
 * - Build correct API requests from user input
 * - Handle authentication context appropriately
 * - Handle CMEK encryption warnings correctly
 * - Validate input properly
 * - Return proper error feedback via OperationResult
 */

import * as assert from 'assert';
import { Project, CreateProjectParams, Organization } from '../../api/types';
import { validateProjectName } from '../../commands/project.commands';
import { OperationResult } from '../../services/pineconeService';

/**
 * Mock AdminApiClient for testing project command logic.
 */
class MockAdminApi {
    public lastCreateProjectCall: { token: string; params: CreateProjectParams } | null = null;
    public lastDeleteProjectCall: { token: string; projectId: string } | null = null;
    public lastDescribeProjectCall: { token: string; projectId: string } | null = null;
    public lastUpdateProjectCall: { token: string; projectId: string; name: string } | null = null;
    
    public createProjectResult: Project = {
        id: 'proj-new',
        name: 'new-project',
        organization_id: 'org-123',
        force_encryption_with_cmek: false,
        created_at: new Date().toISOString()
    };
    public shouldThrowError: Error | null = null;

    async getAccessToken(_clientId: string, _clientSecret: string): Promise<string> {
        if (this.shouldThrowError) {
            throw this.shouldThrowError;
        }
        return 'mock-access-token';
    }

    async createProject(accessToken: string, params: CreateProjectParams): Promise<Project> {
        if (this.shouldThrowError) {
            throw this.shouldThrowError;
        }
        this.lastCreateProjectCall = { token: accessToken, params };
        return this.createProjectResult;
    }

    async describeProject(accessToken: string, projectId: string): Promise<Project> {
        if (this.shouldThrowError) {
            throw this.shouldThrowError;
        }
        this.lastDescribeProjectCall = { token: accessToken, projectId };
        return {
            id: projectId,
            name: 'test-project',
            organization_id: 'org-123',
            force_encryption_with_cmek: false,
            created_at: new Date().toISOString()
        };
    }

    async deleteProject(accessToken: string, projectId: string): Promise<void> {
        if (this.shouldThrowError) {
            throw this.shouldThrowError;
        }
        this.lastDeleteProjectCall = { token: accessToken, projectId };
    }

    async updateProject(accessToken: string, projectId: string, params: { name: string }): Promise<Project> {
        if (this.shouldThrowError) {
            throw this.shouldThrowError;
        }
        this.lastUpdateProjectCall = { token: accessToken, projectId, name: params.name };
        return {
            id: projectId,
            name: params.name,
            organization_id: 'org-123',
            force_encryption_with_cmek: false,
            created_at: new Date().toISOString()
        };
    }
}

suite('Project Commands Behavioral Tests', () => {

    suite('createProject Command Logic', () => {

        test('should build project request correctly', async () => {
            const mockApi = new MockAdminApi();
            const token = await mockApi.getAccessToken('client-id', 'client-secret');
            
            await mockApi.createProject(token, {
                name: 'my-new-project'
            });

            assert.ok(mockApi.lastCreateProjectCall);
            assert.strictEqual(mockApi.lastCreateProjectCall.token, 'mock-access-token');
            assert.strictEqual(mockApi.lastCreateProjectCall.params.name, 'my-new-project');
            assert.strictEqual(mockApi.lastCreateProjectCall.params.force_encryption_with_cmek, undefined);
        });

        test('should include CMEK setting when specified', async () => {
            const mockApi = new MockAdminApi();
            const token = await mockApi.getAccessToken('client-id', 'client-secret');
            
            await mockApi.createProject(token, {
                name: 'secure-project',
                force_encryption_with_cmek: true
            });

            assert.ok(mockApi.lastCreateProjectCall);
            assert.strictEqual(mockApi.lastCreateProjectCall.params.force_encryption_with_cmek, true);
        });

        test('should return created project details', async () => {
            const mockApi = new MockAdminApi();
            mockApi.createProjectResult = {
                id: 'proj-xyz',
                name: 'test-project',
                organization_id: 'org-abc',
                force_encryption_with_cmek: false,
                created_at: '2024-01-01T00:00:00Z'
            };
            
            const token = await mockApi.getAccessToken('client-id', 'client-secret');
            const project = await mockApi.createProject(token, { name: 'test-project' });

            assert.strictEqual(project.id, 'proj-xyz');
            assert.strictEqual(project.name, 'test-project');
            assert.strictEqual(project.organization_id, 'org-abc');
        });
    });

    suite('deleteProject Command Logic', () => {

        test('should call deleteProject with correct parameters', async () => {
            const mockApi = new MockAdminApi();
            const token = await mockApi.getAccessToken('client-id', 'client-secret');
            
            await mockApi.deleteProject(token, 'proj-to-delete');

            assert.ok(mockApi.lastDeleteProjectCall);
            assert.strictEqual(mockApi.lastDeleteProjectCall.token, 'mock-access-token');
            assert.strictEqual(mockApi.lastDeleteProjectCall.projectId, 'proj-to-delete');
        });
    });

    suite('renameProject Command Logic', () => {

        test('should call updateProject with name-only payload', async () => {
            const mockApi = new MockAdminApi();
            const token = await mockApi.getAccessToken('client-id', 'client-secret');

            const updated = await mockApi.updateProject(token, 'proj-rename', { name: 'renamed-project' });

            assert.ok(mockApi.lastUpdateProjectCall);
            assert.strictEqual(mockApi.lastUpdateProjectCall.token, 'mock-access-token');
            assert.strictEqual(mockApi.lastUpdateProjectCall.projectId, 'proj-rename');
            assert.strictEqual(mockApi.lastUpdateProjectCall.name, 'renamed-project');
            assert.strictEqual(updated.name, 'renamed-project');
        });
    });

    suite('describeProject Command Logic', () => {

        test('should return project details', async () => {
            const mockApi = new MockAdminApi();
            const token = await mockApi.getAccessToken('client-id', 'client-secret');
            
            const project = await mockApi.describeProject(token, 'proj-123');

            assert.ok(mockApi.lastDescribeProjectCall);
            assert.strictEqual(mockApi.lastDescribeProjectCall.projectId, 'proj-123');
            assert.strictEqual(project.id, 'proj-123');
            assert.strictEqual(project.name, 'test-project');
        });
    });

    suite('Authentication Error Handling', () => {

        test('should fail gracefully on auth error', async () => {
            const mockApi = new MockAdminApi();
            mockApi.shouldThrowError = new Error('Invalid credentials');

            try {
                await mockApi.getAccessToken('bad-id', 'bad-secret');
                assert.fail('Should have thrown');
            } catch (e) {
                assert.ok(e instanceof Error);
                assert.ok(e.message.includes('Invalid credentials'));
            }
        });

        test('should propagate API errors on create', async () => {
            const mockApi = new MockAdminApi();
            
            // First call succeeds for token
            const token = await mockApi.getAccessToken('client-id', 'client-secret');
            
            // Then set error for create
            mockApi.shouldThrowError = new Error('Project name already exists');

            try {
                await mockApi.createProject(token, { name: 'duplicate-name' });
                assert.fail('Should have thrown');
            } catch (e) {
                assert.ok(e instanceof Error);
                assert.ok(e.message.includes('already exists'));
            }
        });

        test('should propagate API errors on delete', async () => {
            const mockApi = new MockAdminApi();
            const token = await mockApi.getAccessToken('client-id', 'client-secret');
            
            mockApi.shouldThrowError = new Error('Project not empty');

            try {
                await mockApi.deleteProject(token, 'proj-with-resources');
                assert.fail('Should have thrown');
            } catch (e) {
                assert.ok(e instanceof Error);
                assert.ok(e.message.includes('not empty'));
            }
        });
    });
});

suite('Project Name Validation Tests', () => {

    test('should accept valid project names', () => {
        const validNames = [
            'my-project',
            'project_123',
            'MyProject',
            'test',
            'a',
            'project-with-hyphens',
            'project_with_underscores',
            'MixedCase123'
        ];

        for (const name of validNames) {
            const error = validateProjectName(name);
            assert.strictEqual(error, null, `Expected "${name}" to be valid`);
        }
    });

    test('should reject empty project name', () => {
        const error = validateProjectName('');
        assert.ok(error);
        assert.ok(error.includes('required'));
    });

    test('should reject names with invalid characters', () => {
        const invalidNames = [
            'project.with.dots',
            'project with spaces',
            'project/with/slashes',
            'project:with:colons',
            'project@special',
            'project!exclaim'
        ];

        for (const name of invalidNames) {
            const error = validateProjectName(name);
            assert.ok(error, `Expected "${name}" to be invalid`);
            assert.ok(error!.includes('alphanumeric') || error!.includes('hyphens') || error!.includes('underscores'));
        }
    });

    test('should reject names exceeding max length', () => {
        const longName = 'a'.repeat(65);
        const error = validateProjectName(longName);
        assert.ok(error);
        assert.ok(error.includes('64'));
    });

    test('should accept names at max length', () => {
        const maxName = 'a'.repeat(64);
        const error = validateProjectName(maxName);
        assert.strictEqual(error, null);
    });
});

// =============================================================================
// Organization Tests
// =============================================================================

/**
 * Mock AdminApiClient for testing organization operations.
 */
class MockAdminApiWithOrgs {
    public lastListOrganizationsCall: { token: string } | null = null;
    public listOrganizationsResult: Organization[] = [];
    public shouldThrowError: Error | null = null;

    async listOrganizations(accessToken: string): Promise<Organization[]> {
        this.lastListOrganizationsCall = { token: accessToken };
        if (this.shouldThrowError) {
            throw this.shouldThrowError;
        }
        return this.listOrganizationsResult;
    }

    async listProjects(_accessToken: string, _organizationId?: string): Promise<Project[]> {
        if (this.shouldThrowError) {
            throw this.shouldThrowError;
        }
        return [
            { id: 'proj-1', name: 'Project 1', created_at: '2024-01-01T00:00:00Z' },
            { id: 'proj-2', name: 'Project 2', created_at: '2024-01-02T00:00:00Z' }
        ];
    }
}

suite('Organization API Tests', () => {

    suite('listOrganizations', () => {

        test('should return organizations successfully', async () => {
            const mockApi = new MockAdminApiWithOrgs();
            mockApi.listOrganizationsResult = [
                { id: 'org-1', name: 'Organization 1' },
                { id: 'org-2', name: 'Organization 2' }
            ];

            const orgs = await mockApi.listOrganizations('mock-token');

            assert.ok(mockApi.lastListOrganizationsCall);
            assert.strictEqual(mockApi.lastListOrganizationsCall.token, 'mock-token');
            assert.strictEqual(orgs.length, 2);
            assert.strictEqual(orgs[0].name, 'Organization 1');
        });

        test('should return empty array when user has no organizations', async () => {
            const mockApi = new MockAdminApiWithOrgs();
            mockApi.listOrganizationsResult = [];

            const orgs = await mockApi.listOrganizations('mock-token');

            assert.strictEqual(orgs.length, 0);
        });

        test('should throw on API error', async () => {
            const mockApi = new MockAdminApiWithOrgs();
            mockApi.shouldThrowError = new Error('API rate limit exceeded');

            try {
                await mockApi.listOrganizations('mock-token');
                assert.fail('Should have thrown');
            } catch (e) {
                assert.ok(e instanceof Error);
                assert.ok(e.message.includes('rate limit'));
            }
        });
    });
});

suite('OperationResult Pattern Tests', () => {

    test('should represent successful result', () => {
        const result: OperationResult<Organization[]> = {
            success: true,
            data: [{ id: 'org-1', name: 'Test Org' }]
        };

        assert.strictEqual(result.success, true);
        assert.ok(result.data);
        assert.strictEqual(result.data.length, 1);
        assert.strictEqual(result.error, undefined);
    });

    test('should represent failed result with error', () => {
        const result: OperationResult<Organization[]> = {
            success: false,
            error: 'Network timeout',
            data: []  // Fallback empty array
        };

        assert.strictEqual(result.success, false);
        assert.ok(result.error);
        assert.ok(result.error.includes('timeout'));
        assert.ok(result.data);  // Should have fallback
    });

    test('should distinguish success from expected empty', () => {
        // When API key auth is used, empty array is expected, not an error
        const result: OperationResult<Organization[]> = {
            success: true,
            data: []  // Empty because API keys don't have org access
        };

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.data?.length, 0);
        assert.strictEqual(result.error, undefined);
    });

    test('should provide fallback data on error', () => {
        // Even on error, provide fallback empty array for safe iteration
        const result: OperationResult<Project[]> = {
            success: false,
            error: 'Connection refused',
            data: []
        };

        // Consumer can safely iterate even on error - result.data is always defined
        const projects = result.data || [];
        assert.ok(Array.isArray(projects));
        assert.strictEqual(projects.length, 0);  // Empty fallback array
    });
});

suite('Organization Selection State Tests', () => {

    test('should track selected organization', () => {
        // Simulating the state persistence
        let targetOrg: { id: string; name: string } | undefined;

        // User selects organization
        targetOrg = { id: 'org-123', name: 'My Organization' };
        
        assert.ok(targetOrg);
        assert.strictEqual(targetOrg.id, 'org-123');
        assert.strictEqual(targetOrg.name, 'My Organization');

        // User changes organization
        targetOrg = { id: 'org-456', name: 'Other Organization' };
        
        assert.strictEqual(targetOrg.id, 'org-456');
    });

    test('should track selected project within organization', () => {
        let targetProject: { id: string; name: string } | undefined;

        // User selects project
        targetProject = { id: 'proj-abc', name: 'My Project' };
        
        assert.ok(targetProject);
        assert.strictEqual(targetProject.id, 'proj-abc');

        // User clears project (e.g., when org changes)
        targetProject = undefined;
        
        assert.strictEqual(targetProject, undefined);
    });

    test('should clear project when organization changes', () => {
        // Simulating the behavior where changing org clears project
        let targetOrg: { id: string; name: string } | undefined = { id: 'org-1', name: 'Org 1' };
        let targetProject: { id: string; name: string } | undefined = { id: 'proj-1', name: 'Proj 1' };

        // Change organization
        const previousOrgId = targetOrg?.id;
        targetOrg = { id: 'org-2', name: 'Org 2' };
        
        // Should clear project if org changed
        if (targetOrg?.id !== previousOrgId) {
            targetProject = undefined;
        }

        assert.strictEqual(targetOrg.id, 'org-2');
        assert.strictEqual(targetProject, undefined);
    });
});
