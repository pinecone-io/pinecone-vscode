/**
 * Pinecone Service
 * 
 * High-level service providing a unified interface to all Pinecone APIs.
 * Combines Control Plane, Data Plane, Assistant, and Admin APIs into
 * a single, easy-to-use service layer.
 * 
 * For JWT-based authentication (OAuth or service account), this service
 * manages the project context. API requests require a project ID to be set
 * via setProjectId() before making calls that access project-scoped resources.
 * 
 * @example
 * ```typescript
 * const pineconeService = new PineconeService(authService);
 * 
 * // For JWT auth, set the project context first
 * pineconeService.setProjectId('proj-123');
 * 
 * // Now API calls will work
 * const indexes = await pineconeService.listIndexes();
 * ```
 */

import { PineconeClient, ProjectContext } from '../api/client';
import { ControlPlaneApi, IndexConfigureOptions } from '../api/controlPlane';
import { DataPlaneApi } from '../api/dataPlane';
import { AssistantApi } from '../api/assistantApi';
import { AdminApiClient } from '../api/adminApi';
import { NamespaceApi } from '../api/namespaceApi';
import { AuthService } from './authService';
import { ConfigService, TargetOrganization, TargetProject } from './configService';
import { AUTH_CONTEXTS } from '../utils/constants';
import { getErrorMessage } from '../utils/errorHandling';
import { createComponentLogger } from '../utils/logger';

import { IndexModel, AssistantModel, Organization, Project, IndexStats, Metadata, CreateIndexForModelRequest } from '../api/types';

/** Logger for PineconeService operations */
const log = createComponentLogger('PineconeService');

/**
 * Result type for operations that can fail with an error.
 * Used to provide explicit error feedback instead of silent failures.
 */
export interface OperationResult<T> {
    /** Whether the operation succeeded */
    success: boolean;
    /** The data if successful */
    data?: T;
    /** Error message if failed */
    error?: string;
}

/**
 * Unified service for all Pinecone operations.
 * 
 * Provides convenient methods for common operations while also
 * exposing lower-level API clients for advanced use cases.
 * 
 * For JWT authentication (OAuth/service account), you must set the
 * project context using setProjectId() before accessing project-scoped
 * resources like indexes and assistants.
 */
export class PineconeService {
    private client: PineconeClient;
    private controlPlane: ControlPlaneApi;
    private dataPlane: DataPlaneApi;
    private assistantApi: AssistantApi;
    private adminApi: AdminApiClient;
    private namespaceApi: NamespaceApi;
    private configService: ConfigService;

    /**
     * Creates a new PineconeService instance.
     * 
     * @param authService - Authentication service for API requests
     */
    constructor(private authService: AuthService) {
        this.client = new PineconeClient(authService);
        this.controlPlane = new ControlPlaneApi(this.client);
        this.dataPlane = new DataPlaneApi(this.client);
        this.assistantApi = new AssistantApi(this.client, authService);
        this.adminApi = new AdminApiClient();
        this.namespaceApi = new NamespaceApi(this.client);
        this.configService = new ConfigService();
        
        // Restore project context from persisted state
        this.restoreProjectContext();
    }

    /**
     * Restores project context from persisted state.
     * Called on initialization to restore the last selected project.
     */
    private restoreProjectContext(): void {
        const targetProject = this.configService.getTargetProject();
        if (targetProject?.id) {
            this.client.setProjectId(targetProject.id);
        }
    }

    // ========================================================================
    // Project Context Management
    // ========================================================================

    /**
     * Sets the project ID for subsequent API requests.
     * 
     * For JWT-based authentication (OAuth or service account), API requests
     * require the X-Project-Id header. This method sets that project context.
     * 
     * Note: For best results with JWT auth, use setFullProjectContext() which
     * enables managed API key authentication (the same approach the Pinecone CLI uses).
     * 
     * For API key authentication, this has no effect as API keys are already
     * project-scoped.
     * 
     * @param projectId - The project ID to use for requests
     */
    setProjectId(projectId: string | undefined): void {
        this.client.setProjectId(projectId);
    }

    /**
     * Gets the currently set project ID.
     * @returns The current project ID, or undefined if not set
     */
    getProjectId(): string | undefined {
        return this.client.getProjectId();
    }

    /**
     * Sets the full project context for API requests with managed API key authentication.
     * 
     * For JWT-based authentication (OAuth or service account), this is the recommended
     * way to configure project context. It enables the client to use managed API keys
     * for authentication, which is the same approach the Pinecone CLI uses and works
     * reliably for all API operations including backups.
     * 
     * When the full context is set:
     * 1. The client will automatically create/retrieve a managed API key for the project
     * 2. API requests will use Api-Key authentication (+ X-Project-Id header)
     * 3. All control plane and data plane operations will work correctly
     * 
     * @param projectId - The project's unique identifier
     * @param projectName - The project's display name (used for managed key creation)
     * @param organizationId - The organization ID the project belongs to
     */
    setFullProjectContext(projectId: string, projectName: string, organizationId: string): void {
        this.client.setProjectContext({
            id: projectId,
            name: projectName,
            organizationId: organizationId
        });
    }

    /**
     * Clears the full project context.
     * After this, the client will fall back to Bearer token + X-Project-Id auth.
     */
    clearFullProjectContext(): void {
        this.client.setProjectContext(undefined);
    }

    // ========================================================================
    // Index Operations
    // ========================================================================

    /**
     * Lists all indexes in the current project.
     * 
     * @param projectContext - Optional project context for per-request auth (avoids race conditions in concurrent operations)
     * @returns Array of index models
     * @throws {PineconeApiError} When the request fails
     */
    async listIndexes(projectContext?: ProjectContext): Promise<IndexModel[]> {
        return this.controlPlane.listIndexes(projectContext);
    }

    /**
     * Creates a new index.
     * 
     * For indexes without integrated embeddings. Use createIndexForModel()
     * for indexes with integrated embeddings.
     * 
     * @param index - Index configuration
     * @returns The created index model
     * @throws {PineconeApiError} When creation fails
     */
    async createIndex(index: Partial<IndexModel>): Promise<IndexModel> {
        return this.controlPlane.createIndex(index);
    }

    /**
     * Creates a new index with integrated embeddings.
     * 
     * Pinecone automatically converts text to vectors using a hosted
     * embedding model during upsert and query operations.
     * 
     * @param request - Index configuration with embedding model settings
     * @returns The created index model
     * @throws {PineconeApiError} When creation fails
     */
    async createIndexForModel(request: CreateIndexForModelRequest): Promise<IndexModel> {
        return this.controlPlane.createIndexForModel(request);
    }

    /**
     * Deletes an index.
     * 
     * @param name - Name of the index to delete
     * @throws {PineconeApiError} When deletion fails
     */
    async deleteIndex(name: string): Promise<void> {
        return this.controlPlane.deleteIndex(name);
    }

    /**
     * Updates an index's configuration.
     * 
     * @param name - Name of the index to configure
     * @param config - Configuration updates
     * @returns Updated index model
     * @throws {PineconeApiError} When configuration fails
     */
    async configureIndex(name: string, config: IndexConfigureOptions): Promise<IndexModel> {
        return this.controlPlane.configureIndex(name, config);
    }

    /**
     * Gets detailed information about an index.
     * 
     * @param name - Name of the index
     * @returns Index model with full details
     * @throws {PineconeApiError} When the index doesn't exist
     */
    async describeIndex(name: string): Promise<IndexModel> {
        return this.controlPlane.describeIndex(name);
    }

    /**
     * Gets statistics for an index.
     * 
     * @param host - Index host URL
     * @returns Index statistics including vector counts
     * @throws {PineconeApiError} When the request fails
     */
    async describeIndexStats(host: string): Promise<IndexStats> {
        return this.controlPlane.describeIndexStats(host);
    }

    // ========================================================================
    // Assistant Operations
    // ========================================================================

    /**
     * Lists all assistants in the current project.
     * 
     * @param projectContext - Optional project context for per-request auth (avoids race conditions in concurrent operations)
     * @returns Array of assistant models
     * @throws {PineconeApiError} When the request fails
     */
    async listAssistants(projectContext?: ProjectContext): Promise<AssistantModel[]> {
        return this.assistantApi.listAssistants(projectContext);
    }

    /**
     * Creates a new assistant.
     * 
     * @param name - Assistant name
     * @param region - Deployment region ('us' or 'eu')
     * @param instructions - System instructions
     * @param metadata - Optional metadata
     * @param projectContext - Optional project context for per-request auth (required for JWT auth)
     * @returns The created assistant model
     * @throws {PineconeApiError} When creation fails
     */
    async createAssistant(
        name: string, 
        region?: string, 
        instructions?: string, 
        metadata?: Metadata,
        projectContext?: ProjectContext
    ): Promise<AssistantModel> {
        return this.assistantApi.createAssistant(name, region, instructions, metadata, projectContext);
    }

    /**
     * Deletes an assistant.
     * 
     * @param name - Name of the assistant to delete
     * @param projectContext - Optional project context for per-request auth (required for JWT auth)
     * @throws {PineconeApiError} When deletion fails
     */
    async deleteAssistant(name: string, projectContext?: ProjectContext): Promise<void> {
        return this.assistantApi.deleteAssistant(name, projectContext);
    }

    /**
     * Gets detailed information about an assistant.
     * 
     * @param name - Name of the assistant
     * @param projectContext - Optional project context for per-request auth (required for JWT auth)
     * @returns Assistant model with full details
     * @throws {PineconeApiError} When the assistant doesn't exist
     */
    async describeAssistant(name: string, projectContext?: ProjectContext): Promise<AssistantModel> {
        return this.assistantApi.describeAssistant(name, projectContext);
    }

    // ========================================================================
    // Organization & Project Operations (Admin API)
    // ========================================================================

    /**
     * Lists all organizations the user has access to.
     * 
     * Available for OAuth (user_token) and service account authentication.
     * Returns empty result for API key authentication (API keys don't have
     * organization-level access).
     * 
     * Unlike the previous implementation that silently returned empty arrays
     * on error, this method returns an explicit result type with error info.
     * 
     * @returns Operation result containing organizations or error
     */
    async listOrganizations(): Promise<OperationResult<Organization[]>> {
        const authContext = this.authService.getAuthContext();
        
        // API keys don't have organization access - this is expected, not an error
        if (authContext === AUTH_CONTEXTS.API_KEY) {
            return { success: true, data: [] };
        }
        
        try {
            const token = await this.authService.getAccessToken();
            const organizations = await this.adminApi.listOrganizations(token);
            return { success: true, data: organizations };
        } catch (e: unknown) {
            const message = getErrorMessage(e);
            log.error('Failed to list organizations:', e);
            return { 
                success: false, 
                error: message,
                data: []  // Provide empty array as fallback
            };
        }
    }

    /**
     * Lists all projects within an organization.
     * 
     * Available for OAuth (user_token) and service account authentication.
     * Returns empty result for API key authentication.
     * 
     * @param organizationId - Optional organization ID to filter projects
     * @returns Operation result containing projects or error
     */
    async listProjects(organizationId?: string): Promise<OperationResult<Project[]>> {
        const authContext = this.authService.getAuthContext();
        
        // API keys don't have project listing access - expected, not an error
        if (authContext === AUTH_CONTEXTS.API_KEY) {
            return { success: true, data: [] };
        }
        
        try {
            const token = await this.authService.getAccessToken();
            const projects = await this.adminApi.listProjects(token, organizationId);
            return { success: true, data: projects };
        } catch (e: unknown) {
            const message = getErrorMessage(e);
            log.error('Failed to list projects:', e);
            return { 
                success: false, 
                error: message,
                data: []  // Provide empty array as fallback
            };
        }
    }

    // ========================================================================
    // State Persistence (Organization/Project Selection)
    // ========================================================================

    /**
     * Gets the persisted target organization.
     * @returns Target organization or undefined if not set
     */
    getTargetOrganization(): TargetOrganization | undefined {
        return this.configService.getTargetOrganization();
    }

    /**
     * Sets and persists the target organization.
     * When organization changes, the target project is cleared.
     * 
     * @param org - Organization to target, or undefined to clear
     */
    setTargetOrganization(org: TargetOrganization | undefined): void {
        this.configService.setTargetOrganization(org);
        
        // If org changes, project context is cleared by ConfigService
        // Also clear the client's project ID
        if (!org) {
            this.client.setProjectId(undefined);
        }
    }

    /**
     * Gets the persisted target project.
     * @returns Target project or undefined if not set
     */
    getTargetProject(): TargetProject | undefined {
        return this.configService.getTargetProject();
    }

    /**
     * Sets and persists the target project.
     * Also updates the client's project ID for API calls.
     * 
     * @param project - Project to target, or undefined to clear
     */
    setTargetProject(project: TargetProject | undefined): void {
        this.configService.setTargetProject(project);
        this.client.setProjectId(project?.id);
    }

    /**
     * Clears all target context (organization and project).
     * Called when the user logs out.
     */
    clearTargetContext(): void {
        this.configService.clearTargetContext();
        this.client.setProjectId(undefined);
    }

    // ========================================================================
    // API Accessors
    // ========================================================================

    /**
     * Gets the Control Plane API client for advanced index operations.
     * 
     * @returns ControlPlaneApi instance
     */
    getControlPlane(): ControlPlaneApi { 
        return this.controlPlane; 
    }
    
    /**
     * Gets the Data Plane API client for vector operations.
     * 
     * @returns DataPlaneApi instance
     */
    getDataPlane(): DataPlaneApi { 
        return this.dataPlane; 
    }
    
    /**
     * Gets the Assistant API client for assistant operations.
     * 
     * @returns AssistantApi instance
     */
    getAssistantApi(): AssistantApi { 
        return this.assistantApi; 
    }

    /**
     * Gets the Namespace API client for namespace operations.
     * 
     * @returns NamespaceApi instance
     */
    getNamespaceApi(): NamespaceApi {
        return this.namespaceApi;
    }

    /**
     * Gets the Admin API client for project/organization operations.
     * 
     * @returns AdminApiClient instance
     */
    getAdminApi(): AdminApiClient {
        return this.adminApi;
    }
}
