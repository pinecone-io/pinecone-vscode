/**
 * Centralized Mock Classes for Testing
 * 
 * This module provides reusable mock implementations of all major services
 * and API clients. Using centralized mocks ensures consistency across tests
 * and reduces code duplication.
 * 
 * Pattern inspired by the Pinecone CLI testing approach:
 * - Mock classes track method calls for assertions
 * - Configurable return values and errors
 * - Type-safe interfaces matching real implementations
 * 
 * @module test/mocks
 */

import {
    IndexModel,
    AssistantModel,
    FileModel,
    BackupModel,
    RestoreJob,
    Organization,
    Project,
    ChatResponse,
    NamespaceDescription,
    ListNamespacesResponse,
    CreateIndexForModelRequest,
    CreateRestoreParams,
    IndexStats,
    ServerlessSpec,
    PodSpec,
    APIKeyWithSecret,
    StreamChunk
} from '../../api/types';
import { ProjectContext } from '../../api/client';

// ============================================================================
// Generic Mock Request Tracker
// ============================================================================

/**
 * Records a method call with its arguments for later assertion.
 */
export interface MockCall {
    method: string;
    args: unknown[];
    timestamp: Date;
}

/**
 * Base class for mock services that tracks all method calls.
 * Provides common functionality for recording calls and configuring responses.
 */
export abstract class MockBase {
    /** All calls made to this mock */
    public calls: MockCall[] = [];
    
    /** Error to throw on next call (null = don't throw) */
    public errorToThrow: Error | null = null;

    /**
     * Records a method call.
     * @param method - Name of the method called
     * @param args - Arguments passed to the method
     */
    protected recordCall(method: string, ...args: unknown[]): void {
        this.calls.push({ method, args, timestamp: new Date() });
    }

    /**
     * Gets all calls to a specific method.
     * @param method - Method name to filter by
     */
    public getCallsTo(method: string): MockCall[] {
        return this.calls.filter(c => c.method === method);
    }

    /**
     * Gets the last call to a specific method.
     * @param method - Method name to filter by
     */
    public getLastCallTo(method: string): MockCall | undefined {
        const calls = this.getCallsTo(method);
        return calls.length > 0 ? calls[calls.length - 1] : undefined;
    }

    /**
     * Checks if a method was called.
     * @param method - Method name to check
     */
    public wasCalled(method: string): boolean {
        return this.getCallsTo(method).length > 0;
    }

    /**
     * Resets all recorded calls and error state.
     */
    public reset(): void {
        this.calls = [];
        this.errorToThrow = null;
    }

    /**
     * Throws configured error if set.
     */
    protected maybeThrow(): void {
        if (this.errorToThrow) {
            throw this.errorToThrow;
        }
    }
}

// ============================================================================
// Mock PineconeService
// ============================================================================

/**
 * Mock implementation of PineconeService for testing command handlers.
 * 
 * Tracks all API calls and allows configuration of return values.
 * Use this to test commands without making real API calls.
 * 
 * @example
 * ```typescript
 * const mockService = new MockPineconeService();
 * mockService.listIndexesResult = [{ name: 'test-index', ... }];
 * 
 * const commands = new IndexCommands(mockService, ...);
 * await commands.createIndex();
 * 
 * assert.ok(mockService.wasCalled('createIndex'));
 * ```
 */
export class MockPineconeService extends MockBase {
    // ========== Configurable Results ==========
    public listIndexesResult: IndexModel[] = [];
    public listAssistantsResult: AssistantModel[] = [];
    public createIndexResult: IndexModel | null = null;
    public createAssistantResult: AssistantModel | null = null;
    public describeIndexStatsResult: IndexStats = {
        totalVectorCount: 0,
        dimension: 0,
        indexFullness: 0,
        namespaces: {}
    };

    // ========== Project Context ==========
    private _projectId: string | undefined;
    private _projectContext: ProjectContext | undefined;

    setProjectId(projectId: string | undefined): void {
        this.recordCall('setProjectId', projectId);
        this._projectId = projectId;
    }

    getProjectId(): string | undefined {
        return this._projectId;
    }

    setFullProjectContext(projectId: string, projectName: string, organizationId: string): void {
        this.recordCall('setFullProjectContext', projectId, projectName, organizationId);
        this._projectId = projectId;
        this._projectContext = { id: projectId, name: projectName, organizationId };
    }

    // ========== Index Operations ==========
    async listIndexes(projectContext?: ProjectContext): Promise<IndexModel[]> {
        this.recordCall('listIndexes', projectContext);
        this.maybeThrow();
        return this.listIndexesResult;
    }

    async createIndex(config: Partial<IndexModel>): Promise<IndexModel> {
        this.recordCall('createIndex', config);
        this.maybeThrow();
        return this.createIndexResult || { name: config.name || 'test', ...config } as IndexModel;
    }

    async createIndexForModel(request: CreateIndexForModelRequest): Promise<IndexModel> {
        this.recordCall('createIndexForModel', request);
        this.maybeThrow();
        return this.createIndexResult || {
            name: request.name,
            dimension: 1024,
            metric: request.embed.metric || 'cosine',
            host: `${request.name}.svc.pinecone.io`,
            status: { ready: false, state: 'Initializing' },
            spec: { serverless: { cloud: request.cloud, region: request.region } },
            deletion_protection: request.deletion_protection || 'disabled'
        } as IndexModel;
    }

    async deleteIndex(name: string): Promise<void> {
        this.recordCall('deleteIndex', name);
        this.maybeThrow();
    }

    async configureIndex(name: string, config: Record<string, unknown>): Promise<IndexModel> {
        this.recordCall('configureIndex', name, config);
        this.maybeThrow();
        return { name } as IndexModel;
    }

    async describeIndexStats(host: string): Promise<IndexStats> {
        this.recordCall('describeIndexStats', host);
        this.maybeThrow();
        return this.describeIndexStatsResult;
    }

    // ========== Assistant Operations ==========
    async listAssistants(projectContext?: ProjectContext): Promise<AssistantModel[]> {
        this.recordCall('listAssistants', projectContext);
        this.maybeThrow();
        return this.listAssistantsResult;
    }

    async createAssistant(
        name: string, 
        region: string, 
        instructions?: string,
        metadata?: Record<string, unknown>,
        projectContext?: ProjectContext
    ): Promise<AssistantModel> {
        this.recordCall('createAssistant', name, region, instructions, metadata, projectContext);
        this.maybeThrow();
        return this.createAssistantResult || {
            name,
            status: 'Initializing',
            host: `${name}.assistant.pinecone.io`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        } as AssistantModel;
    }

    async deleteAssistant(name: string, projectContext?: ProjectContext): Promise<void> {
        this.recordCall('deleteAssistant', name, projectContext);
        this.maybeThrow();
    }

    // ========== API Accessors (return mock sub-clients) ==========
    private _mockControlPlane = new MockControlPlaneApi();
    private _mockAssistantApi = new MockAssistantApi();

    getControlPlane(): MockControlPlaneApi {
        return this._mockControlPlane;
    }

    getAssistantApi(): MockAssistantApi {
        return this._mockAssistantApi;
    }

    /**
     * Sets the mock control plane instance for testing.
     */
    setMockControlPlane(mock: MockControlPlaneApi): void {
        this._mockControlPlane = mock;
    }

    /**
     * Sets the mock assistant API instance for testing.
     */
    setMockAssistantApi(mock: MockAssistantApi): void {
        this._mockAssistantApi = mock;
    }
}

// ============================================================================
// Mock ControlPlaneApi
// ============================================================================

/**
 * Mock implementation of ControlPlaneApi for testing backup/restore operations.
 */
export class MockControlPlaneApi extends MockBase {
    // ========== Configurable Results ==========
    public listBackupsResult: BackupModel[] = [];
    public createBackupResult: BackupModel | null = null;
    public describeBackupResult: BackupModel | null = null;
    public describeIndexResult: IndexModel | null = null;
    public listRestoreJobsResult: { data: RestoreJob[]; pagination?: { next?: string } } = { data: [] };
    public createIndexFromBackupResult: { index_id: string; restore_job_id: string } = {
        index_id: 'idx-new',
        restore_job_id: 'rj-123'
    };

    /** Sequence of backup statuses for polling tests */
    public backupStatusSequence: string[] = [];
    private _backupStatusIndex = 0;

    /** Sequence of index states for polling tests */
    public indexStateSequence: string[] = [];
    private _indexStateIndex = 0;

    // ========== Index Operations ==========
    async listIndexes(projectContext?: ProjectContext): Promise<IndexModel[]> {
        this.recordCall('listIndexes', projectContext);
        this.maybeThrow();
        return [];
    }

    async describeIndex(name: string, projectContext?: ProjectContext): Promise<IndexModel> {
        this.recordCall('describeIndex', name, projectContext);
        this.maybeThrow();
        
        // Support state sequence for polling tests
        let state = 'Ready';
        if (this.indexStateSequence.length > 0) {
            state = this.indexStateSequence[this._indexStateIndex] || 'Ready';
            if (this._indexStateIndex < this.indexStateSequence.length - 1) {
                this._indexStateIndex++;
            }
        }
        
        return this.describeIndexResult || {
            name,
            dimension: 1536,
            metric: 'cosine',
            host: `${name}.svc.pinecone.io`,
            status: { ready: state === 'Ready', state },
            spec: { serverless: { cloud: 'aws', region: 'us-east-1' } },
            deletion_protection: 'disabled'
        } as IndexModel;
    }

    // ========== Backup Operations ==========
    async listBackups(indexName?: string, projectContext?: ProjectContext): Promise<BackupModel[]> {
        this.recordCall('listBackups', indexName, projectContext);
        this.maybeThrow();
        return this.listBackupsResult;
    }

    async createBackup(indexName: string, backupName: string, projectContext?: ProjectContext): Promise<BackupModel> {
        this.recordCall('createBackup', indexName, backupName, projectContext);
        this.maybeThrow();
        return this.createBackupResult || {
            backup_id: `backup-${Date.now()}`,
            name: backupName,
            source_index_name: indexName,
            source_index_id: 'idx-123',
            status: 'Initializing',
            cloud: 'aws',
            region: 'us-east-1',
            created_at: new Date().toISOString(),
            dimension: 1536,
            metric: 'cosine',
            record_count: 0,
            namespace_count: 1,
            size_bytes: 0
        };
    }

    async describeBackup(backupId: string, projectContext?: ProjectContext): Promise<BackupModel> {
        this.recordCall('describeBackup', backupId, projectContext);
        this.maybeThrow();
        
        // Support status sequence for polling tests
        let status = 'Ready';
        if (this.backupStatusSequence.length > 0) {
            status = this.backupStatusSequence[this._backupStatusIndex] || 'Ready';
            if (this._backupStatusIndex < this.backupStatusSequence.length - 1) {
                this._backupStatusIndex++;
            }
        }
        
        return this.describeBackupResult || {
            backup_id: backupId,
            name: 'test-backup',
            source_index_name: 'test-index',
            source_index_id: 'idx-123',
            status: status as 'Initializing' | 'Ready' | 'Failed',
            cloud: 'aws',
            region: 'us-east-1',
            created_at: new Date().toISOString(),
            dimension: 1536,
            metric: 'cosine',
            record_count: 1000,
            namespace_count: 1,
            size_bytes: 1024
        };
    }

    async deleteBackup(backupId: string, projectContext?: ProjectContext): Promise<void> {
        this.recordCall('deleteBackup', backupId, projectContext);
        this.maybeThrow();
    }

    async createIndexFromBackup(params: CreateRestoreParams): Promise<{ index_id: string; restore_job_id: string }> {
        this.recordCall('createIndexFromBackup', params);
        this.maybeThrow();
        return this.createIndexFromBackupResult;
    }

    // ========== Restore Job Operations ==========
    async listRestoreJobs(params?: { limit?: number; pagination_token?: string }): Promise<{ data: RestoreJob[]; pagination?: { next?: string } }> {
        this.recordCall('listRestoreJobs', params);
        this.maybeThrow();
        return this.listRestoreJobsResult;
    }

    async describeRestoreJob(restoreJobId: string): Promise<RestoreJob> {
        this.recordCall('describeRestoreJob', restoreJobId);
        this.maybeThrow();
        return {
            restore_job_id: restoreJobId,
            backup_id: 'backup-123',
            target_index_name: 'restored-index',
            target_index_id: 'idx-restored',
            status: 'InProgress',
            created_at: new Date().toISOString(),
            percent_complete: 50
        };
    }

    /**
     * Resets the status sequence indices for polling tests.
     */
    resetSequences(): void {
        this._backupStatusIndex = 0;
        this._indexStateIndex = 0;
    }
}

// ============================================================================
// Mock AssistantApi
// ============================================================================

/**
 * Mock implementation of AssistantApi for testing assistant and file operations.
 */
export class MockAssistantApi extends MockBase {
    // ========== Configurable Results ==========
    public listFilesResult: FileModel[] = [];
    public chatResult: ChatResponse | null = null;
    public uploadFileResult: FileModel | null = null;

    // ========== File Operations ==========
    async listFiles(host: string, assistantName: string, projectContext?: ProjectContext): Promise<FileModel[]> {
        this.recordCall('listFiles', host, assistantName, projectContext);
        this.maybeThrow();
        return this.listFilesResult;
    }

    async uploadFile(
        host: string, 
        assistantName: string, 
        filePath: string,
        metadata?: Record<string, unknown>,
        multimodal?: boolean,
        projectContext?: ProjectContext
    ): Promise<FileModel> {
        this.recordCall('uploadFile', host, assistantName, filePath, metadata, multimodal, projectContext);
        this.maybeThrow();
        return this.uploadFileResult || {
            id: `file-${Date.now()}`,
            name: filePath.split('/').pop() || 'uploaded-file',
            status: 'Processing',
            percent_done: 0,
            created_on: new Date().toISOString(),
            updated_on: new Date().toISOString(),
            size: 1024,
            multimodal: false
        };
    }

    async deleteFile(host: string, assistantName: string, fileId: string, projectContext?: ProjectContext): Promise<void> {
        this.recordCall('deleteFile', host, assistantName, fileId, projectContext);
        this.maybeThrow();
    }

    // ========== Chat Operations ==========
    async chat(
        host: string,
        assistantName: string,
        messages: Array<{ role: string; content: string }>,
        options?: Record<string, unknown>,
        projectContext?: ProjectContext
    ): Promise<ChatResponse> {
        this.recordCall('chat', host, assistantName, messages, options, projectContext);
        this.maybeThrow();
        return this.chatResult || {
            id: `chat-${Date.now()}`,
            model: 'gpt-4o',
            message: { role: 'assistant', content: 'Mock response' },
            finish_reason: 'stop',
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
            citations: []
        };
    }

    /**
     * Mock streaming chat - calls callbacks synchronously for testing.
     */
    chatStream(
        host: string,
        assistantName: string,
        messages: Array<{ role: string; content: string }>,
        options: {
            onChunk: (chunk: StreamChunk) => void;
            onError: (error: Error) => void;
            onComplete: () => void;
            projectContext?: ProjectContext;
            [key: string]: unknown;
        }
    ): { abort: () => void } {
        this.recordCall('chatStream', host, assistantName, messages, options);
        
        // Simulate streaming chunks
        setTimeout(() => {
            if (this.errorToThrow) {
                options.onError(this.errorToThrow);
                return;
            }
            
            options.onChunk({
                type: 'message_start',
                model: 'gpt-4o',
                role: 'assistant'
            });
            
            options.onChunk({
                type: 'content_chunk',
                id: 'chunk-1',
                model: 'gpt-4o',
                delta: { content: 'Mock streaming response' }
            });
            
            options.onChunk({
                type: 'message_end',
                id: 'msg-1',
                model: 'gpt-4o',
                usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
            });
            
            options.onComplete();
        }, 0);
        
        return { abort: () => { /* no-op */ } };
    }
}

// ============================================================================
// Mock AdminApi
// ============================================================================

/**
 * Mock implementation of AdminApiClient for testing organization/project operations.
 */
export class MockAdminApi extends MockBase {
    // ========== Configurable Results ==========
    public listOrganizationsResult: Organization[] = [];
    public listProjectsResult: Project[] = [];
    public createProjectResult: Project | null = null;
    public createAPIKeyResult: APIKeyWithSecret | null = null;

    async listOrganizations(): Promise<Organization[]> {
        this.recordCall('listOrganizations');
        this.maybeThrow();
        return this.listOrganizationsResult;
    }

    async listProjects(organizationId?: string): Promise<Project[]> {
        this.recordCall('listProjects', organizationId);
        this.maybeThrow();
        return this.listProjectsResult;
    }

    async createProject(organizationId: string, params: { name: string }): Promise<Project> {
        this.recordCall('createProject', organizationId, params);
        this.maybeThrow();
        return this.createProjectResult || {
            id: `proj-${Date.now()}`,
            name: params.name,
            organization_id: organizationId,
            created_at: new Date().toISOString()
        };
    }

    async deleteProject(projectId: string): Promise<void> {
        this.recordCall('deleteProject', projectId);
        this.maybeThrow();
    }

    async createAPIKey(
        accessToken: string,
        projectId: string,
        params: { name: string; roles: string[] }
    ): Promise<APIKeyWithSecret> {
        this.recordCall('createAPIKey', accessToken, projectId, params);
        this.maybeThrow();
        return this.createAPIKeyResult || {
            key: {
                id: `key-${Date.now()}`,
                name: params.name,
                created_at: new Date().toISOString(),
                project_id: projectId,
                organization_id: 'org-123',
                roles: params.roles
            },
            value: 'pcsk_mock_api_key_value'
        };
    }
}

// ============================================================================
// Mock NamespaceApi
// ============================================================================

/**
 * Mock implementation of NamespaceApi for testing namespace operations.
 */
export class MockNamespaceApi extends MockBase {
    // ========== Configurable Results ==========
    public listNamespacesResult: ListNamespacesResponse = { namespaces: [], total_count: 0 };
    public describeNamespaceResult: NamespaceDescription | null = null;

    async listNamespaces(host: string, params?: { limit?: number }, projectContext?: ProjectContext): Promise<ListNamespacesResponse> {
        this.recordCall('listNamespaces', host, params, projectContext);
        this.maybeThrow();
        return this.listNamespacesResult;
    }

    async createNamespace(
        host: string,
        params: { name: string; schema?: Record<string, { filterable: boolean }> },
        projectContext?: ProjectContext
    ): Promise<NamespaceDescription> {
        this.recordCall('createNamespace', host, params, projectContext);
        this.maybeThrow();
        return {
            name: params.name,
            record_count: 0,
            schema: params.schema
        };
    }

    async describeNamespace(
        host: string, 
        namespace: string,
        projectContext?: ProjectContext
    ): Promise<NamespaceDescription> {
        this.recordCall('describeNamespace', host, namespace, projectContext);
        this.maybeThrow();
        return this.describeNamespaceResult || {
            name: namespace,
            record_count: 0
        };
    }

    async deleteNamespace(
        host: string, 
        namespace: string,
        projectContext?: ProjectContext
    ): Promise<void> {
        this.recordCall('deleteNamespace', host, namespace, projectContext);
        this.maybeThrow();
    }
}

// ============================================================================
// Mock AuthService
// ============================================================================

/**
 * Mock implementation of AuthService for testing authentication flows.
 */
export class MockAuthService extends MockBase {
    // ========== Configurable State ==========
    public isAuthenticatedResult = false;
    public authContextResult = '';
    public accessTokenResult = 'mock-access-token';
    public managedKeyResult = 'mock-managed-key';

    isAuthenticated(): boolean {
        this.recordCall('isAuthenticated');
        return this.isAuthenticatedResult;
    }

    getAuthContext(): string {
        this.recordCall('getAuthContext');
        return this.authContextResult;
    }

    async getAccessToken(): Promise<string> {
        this.recordCall('getAccessToken');
        this.maybeThrow();
        return this.accessTokenResult;
    }

    async getOrCreateManagedKey(projectId: string, projectName: string, organizationId: string): Promise<string> {
        this.recordCall('getOrCreateManagedKey', projectId, projectName, organizationId);
        this.maybeThrow();
        return this.managedKeyResult;
    }

    async login(): Promise<void> {
        this.recordCall('login');
        this.maybeThrow();
    }

    async logout(): Promise<void> {
        this.recordCall('logout');
        this.maybeThrow();
    }
}

// ============================================================================
// Test Fixtures Factory
// ============================================================================

/**
 * Factory for creating test fixtures with realistic data.
 */
export const TestFixtures = {
    /**
     * Creates a mock serverless index.
     */
    createIndex(overrides?: Partial<IndexModel>): IndexModel {
        return {
            name: 'test-index',
            dimension: 1536,
            metric: 'cosine',
            host: 'test-index.svc.us-east-1.pinecone.io',
            status: { ready: true, state: 'Ready' },
            spec: { serverless: { cloud: 'aws', region: 'us-east-1' } } as ServerlessSpec,
            deletion_protection: 'disabled',
            ...overrides
        };
    },

    /**
     * Creates a mock pod index.
     */
    createPodIndex(overrides?: Partial<IndexModel>): IndexModel {
        return {
            name: 'pod-index',
            dimension: 768,
            metric: 'cosine',
            host: 'pod-index.svc.pinecone.io',
            status: { ready: true, state: 'Ready' },
            spec: {
                pod: {
                    environment: 'us-west1-gcp',
                    pod_type: 'p1.x1',
                    pods: 1,
                    replicas: 1,
                    shards: 1
                }
            } as PodSpec,
            deletion_protection: 'disabled',
            ...overrides
        };
    },

    /**
     * Creates a mock assistant.
     */
    createAssistant(overrides?: Partial<AssistantModel>): AssistantModel {
        return {
            name: 'test-assistant',
            status: 'Ready',
            host: 'test-assistant.assistant.pinecone.io',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...overrides
        };
    },

    /**
     * Creates a mock backup.
     */
    createBackup(overrides?: Partial<BackupModel>): BackupModel {
        return {
            backup_id: 'backup-123',
            name: 'test-backup',
            source_index_name: 'test-index',
            source_index_id: 'idx-123',
            status: 'Ready',
            cloud: 'aws',
            region: 'us-east-1',
            created_at: new Date().toISOString(),
            dimension: 1536,
            metric: 'cosine',
            record_count: 1000,
            namespace_count: 1,
            size_bytes: 1024000,
            ...overrides
        };
    },

    /**
     * Creates a mock file.
     */
    createFile(overrides?: Partial<FileModel>): FileModel {
        return {
            id: 'file-123',
            name: 'document.pdf',
            status: 'Available',
            percent_done: 100,
            created_on: new Date().toISOString(),
            updated_on: new Date().toISOString(),
            size: 1024,
            multimodal: false,
            ...overrides
        };
    },

    /**
     * Creates a mock organization.
     */
    createOrganization(overrides?: Partial<Organization>): Organization {
        return {
            id: 'org-123',
            name: 'Test Organization',
            ...overrides
        };
    },

    /**
     * Creates a mock project.
     */
    createProject(overrides?: Partial<Project>): Project {
        return {
            id: 'proj-123',
            name: 'Test Project',
            organization_id: 'org-123',
            created_at: new Date().toISOString(),
            ...overrides
        };
    },

    /**
     * Creates a mock restore job.
     */
    createRestoreJob(overrides?: Partial<RestoreJob>): RestoreJob {
        return {
            restore_job_id: 'rj-123',
            backup_id: 'backup-123',
            target_index_name: 'restored-index',
            target_index_id: 'idx-restored',
            status: 'Completed',
            created_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            percent_complete: 100,
            ...overrides
        };
    }
};
