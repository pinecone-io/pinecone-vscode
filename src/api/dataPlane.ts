/**
 * Pinecone Data Plane API Client
 * 
 * Provides methods for querying vectors in Pinecone indexes.
 * Data plane operations run against the index's dedicated host URL.
 * 
 * Supports two query modes:
 * 1. Vector query: For standard indexes using the /query endpoint
 * 2. Text search: For integrated embedding indexes using the /records/search endpoint
 * 
 * @see https://docs.pinecone.io/reference/api/data-plane
 */

import { PineconeClient, ProjectContext } from './client';
import { QueryResponse } from './types';

/**
 * Parameters for a vector similarity query.
 * Used with standard indexes (no integrated embeddings).
 */
export interface QueryParams {
    /** Number of results to return (1-10000) */
    top_k: number;
    /** Query vector (required if id not provided) */
    vector?: number[];
    /** ID of an existing vector to use as the query (alternative to vector) */
    id?: string;
    /** Namespace to query (defaults to '' if not specified) */
    namespace?: string;
    /** Metadata filter to narrow results */
    filter?: Record<string, unknown>;
    /** Include vector values in results */
    include_values?: boolean;
    /** Include metadata in results */
    include_metadata?: boolean;
    /** Sparse vector for hybrid search */
    sparse_vector?: { 
        indices: number[]; 
        values: number[]; 
    };
}

/**
 * Parameters for a text-based search.
 * Used with indexes that have integrated embeddings.
 * 
 * The search uses the /records/namespaces/{namespace}/search endpoint, which
 * automatically embeds the text query using the index's configured model.
 * 
 * IMPORTANT: This endpoint has a different parameter structure than the /query endpoint.
 * - Does NOT support `include_values` or `include_metadata` (those are for /query only)
 * - Returns document fields directly in `result.hits[].fields`
 * - Use the `fields` parameter to specify which fields to include in results
 * 
 * @see https://docs.pinecone.io/reference/api/2025-10/data-plane/search_records
 */
export interface SearchParams {
    /** 
     * The search query configuration.
     * For text search, use `inputs.text`. For vector search, use `vector.values`.
     */
    query: {
        /** Text input to embed and search (for integrated embedding indexes) */
        inputs?: {
            /** The text to search for */
            text: string;
        };
        /** Direct vector values for search (alternative to text input) */
        vector?: {
            /** Vector values for similarity search */
            values: number[];
        };
        /** Number of results to return */
        top_k: number;
        /** Metadata filter to narrow results */
        filter?: Record<string, unknown>;
    };
    /** 
     * Namespace to search. Use '__default__' for the default namespace.
     * As of API version 2025-04, empty string is no longer supported.
     * The search method handles this automatically - you can pass empty string
     * and it will be converted to '__default__'.
     */
    namespace: string;
    /** 
     * Fields to return from the document. If not specified, all fields are returned.
     * This serves a similar purpose to `include_metadata` in the vector query API,
     * but for integrated embedding indexes, document fields are returned directly
     * in `result.hits[].fields` rather than in a separate metadata object.
     * 
     * Note: Unlike the /query endpoint, there is no `include_values` option.
     * The search endpoint focuses on document retrieval, not raw vector values.
     */
    fields?: string[];
    /** 
     * Optional reranking configuration to improve result relevance.
     * @see https://docs.pinecone.io/guides/search/rerank-results
     */
    rerank?: {
        /** The reranking model to use (e.g., 'bge-reranker-v2-m3') */
        model: string;
        /** Fields to consider for reranking */
        rank_fields: string[];
        /** Number of top results to return after reranking (defaults to top_k) */
        top_n?: number;
        /** Optional query override for reranking */
        query?: string;
    };
}

/**
 * Response from a text-based search.
 */
export interface SearchResponse {
    /** Array of matching records */
    result: {
        /** Scored records with document data */
        hits: Array<{
            /** Record ID */
            _id: string;
            /** Similarity score */
            _score: number;
            /** Document fields (the original text and any additional fields) */
            fields: Record<string, unknown>;
        }>;
    };
    /** Resource usage information */
    usage?: {
        /** Number of read units consumed */
        read_units: number;
        /** Embed units used for the query */
        embed_total_tokens?: number;
    };
}

/**
 * Client for Pinecone Data Plane API operations.
 * 
 * Handles vector queries and other data operations. Requests are
 * sent directly to the index host rather than the control plane.
 * 
 * @example
 * ```typescript
 * const dataPlane = new DataPlaneApi(client);
 * const results = await dataPlane.query('my-index-abc123.svc.us-east-1.pinecone.io', {
 *   vector: [0.1, 0.2, 0.3],
 *   topK: 10,
 *   includeMetadata: true
 * });
 * ```
 */
export class DataPlaneApi {
    /**
     * Creates a new DataPlaneApi instance.
     * @param client - Authenticated PineconeClient for making requests
     */
    constructor(private client: PineconeClient) {}

    /**
     * Queries an index for similar vectors.
     * 
     * Performs approximate nearest neighbor search using the specified
     * query vector or by looking up an existing vector by ID.
     * 
     * Note: For indexes with integrated embeddings, use search() instead.
     * 
     * @param host - Index host URL (from IndexModel.host, without https://)
     * @param params - Query parameters including vector, topK, filters
     * @returns Query response with matched vectors and scores
     * @throws {PineconeApiError} When the query fails
     * 
     * @example
     * ```typescript
     * // Query by vector
     * const results = await dataPlane.query(index.host, {
     *   vector: [0.1, 0.2, 0.3],
     *   top_k: 10,
     *   include_metadata: true,
     *   filter: { category: { '$eq': 'electronics' } }
     * });
     * 
     * // Query by existing vector ID
     * const similar = await dataPlane.query(index.host, {
     *   id: 'vec-123',
     *   top_k: 5
     * });
     * ```
     */
    async query(
        host: string, 
        params: QueryParams,
        projectContext?: ProjectContext
    ): Promise<QueryResponse> {
        return this.client.request<QueryResponse>('POST', '/query', {
            host: `https://${host}`,
            body: params,
            projectContext
        });
    }

    /**
     * Searches an index using text (for indexes with integrated embeddings).
     * 
     * The index automatically converts the text query to a vector using
     * its configured embedding model, then performs similarity search.
     * 
     * This method should only be used with indexes that have the `embed`
     * configuration set. For standard indexes, use query() instead.
     * 
     * The endpoint is /records/namespaces/{namespace}/search where namespace
     * is required. Use '__default__' for the default namespace (as of API 2025-04,
     * empty string is no longer supported).
     * 
     * IMPORTANT: The request body structure differs from /query:
     * - `query` contains `top_k`, `inputs`/`vector`, and `filter`
     * - `fields` and `rerank` are at the top level
     * - NO `include_values` or `include_metadata` parameters
     * 
     * @param host - Index host URL (from IndexModel.host, without https://)
     * @param params - Search parameters including text query and options
     * @returns Search response with matching documents
     * @throws {PineconeApiError} When the search fails
     * 
     * @see https://docs.pinecone.io/reference/api/2025-10/data-plane/search_records
     * 
     * @example
     * ```typescript
     * // Text-based semantic search
     * const results = await dataPlane.search(index.host, {
     *   query: {
     *     inputs: { text: 'What are the main features of the product?' },
     *     top_k: 10,
     *     filter: { category: { '$eq': 'documentation' } }
     *   },
     *   namespace: '',  // Use default namespace
     *   fields: ['title', 'url']
     * });
     * ```
     */
    async search(
        host: string, 
        params: SearchParams,
        projectContext?: ProjectContext
    ): Promise<SearchResponse> {
        // Endpoint requires namespace in the path
        // IMPORTANT: As of API Version 2025-04, empty string is no longer valid for default namespace
        // Use '__default__' to refer to the default namespace
        const namespaceValue = params.namespace || '__default__';
        const namespace = encodeURIComponent(namespaceValue);
        
        // Build the request body according to SearchRecordsRequest schema:
        // - query (required): contains top_k, inputs/vector, filter
        // - fields (optional): which document fields to return
        // - rerank (optional): reranking configuration
        // Note: namespace is NOT in the body - it's in the URL path
        const body: Record<string, unknown> = {
            query: params.query
        };
        
        // Add optional top-level fields
        if (params.fields) {
            body.fields = params.fields;
        }
        if (params.rerank) {
            body.rerank = params.rerank;
        }
        
        return this.client.request<SearchResponse>('POST', `/records/namespaces/${namespace}/search`, {
            host: `https://${host}`,
            body,
            projectContext
        });
    }
}
