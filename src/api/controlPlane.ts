/**
 * Pinecone Control Plane API Client
 * 
 * Provides methods for managing Pinecone indexes and backups.
 * The Control Plane API handles index lifecycle operations like
 * create, configure, and delete.
 * 
 * @see https://docs.pinecone.io/reference/api/control-plane
 */

import { PineconeClient, ProjectContext } from './client';
import { 
    IndexModel, 
    BackupModel, 
    IndexStats, 
    RestoreJob, 
    CreateRestoreParams, 
    CreateRestoreResponse,
    CreateIndexForModelRequest
} from './types';

/**
 * Configuration options for updating an index.
 */
export interface IndexConfigureOptions {
    /** Enable or disable deletion protection */
    deletion_protection?: 'enabled' | 'disabled';
    /** Update index tags */
    tags?: Record<string, string>;
    /** Pod-specific configuration (replicas, pod type) */
    spec?: {
        pod?: {
            replicas?: number;
            pod_type?: string;
        };
    };
}

/**
 * Client for Pinecone Control Plane API operations.
 * 
 * Handles index and backup management operations. All methods
 * require authentication via the parent PineconeClient.
 * 
 * @example
 * ```typescript
 * const controlPlane = new ControlPlaneApi(client);
 * const indexes = await controlPlane.listIndexes();
 * ```
 */
export class ControlPlaneApi {
    /**
     * Creates a new ControlPlaneApi instance.
     * @param client - Authenticated PineconeClient for making requests
     */
    constructor(private client: PineconeClient) {}

    /**
     * Lists all indexes in the current project.
     * 
     * @param projectContext - Optional project context for per-request auth (avoids race conditions)
     * @returns Array of index models with their current status
     * @throws {PineconeApiError} When the API request fails
     * 
     * @example
     * ```typescript
     * const indexes = await controlPlane.listIndexes();
     * indexes.forEach(idx => console.log(idx.name, idx.status.state));
     * 
     * // With per-request project context (recommended for concurrent operations)
     * const indexes = await controlPlane.listIndexes({ id: 'proj-123', name: 'my-project', organizationId: 'org-456' });
     * ```
     */
    async listIndexes(projectContext?: ProjectContext): Promise<IndexModel[]> {
        const response = await this.client.request<{ indexes: IndexModel[] }>('GET', '/indexes', {
            projectContext
        });
        return response.indexes || [];
    }

    /**
     * Creates a new index with the specified configuration.
     * 
     * Index creation is asynchronous. The returned index will have
     * status.state = 'Initializing' until ready.
     * 
     * For indexes without integrated embeddings, use this method.
     * For indexes with integrated embeddings, use createIndexForModel().
     * 
     * @param index - Index configuration (name, dimension, metric, spec)
     * @returns The created index model
     * @throws {PineconeApiError} When creation fails (e.g., name conflict, invalid config)
     * 
     * @example
     * ```typescript
     * const index = await controlPlane.createIndex({
     *   name: 'my-index',
     *   dimension: 1536,
     *   metric: 'cosine',
     *   spec: { serverless: { cloud: 'aws', region: 'us-east-1' } }
     * });
     * ```
     */
    async createIndex(index: Partial<IndexModel>): Promise<IndexModel> {
        return this.client.request<IndexModel>('POST', '/indexes', { body: index });
    }

    /**
     * Creates a new index with integrated embeddings.
     * 
     * With integrated embeddings, Pinecone automatically converts text to vectors
     * using a hosted embedding model during upsert and query operations.
     * 
     * Index creation is asynchronous. The returned index will have
     * status.state = 'Initializing' until ready.
     * 
     * Available models:
     * - llama-text-embed-v2: Dense, dimensions 384/512/768/1024/2048
     * - multilingual-e5-large: Dense, dimension 1024
     * - pinecone-sparse-english-v0: Sparse (dotproduct only)
     * 
     * @param request - Index configuration with embedding model settings
     * @returns The created index model
     * @throws {PineconeApiError} When creation fails
     * 
     * @see https://docs.pinecone.io/reference/api/2025-10/control-plane/create_for_model
     * 
     * @example
     * ```typescript
     * const index = await controlPlane.createIndexForModel({
     *   name: 'semantic-search',
     *   cloud: 'aws',
     *   region: 'us-east-1',
     *   embed: {
     *     model: 'llama-text-embed-v2',
     *     field_map: { text: 'content' },
     *     dimension: 1024
     *   }
     * });
     * ```
     */
    async createIndexForModel(request: CreateIndexForModelRequest): Promise<IndexModel> {
        return this.client.request<IndexModel>('POST', '/indexes/create-for-model', { body: request });
    }

    /**
     * Gets detailed information about a specific index.
     * 
     * @param name - Name of the index to describe
     * @param projectContext - Optional project context for per-request auth
     * @returns Full index model with status and configuration
     * @throws {PineconeApiError} When the index doesn't exist (404)
     */
    async describeIndex(name: string, projectContext?: ProjectContext): Promise<IndexModel> {
        return this.client.request<IndexModel>('GET', `/indexes/${name}`, { projectContext });
    }

    /**
     * Deletes an index and all its data.
     * 
     * This operation is irreversible. Will fail if deletion_protection
     * is enabled on the index.
     * 
     * @param name - Name of the index to delete
     * @throws {PineconeApiError} When deletion fails (e.g., not found, protected)
     */
    async deleteIndex(name: string): Promise<void> {
        return this.client.request<void>('DELETE', `/indexes/${name}`);
    }

    /**
     * Updates an index's configuration.
     * 
     * Can modify deletion protection, tags, and pod-specific settings
     * like replicas. Not all settings can be changed after creation.
     * 
     * @param name - Name of the index to configure
     * @param config - Configuration updates to apply
     * @returns Updated index model
     * @throws {PineconeApiError} When configuration is invalid
     * 
     * @example
     * ```typescript
     * // Enable deletion protection
     * await controlPlane.configureIndex('my-index', {
     *   deletion_protection: 'enabled'
     * });
     * 
     * // Update tags
     * await controlPlane.configureIndex('my-index', {
     *   tags: { environment: 'production', team: 'ml' }
     * });
     * ```
     */
    async configureIndex(name: string, config: IndexConfigureOptions): Promise<IndexModel> {
        return this.client.request<IndexModel>('PATCH', `/indexes/${name}`, { body: config });
    }

    /**
     * Gets statistics for an index.
     * 
     * Returns vector counts, dimension, and namespace breakdown.
     * 
     * @param host - Index host URL (from IndexModel.host)
     * @returns Index statistics including vector counts per namespace
     * @throws {PineconeApiError} When the request fails
     */
    async describeIndexStats(host: string): Promise<IndexStats> {
        return this.client.request<IndexStats>('POST', '/describe_index_stats', {
            host: `https://${host}`,
            body: {}
        });
    }

    /**
     * Creates a backup of an index.
     * 
     * Backups capture all vectors and metadata at a point in time.
     * Backup creation is asynchronous.
     * 
     * @param indexName - Name of the index to back up
     * @param backupName - Name for the new backup
     * @param projectContext - Optional project context for per-request auth
     * @returns The created backup model (status will be 'Initializing')
     * @throws {PineconeApiError} When backup creation fails
     */
    async createBackup(indexName: string, backupName: string, projectContext?: ProjectContext): Promise<BackupModel> {
        return this.client.request<BackupModel>('POST', `/indexes/${indexName}/backups`, {
            body: { name: backupName },
            projectContext
        });
    }

    /**
     * Lists backups, optionally filtered by source index.
     * 
     * @param indexName - Optional index name to filter by
     * @param projectContext - Optional project context for per-request auth (avoids race conditions)
     * @returns Array of backup models
     * @throws {PineconeApiError} When the request fails
     */
    async listBackups(indexName?: string, projectContext?: ProjectContext): Promise<BackupModel[]> {
        // Two different endpoints:
        // - GET /indexes/{indexName}/backups - list backups for a specific index
        // - GET /backups - list all backups in the project
        // API returns { data: BackupModel[], pagination: {...} }
        if (indexName) {
            const response = await this.client.request<{ data: BackupModel[] }>(
                'GET', 
                `/indexes/${indexName}/backups`,
                { projectContext }
            );
            return response.data || [];
        } else {
            const response = await this.client.request<{ data: BackupModel[] }>('GET', '/backups', { projectContext });
            return response.data || [];
        }
    }

    /**
     * Describes a specific backup.
     * 
     * @param backupId - ID of the backup to describe
     * @param projectContext - Optional project context for per-request auth
     * @returns The backup model with current status
     * @throws {PineconeApiError} When the backup doesn't exist
     */
    async describeBackup(backupId: string, projectContext?: ProjectContext): Promise<BackupModel> {
        return this.client.request<BackupModel>('GET', `/backups/${backupId}`, { projectContext });
    }

    /**
     * Deletes a backup.
     * 
     * This operation is irreversible.
     * 
     * @param backupId - ID of the backup to delete
     * @throws {PineconeApiError} When deletion fails
     */
    async deleteBackup(backupId: string): Promise<void> {
        return this.client.request<void>('DELETE', `/backups/${backupId}`);
    }

    // ========================================================================
    // Restore Job Operations
    // ========================================================================

    /**
     * Creates a new index from a backup (initiates a restore job).
     * 
     * The restore operation is asynchronous. Use the returned restore_job_id
     * to monitor progress via describeRestoreJob().
     * 
     * Note: This only works with serverless index backups. The restored index
     * will inherit the source index's configuration (cloud, region, dimension,
     * metric) but can have a different name, tags, and deletion protection.
     * 
     * @param params - Restore parameters including backup ID and new index name
     * @returns Response containing the new index ID and restore job ID
     * @throws {PineconeApiError} When restore initiation fails
     * 
     * @example
     * ```typescript
     * const response = await controlPlane.createIndexFromBackup({
     *   backup_id: 'backup-abc123',
     *   name: 'restored-index',
     *   deletion_protection: 'enabled',
     *   tags: { restored_from: 'backup-abc123' }
     * });
     * console.log(`Restore job started: ${response.restore_job_id}`);
     * ```
     */
    async createIndexFromBackup(params: CreateRestoreParams): Promise<CreateRestoreResponse> {
        return this.client.request<CreateRestoreResponse>(
            'POST', 
            `/backups/${params.backup_id}/create-index`,
            {
                body: {
                    name: params.name,
                    deletion_protection: params.deletion_protection,
                    tags: params.tags
                }
            }
        );
    }

    /**
     * Lists restore jobs with optional pagination.
     * 
     * @param params - Optional pagination parameters
     * @returns List of restore jobs with pagination info
     * @throws {PineconeApiError} When the request fails
     * 
     * @example
     * ```typescript
     * const jobs = await controlPlane.listRestoreJobs({ limit: 10 });
     * for (const job of jobs.data) {
     *   console.log(`${job.target_index_name}: ${job.status} (${job.percent_complete}%)`);
     * }
     * ```
     */
    async listRestoreJobs(params?: { 
        limit?: number; 
        pagination_token?: string 
    }): Promise<{ data: RestoreJob[]; pagination?: { next?: string } }> {
        const queryParams: Record<string, string> = {};
        if (params?.limit !== undefined) {
            queryParams.limit = params.limit.toString();
        }
        if (params?.pagination_token) {
            queryParams.pagination_token = params.pagination_token;
        }

        return this.client.request<{ data: RestoreJob[]; pagination?: { next?: string } }>(
            'GET', 
            '/restore-jobs',
            { queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined }
        );
    }

    /**
     * Gets detailed information about a specific restore job.
     * 
     * Use this to monitor the progress of a restore operation.
     * 
     * @param restoreJobId - ID of the restore job
     * @returns Restore job with current status and progress
     * @throws {PineconeApiError} When the restore job doesn't exist
     * 
     * @example
     * ```typescript
     * const job = await controlPlane.describeRestoreJob('rj-abc123');
     * if (job.status === 'Completed') {
     *   console.log(`Index ${job.target_index_name} is ready!`);
     * } else {
     *   console.log(`Restore progress: ${job.percent_complete}%`);
     * }
     * ```
     */
    async describeRestoreJob(restoreJobId: string): Promise<RestoreJob> {
        return this.client.request<RestoreJob>('GET', `/restore-jobs/${restoreJobId}`);
    }
}
