/**
 * Pinecone API Type Definitions
 * 
 * This module contains TypeScript interfaces for all Pinecone API models
 * used throughout the extension. These types mirror the Pinecone REST API
 * response schemas.
 * 
 * @see https://docs.pinecone.io/reference/api/introduction
 */

import { EmbeddingModelName as EmbeddingModelNameType } from '../utils/constants';

// Re-export EmbeddingModelName from constants where it's defined
// alongside the model configuration
export type EmbeddingModelName = EmbeddingModelNameType;

/**
 * Generic metadata type for user-defined key-value pairs.
 * Used for vector metadata, assistant metadata, and file metadata.
 */
export type Metadata = Record<string, string | number | boolean | string[] | number[]>;

/**
 * Supported read capacity modes for serverless indexes.
 */
export type ReadCapacityMode = 'OnDemand' | 'Dedicated';

/**
 * Supported dedicated read node types.
 */
export type DedicatedReadNodeType = 'b1' | 't1';

/**
 * Manual scaling values for dedicated read nodes.
 */
export interface DedicatedReadCapacityManualConfig {
    replicas: number;
    shards: number;
}

/**
 * Dedicated read capacity configuration.
 */
export interface DedicatedReadCapacityConfig {
    node_type: DedicatedReadNodeType;
    /**
     * Pinecone control plane currently supports manual DRN scaling in this extension.
     */
    scaling: 'Manual';
    manual: DedicatedReadCapacityManualConfig;
}

/**
 * Serverless read capacity configuration.
 */
export interface ServerlessReadCapacity {
    mode: ReadCapacityMode;
    dedicated?: DedicatedReadCapacityConfig;
}

/**
 * Runtime status for index read capacity.
 */
export interface ReadCapacityStatus {
    mode?: ReadCapacityMode;
    /** Runtime state string (for newer control-plane responses) */
    state?: string;
    /** Runtime status string (for compatibility with older responses) */
    status?: string;
    /** Runtime dedicated block (for newer control-plane responses) */
    dedicated?: {
        current_replicas?: number;
        current_shards?: number;
    };
    /** Flat runtime fields retained for compatibility with older responses */
    current_replicas?: number;
    current_shards?: number;
}

/**
 * Represents a Pinecone vector index.
 * 
 * An index is a collection of vectors that can be queried for similarity search.
 * Indexes can be either serverless (auto-scaling) or pod-based (dedicated resources).
 * 
 * Indexes may optionally have integrated embeddings, where Pinecone automatically
 * converts text to vectors using a hosted embedding model.
 * 
 * @see https://docs.pinecone.io/guides/indexes/understanding-indexes
 */
export interface IndexModel {
    /** Unique name of the index (lowercase alphanumeric and hyphens only) */
    name: string;
    /** Dimensionality of vectors stored in the index */
    dimension: number;
    /** Distance metric used for similarity calculations */
    metric: 'cosine' | 'dotproduct' | 'euclidean';
    /** Host URL for data plane operations (queries, upserts) */
    host: string;
    /** Current status of the index */
    status: {
        /** Whether the index is ready to accept requests */
        ready: boolean;
        /** Current operational state */
        state: 'Initializing' | 'ScalingUp' | 'ScalingDown' | 'Terminating' | 'Ready';
        /** Runtime read capacity status (when available) */
        read_capacity?: ReadCapacityStatus;
    };
    /** Index specification (serverless or pod configuration) */
    spec: ServerlessSpec | PodSpec;
    /** Whether deletion protection is enabled */
    deletion_protection: 'enabled' | 'disabled';
    /** Optional user-defined tags for organization */
    tags?: Record<string, string>;
    /** 
     * Vector type: 'dense' for standard vectors, 'sparse' for sparse vectors.
     * Sparse indexes only support dotproduct metric and don't require a dimension.
     */
    vector_type?: 'dense' | 'sparse';
    /**
     * Integrated embedding configuration (if the index uses hosted embeddings).
     * When present, the index automatically converts text to vectors during upsert and query.
     * @see https://docs.pinecone.io/guides/index-data/create-an-index#integrated-embedding
     */
    embed?: IndexEmbedConfig;
}

/**
 * Configuration for an index with integrated embeddings.
 * 
 * When an index has integrated embeddings, Pinecone automatically converts
 * text to vectors using a hosted embedding model during upsert and query operations.
 * 
 * @see https://docs.pinecone.io/guides/index-data/create-an-index#integrated-embedding
 */
export interface IndexEmbedConfig {
    /** Name of the embedding model (e.g., 'llama-text-embed-v2', 'multilingual-e5-large') */
    model: string;
    /** Distance metric for similarity search (auto-selected based on model if not specified) */
    metric?: 'cosine' | 'dotproduct' | 'euclidean';
    /** Vector dimension (determined by model and optional dimension parameter) */
    dimension?: number;
    /** Vector type ('dense' or 'sparse' based on the model) */
    vector_type?: 'dense' | 'sparse';
    /** Maps document fields to embedding inputs */
    field_map: {
        /** The text field in your document to embed */
        text: string;
    };
    /** Parameters used when querying/searching the index */
    read_parameters?: {
        input_type?: string;
        truncate?: 'END' | 'NONE';
    };
    /** Parameters used when indexing/upserting documents */
    write_parameters?: {
        input_type?: string;
        truncate?: 'END' | 'NONE';
    };
}

/**
 * Request parameters for creating an index with integrated embeddings.
 * Uses the /indexes/create-for-model endpoint.
 * 
 * @see https://docs.pinecone.io/reference/api/2025-10/control-plane/create_for_model
 */
export interface CreateIndexForModelRequest {
    /** Index name (1-45 chars, lowercase alphanumeric and hyphens) */
    name: string;
    /** Cloud provider */
    cloud: 'aws' | 'gcp' | 'azure';
    /** Cloud region */
    region: string;
    /** Deletion protection setting */
    deletion_protection?: 'enabled' | 'disabled';
    /** Optional tags */
    tags?: Record<string, string>;
    /** Embedding configuration */
    embed: {
        /** Embedding model name */
        model: EmbeddingModelName;
        /** Distance metric (defaults based on model) */
        metric?: 'cosine' | 'dotproduct' | 'euclidean';
        /** Field mapping for text field */
        field_map: {
            text: string;
        };
        /** Optional: override default dimension for models that support it */
        dimension?: number;
        /** Read parameters for query operations */
        read_parameters?: {
            input_type?: string;
            truncate?: 'END' | 'NONE';
        };
        /** Write parameters for upsert operations */
        write_parameters?: {
            input_type?: string;
            truncate?: 'END' | 'NONE';
        };
    };
}

// Note: EmbeddingModelName and EmbeddingModelConfig are defined in utils/constants.ts
// to keep configuration-related types together with their values.
// EmbeddingModelName is re-exported from this module for convenience.

/**
 * Configuration for a serverless index.
 * 
 * Serverless indexes automatically scale based on usage and don't require
 * manual capacity planning.
 */
export interface ServerlessSpec {
    serverless: {
        /** Cloud provider hosting the index */
        cloud: 'aws' | 'gcp' | 'azure';
        /** Cloud region (e.g., 'us-east-1', 'eu-west-1') */
        region: string;
        /** Read capacity mode/configuration for serverless indexes */
        read_capacity?: ServerlessReadCapacity;
    };
}

/**
 * Configuration for a pod-based index.
 * 
 * Pod indexes run on dedicated compute resources with fixed capacity.
 * Suitable for predictable workloads requiring consistent performance.
 * 
 * **Note:** This type is retained for read-only compatibility with existing
 * pod-based indexes. This extension does not support creating pod indexes;
 * only serverless indexes can be created. Existing pod indexes support
 * limited operations (Query and Delete only).
 * 
 * @deprecated For new indexes, use ServerlessSpec instead.
 */
export interface PodSpec {
    pod: {
        /** Pinecone environment (e.g., 'us-west1-gcp') */
        environment: string;
        /** Pod type determining compute resources (e.g., 'p1.x1', 's1.x1') */
        pod_type: string;
        /** Number of pods */
        pods: number;
        /** Number of replicas for high availability */
        replicas: number;
        /** Number of shards for horizontal scaling */
        shards: number;
    };
}

/**
 * Represents a backup of a Pinecone index.
 * 
 * Backups capture the complete state of an index and can be used
 * to restore data or create new indexes.
 * 
 * Field names match the Pinecone API response format (e.g., `backup_id` not `id`).
 * @see https://docs.pinecone.io/reference/api/2025-10/control-plane/list_index_backups
 */
export interface BackupModel {
    /** Unique backup identifier (API returns as 'backup_id') */
    backup_id: string;
    /** User-defined backup name */
    name: string;
    /** Optional description */
    description?: string;
    /** Name of the source index */
    source_index_name: string;
    /** ID of the source index */
    source_index_id: string;
    /** Current backup status */
    status: 'Initializing' | 'Ready' | 'Failed';
    /** Cloud provider where the backup is stored */
    cloud: string;
    /** Cloud region where the backup is stored */
    region: string;
    /** ISO 8601 timestamp of backup creation */
    created_at: string;
    /** Dimension of vectors in the backup */
    dimension: number;
    /** Distance metric used by the source index */
    metric: string;
    /** Total number of vectors in the backup */
    record_count: number;
    /** Number of namespaces in the backup */
    namespace_count: number;
    /** Size of the backup in bytes */
    size_bytes: number;
}

/**
 * Response from a vector query operation.
 * 
 * Contains matching vectors ranked by similarity score.
 */
export interface QueryResponse {
    /** Array of matching vectors with scores */
    matches: Array<{
        /** Vector ID */
        id: string;
        /** Similarity score (higher is more similar for cosine/dotproduct) */
        score: number;
        /** Vector values (if include_values was true) */
        values?: number[];
        /** Associated metadata (if include_metadata was true) */
        metadata?: Metadata;
        /** Sparse vector values for hybrid search */
        sparse_values?: {
            indices: number[];
            values: number[];
        };
    }>;
    /** Namespace the query was executed against */
    namespace: string;
    /** Resource usage information */
    usage?: {
        /** Number of read units consumed */
        read_units: number;
    };
}

// ============================================================================
// Vector/Data Operations Types
// ============================================================================

/**
 * Dense/sparse vector record stored in an index.
 */
export interface VectorRecord {
    /** Unique vector identifier */
    id: string;
    /** Dense vector values */
    values?: number[];
    /** Optional sparse values for hybrid search */
    sparse_values?: {
        indices: number[];
        values: number[];
    };
    /** Optional metadata payload */
    metadata?: Metadata;
}

/**
 * Request payload for upserting vectors.
 */
export interface UpsertVectorsRequest {
    vectors: VectorRecord[];
    namespace?: string;
}

/**
 * Response payload for upsert operations.
 */
export interface UpsertVectorsResponse {
    upsertedCount?: number;
    upserted_count?: number;
}

/**
 * Request payload for upserting text records to integrated embedding indexes.
 */
export interface UpsertRecordsRequest {
    records: Array<Record<string, unknown>>;
}

/**
 * Response payload for upserting text records.
 */
export interface UpsertRecordsResponse {
    upsertedCount?: number;
    upserted_count?: number;
}

/**
 * Response payload for fetching vectors by ID.
 */
export interface FetchVectorsResponse {
    namespace?: string;
    vectors: Record<string, VectorRecord>;
    usage?: {
        read_units?: number;
    };
}

/**
 * Request payload for fetching vectors by metadata.
 */
export interface FetchVectorsByMetadataRequest {
    filter: Record<string, unknown>;
    namespace?: string;
    limit?: number;
    include_values?: boolean;
    include_metadata?: boolean;
}

/**
 * Response payload for fetching vectors by metadata.
 */
export interface FetchVectorsByMetadataResponse {
    namespace?: string;
    vectors?: VectorRecord[];
    records?: VectorRecord[];
    usage?: {
        read_units?: number;
    };
}

/**
 * Request payload for updating one vector.
 */
export interface UpdateVectorRequest {
    id: string;
    values?: number[];
    sparse_values?: {
        indices: number[];
        values: number[];
    };
    set_metadata?: Record<string, unknown>;
    namespace?: string;
}

/**
 * Request payload for updating vectors by metadata filter.
 */
export interface UpdateVectorsByMetadataRequest {
    namespace?: string;
    filter: Record<string, unknown>;
    set_metadata?: Record<string, unknown>;
    dry_run?: boolean;
}

/**
 * Response payload for update-by-metadata operations.
 */
export interface UpdateVectorsByMetadataResponse {
    matched_count?: number;
    updated_count?: number;
    dry_run?: boolean;
}

/**
 * Request payload for deleting vectors.
 */
export interface DeleteVectorsRequest {
    ids?: string[];
    filter?: Record<string, unknown>;
    delete_all?: boolean;
    namespace?: string;
}

/**
 * Response payload for listing vector IDs.
 */
export interface ListVectorIdsResponse {
    vectors?: Array<{ id: string }>;
    ids?: string[];
    pagination?: {
        next?: string;
    };
}

/**
 * Request payload for starting an import.
 */
export interface StartImportRequest {
    uri: string;
    integration_id?: string;
    mode?: 'continue' | 'overwrite';
    error_mode?: 'continue' | 'abort';
    namespace?: string;
}

/**
 * Represents a data import job.
 */
export interface ImportJob {
    id: string;
    status: string;
    created_at?: string;
    updated_at?: string;
    namespace?: string;
    uri?: string;
    [key: string]: unknown;
}

/**
 * Response payload when starting an import.
 */
export interface StartImportResponse {
    id: string;
    status?: string;
}

/**
 * Response payload for listing import jobs.
 */
export interface ListImportsResponse {
    data: ImportJob[];
    pagination?: {
        next?: string;
    };
}

// ============================================================================
// Inference Types
// ============================================================================

/**
 * Request payload for embedding generation.
 */
export interface EmbedRequest {
    model: string;
    inputs: Array<Record<string, unknown>>;
    parameters?: Record<string, unknown>;
}

/**
 * Response payload for embedding generation.
 */
export interface EmbedResponse {
    model?: string;
    data: Array<{
        index?: number;
        values?: number[];
        sparse_values?: {
            indices: number[];
            values: number[];
        };
    }>;
    usage?: Record<string, unknown>;
}

/**
 * Request payload for reranking.
 */
export interface RerankRequest {
    model: string;
    query: string;
    documents: Array<Record<string, unknown>>;
    top_n?: number;
    return_documents?: boolean;
    parameters?: Record<string, unknown>;
}

/**
 * Response payload for reranking.
 */
export interface RerankResponse {
    data?: Array<{
        index: number;
        score: number;
        document?: string | Record<string, unknown>;
    }>;
    results?: Array<{
        index: number;
        score: number;
        document?: string | Record<string, unknown>;
    }>;
    usage?: Record<string, unknown>;
}

/**
 * Represents an inference model.
 */
export interface InferenceModel {
    name: string;
    model?: string;
    id?: string;
    type?: string;
    provider?: string;
    [key: string]: unknown;
}

/**
 * Response payload for listing inference models.
 */
export interface ListInferenceModelsResponse {
    data?: InferenceModel[];
    models?: InferenceModel[];
}

/**
 * Represents a Pinecone Assistant.
 * 
 * Assistants provide RAG (Retrieval-Augmented Generation) capabilities
 * over uploaded documents.
 * 
 * @see https://docs.pinecone.io/guides/assistant/understanding-assistant
 */
export interface AssistantModel {
    /** Unique assistant name */
    name: string;
    /** System instructions for the assistant's behavior */
    instructions?: string;
    /** User-defined metadata */
    metadata?: Metadata;
    /** Current operational status */
    status: 'Initializing' | 'Ready' | 'Terminating' | 'Failed';
    /** Host URL for assistant API operations */
    host: string;
    /** ISO 8601 creation timestamp */
    created_at: string;
    /** ISO 8601 last update timestamp */
    updated_at: string;
}

/**
 * Request payload for updating an Assistant.
 */
export interface UpdateAssistantRequest {
    instructions?: string;
    metadata?: Metadata;
}

/**
 * Represents a file uploaded to an Assistant.
 * 
 * Files are processed and indexed for retrieval during chat.
 */
export interface FileModel {
    /** Unique file identifier */
    id: string;
    /** Original filename */
    name: string;
    /** Processing status */
    status: 'Processing' | 'Available' | 'ProcessingFailed';
    /** Processing progress (0-100) */
    percent_done: number;
    /** ISO 8601 creation timestamp */
    created_on: string;
    /** ISO 8601 last update timestamp */
    updated_on: string;
    /** User-defined metadata */
    metadata?: Metadata;
    /** File size in bytes */
    size: number;
    /** Error message if processing failed */
    error_message?: string;
    /** Whether the file contains images/multimodal content */
    multimodal: boolean;
    /** Temporary signed URL for download (if requested) */
    signed_url?: string;
}

/**
 * Response from an Assistant chat completion.
 * 
 * Contains the assistant's response with citations to source documents.
 */
export interface ChatResponse {
    /** Unique response identifier */
    id: string;
    /** Model used for generation */
    model: string;
    /** The assistant's message */
    message: {
        role: 'assistant';
        /** Response content */
        content: string;
    };
    /** Reason for completion */
    finish_reason: 'stop' | 'length';
    /** Token usage statistics */
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    /** Citations linking response to source documents */
    citations: Citation[];
}

/**
 * Citation linking assistant response to source files.
 * 
 * Citations indicate which parts of uploaded files were used
 * to generate the response.
 */
export interface Citation {
    /** Character position in the response where citation applies */
    position: number;
    /** References to source documents */
    references: Array<{
        /** The source file */
        file: FileModel;
        /** Relevant page numbers (for PDFs) */
        pages?: number[];
        /** Highlighted text from the source */
        highlight?: {
            type: 'text';
            content: string;
        };
    }>;
}

/**
 * Request payload for assistant context retrieval.
 */
export interface AssistantContextRequest {
    query: string;
    top_k?: number;
    filter?: Record<string, unknown>;
}

/**
 * Response payload for assistant context retrieval.
 */
export interface AssistantContextResponse {
    context?: Array<{
        text?: string;
        score?: number;
        [key: string]: unknown;
    }>;
    [key: string]: unknown;
}

/**
 * Request payload for assistant answer evaluation.
 */
export interface AssistantEvaluationRequest {
    question: string;
    answer: string;
    ground_truth_answer: string;
}

/**
 * Response payload for assistant answer evaluation.
 */
export interface AssistantEvaluationResponse {
    score?: number;
    metrics?: Record<string, number>;
    feedback?: string;
    [key: string]: unknown;
}

/**
 * Represents a Pinecone organization.
 * 
 * Organizations are the top-level entity containing projects.
 * Users can belong to multiple organizations. Each organization
 * has its own billing, members, and projects.
 * 
 * @see https://docs.pinecone.io/guides/organizations/understanding-organizations
 */
export interface Organization {
    /** Unique organization identifier */
    id: string;
    /** Organization display name */
    name: string;
    /** ISO 8601 creation timestamp */
    created_at?: string;
    /** Current payment status (e.g., 'active', 'past_due') */
    payment_status?: string;
    /** Subscription plan (e.g., 'free', 'starter', 'standard', 'enterprise') */
    plan?: string;
    /** Support tier (e.g., 'basic', 'premium') */
    support_tier?: string;
}

/**
 * Represents a Pinecone project.
 * 
 * Projects organize indexes and other resources within an organization.
 * Only accessible via service account or user token authentication.
 */
export interface Project {
    /** Unique project identifier */
    id: string;
    /** Project name */
    name: string;
    /** Organization ID this project belongs to */
    organization_id?: string;
    /** Default environment for the project (deprecated, use serverless config) */
    environment?: string;
    /** Whether CMEK encryption is enforced for this project */
    force_encryption_with_cmek?: boolean;
    /** ISO 8601 creation timestamp */
    created_at: string;
}

/**
 * Parameters for creating a new project.
 */
export interface CreateProjectParams {
    /** Name for the new project */
    name: string;
    /** 
     * Whether to enforce CMEK encryption for all indexes in this project.
     * WARNING: This setting is irreversible once enabled.
     */
    force_encryption_with_cmek?: boolean;
}

/**
 * Parameters for updating a project.
 */
export interface UpdateProjectParams {
    /** Updated project name */
    name: string;
}

/**
 * Statistics for a Pinecone index.
 * 
 * Provides information about the index's current state and resource usage.
 */
export interface IndexStats {
    /** Total number of vectors in the index */
    totalVectorCount: number;
    /** Vector dimension */
    dimension: number;
    /** Index fullness percentage (0-1) */
    indexFullness: number;
    /** Statistics broken down by namespace */
    namespaces: Record<string, {
        vectorCount: number;
    }>;
}

// ============================================================================
// Namespace Types
// ============================================================================

/**
 * Defines a filterable metadata field in a namespace schema.
 * 
 * When a field is marked as filterable, it can be used in query filters
 * for efficient vector retrieval.
 */
export interface MetadataSchemaField {
    /** Whether this field can be used in query filters */
    filterable: boolean;
}

/**
 * Schema defining metadata fields and their properties for a namespace.
 * 
 * Maps field names to their configuration (currently just filterability).
 * 
 * @example
 * ```typescript
 * const schema: MetadataSchema = {
 *   category: { filterable: true },
 *   author: { filterable: true }
 * };
 * ```
 */
export type MetadataSchema = Record<string, MetadataSchemaField>;

/**
 * Describes a namespace within a Pinecone index.
 * 
 * Namespaces partition vector data within an index, allowing for
 * logical separation of data while sharing the same index configuration.
 * 
 * @see https://docs.pinecone.io/guides/indexes/understanding-namespaces
 */
export interface NamespaceDescription {
    /** Namespace name (empty string for the default namespace) */
    name: string;
    /** Number of vectors in this namespace */
    record_count: number;
    /** Optional metadata schema for filterable fields */
    schema?: MetadataSchema;
    /** Fields that have been indexed for filtering */
    indexed_fields?: Record<string, unknown>;
}

/**
 * Response from listing namespaces in an index.
 */
export interface ListNamespacesResponse {
    /** Array of namespace descriptions */
    namespaces: NamespaceDescription[];
    /** Total count of namespaces in the index */
    total_count: number;
    /** Pagination information */
    pagination?: {
        /** Token to fetch the next page of results */
        next?: string;
    };
}

/**
 * Parameters for creating a new namespace.
 */
export interface CreateNamespaceParams {
    /** Name for the new namespace */
    name: string;
    /** Optional metadata schema defining filterable fields */
    schema?: MetadataSchema;
}

// ============================================================================
// Restore Job Types
// ============================================================================

/**
 * Represents an asynchronous restore job for restoring an index from backup.
 * 
 * Restore jobs track the progress of creating a new index from a backup.
 * The job runs asynchronously and can be monitored via the describe endpoint.
 */
export interface RestoreJob {
    /** Unique identifier for the restore job */
    restore_job_id: string;
    /** ID of the source backup being restored */
    backup_id: string;
    /** Name of the new index being created */
    target_index_name: string;
    /** ID of the new index being created */
    target_index_id: string;
    /** Current status of the restore operation */
    status: 'InProgress' | 'Completed' | 'Failed';
    /** ISO 8601 timestamp when the job was created */
    created_at: string;
    /** ISO 8601 timestamp when the job completed (if completed) */
    completed_at?: string;
    /** Percentage of restore completion (0-100) */
    percent_complete: number;
}

/**
 * Parameters for creating a new index from a backup.
 */
export interface CreateRestoreParams {
    /** ID of the backup to restore from */
    backup_id: string;
    /** Name for the new index (must be unique) */
    name: string;
    /** Whether to enable deletion protection on the new index */
    deletion_protection?: 'enabled' | 'disabled';
    /** Optional tags to apply to the new index */
    tags?: Record<string, string>;
}

/**
 * Response from initiating a restore job.
 */
export interface CreateRestoreResponse {
    /** ID of the newly created index */
    index_id: string;
    /** ID of the restore job (use for monitoring progress) */
    restore_job_id: string;
}

// ============================================================================
// Streaming Chat Types
// ============================================================================

/**
 * Initial chunk sent when a streaming chat response begins.
 */
export interface StreamMessageStart {
    /** Chunk type identifier */
    type: 'message_start';
    /** Model being used for generation */
    model: string;
    /** Role of the message (always 'assistant' for responses) */
    role: string;
}

/**
 * Content delta chunk containing incremental response text.
 */
export interface StreamContentDelta {
    /** Chunk type identifier */
    type: 'content_chunk';
    /** Response ID */
    id: string;
    /** Model being used */
    model: string;
    /** Incremental content */
    delta: {
        /** Text content to append to the response */
        content: string;
    };
}

/**
 * Citation chunk linking response text to source documents.
 */
export interface StreamCitation {
    /** Chunk type identifier */
    type: 'citation';
    /** Response ID */
    id: string;
    /** Model being used */
    model: string;
    /** Citation information */
    citation: Citation;
}

/**
 * Final chunk sent when streaming completes.
 */
export interface StreamMessageEnd {
    /** Chunk type identifier */
    type: 'message_end';
    /** Model used for generation */
    model: string;
    /** Response ID */
    id: string;
    /** Token usage statistics */
    usage: {
        /** Tokens used for the prompt */
        prompt_tokens: number;
        /** Tokens generated in the response */
        completion_tokens: number;
        /** Total tokens used */
        total_tokens: number;
    };
}

/**
 * Union type for all streaming chat chunk types.
 */
export type StreamChunk = StreamMessageStart | StreamContentDelta | StreamCitation | StreamMessageEnd;

// ============================================================================
// API Key Types
// ============================================================================

/**
 * Represents a Pinecone API key.
 * 
 * API keys are project-scoped credentials used for data plane operations.
 * They provide an alternative to OAuth/JWT authentication.
 * 
 * @see https://docs.pinecone.io/guides/getting-started/authentication#api-keys
 */
export interface APIKey {
    /** Unique identifier for the key */
    id: string;
    /** Display name of the key */
    name: string;
    /** When the key was created */
    created_at: string;
    /** Project the key belongs to */
    project_id: string;
    /** Organization the key belongs to */
    organization_id: string;
    /** Roles assigned to the key (e.g., 'ProjectEditor') */
    roles?: string[];
}

/**
 * API key with the secret value included.
 * Only returned when creating a new key - the value is not retrievable later.
 */
export interface APIKeyWithSecret {
    /** The API key metadata */
    key: APIKey;
    /** The actual API key value (only available at creation time) */
    value: string;
}
