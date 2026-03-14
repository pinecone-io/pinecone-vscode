/**
 * Pinecone Namespace API Client
 * 
 * Provides methods for managing namespaces within Pinecone indexes.
 * Namespaces partition vector data within an index, enabling logical
 * separation while sharing the same index configuration.
 * 
 * All namespace operations are performed against the index's data plane host,
 * not the control plane API.
 * 
 * @see https://docs.pinecone.io/guides/indexes/understanding-namespaces
 */

import { PineconeClient, ProjectContext } from './client';
import { 
    NamespaceDescription, 
    ListNamespacesResponse, 
    CreateNamespaceParams 
} from './types';
import { normalizeHost } from './host';

/**
 * Parameters for listing namespaces with pagination and filtering.
 */
export interface ListNamespacesParams {
    /** Maximum number of namespaces to return (default: 100) */
    limit?: number;
    /** Filter namespaces by name prefix */
    prefix?: string;
    /** Token for fetching the next page of results */
    pagination_token?: string;
}

/**
 * Client for Pinecone Namespace API operations.
 * 
 * Handles namespace CRUD operations within an index. All requests are
 * sent to the index's data plane host URL.
 * 
 * @example
 * ```typescript
 * const namespaceApi = new NamespaceApi(client);
 * 
 * // List namespaces
 * const namespaces = await namespaceApi.listNamespaces(index.host);
 * 
 * // Create a namespace with schema
 * await namespaceApi.createNamespace(index.host, {
 *   name: 'documents',
 *   schema: { category: { filterable: true } }
 * });
 * ```
 */
export class NamespaceApi {
    /**
     * Creates a new NamespaceApi instance.
     * @param client - Authenticated PineconeClient for making requests
     */
    constructor(private client: PineconeClient) {}

    /**
     * Lists all namespaces in an index.
     * 
     * Supports pagination and prefix filtering for large indexes.
     * 
     * @param host - Index host URL (from IndexModel.host, without https://)
     * @param params - Optional pagination and filtering parameters
     * @returns List of namespace descriptions with pagination info
     * @throws {PineconeApiError} When the request fails
     * 
     * @example
     * ```typescript
     * // List all namespaces
     * const response = await namespaceApi.listNamespaces(index.host);
     * response.namespaces.forEach(ns => {
     *   console.log(`${ns.name}: ${ns.record_count} vectors`);
     * });
     * 
     * // List with pagination
     * const page1 = await namespaceApi.listNamespaces(index.host, { limit: 10 });
     * if (page1.pagination?.next) {
     *   const page2 = await namespaceApi.listNamespaces(index.host, {
     *     pagination_token: page1.pagination.next
     *   });
     * }
     * ```
     */
    async listNamespaces(
        host: string, 
        params?: ListNamespacesParams,
        projectContext?: ProjectContext
    ): Promise<ListNamespacesResponse> {
        const queryParams: Record<string, string> = {};
        
        if (params?.limit !== undefined) {
            queryParams.limit = params.limit.toString();
        }
        if (params?.prefix) {
            queryParams.prefix = params.prefix;
        }
        if (params?.pagination_token) {
            queryParams.pagination_token = params.pagination_token;
        }

        return this.client.request<ListNamespacesResponse>('GET', '/namespaces', {
            host: normalizeHost(host),
            queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
            projectContext
        });
    }

    /**
     * Creates a new namespace in an index.
     * 
     * Namespaces can optionally define a metadata schema specifying
     * which fields should be indexed for filtering.
     * 
     * @param host - Index host URL (from IndexModel.host, without https://)
     * @param params - Namespace name and optional schema
     * @returns The created namespace description
     * @throws {PineconeApiError} When creation fails (e.g., name conflict)
     * 
     * @example
     * ```typescript
     * // Create a simple namespace
     * const ns = await namespaceApi.createNamespace(index.host, {
     *   name: 'documents'
     * });
     * 
     * // Create with filterable metadata schema
     * const ns = await namespaceApi.createNamespace(index.host, {
     *   name: 'products',
     *   schema: {
     *     category: { filterable: true },
     *     brand: { filterable: true }
     *   }
     * });
     * ```
     */
    async createNamespace(
        host: string, 
        params: CreateNamespaceParams,
        projectContext?: ProjectContext
    ): Promise<NamespaceDescription> {
        return this.client.request<NamespaceDescription>('POST', '/namespaces', {
            host: normalizeHost(host),
            body: params,
            projectContext
        });
    }

    /**
     * Gets detailed information about a specific namespace.
     * 
     * Use `__default__` as the namespace name to describe the default namespace.
     * 
     * @param host - Index host URL (from IndexModel.host, without https://)
     * @param namespaceName - Name of the namespace (use '__default__' for default)
     * @returns Namespace description with record count and schema
     * @throws {PineconeApiError} When the namespace doesn't exist (404)
     * 
     * @example
     * ```typescript
     * // Describe a named namespace
     * const ns = await namespaceApi.describeNamespace(index.host, 'documents');
     * console.log(`Vectors: ${ns.record_count}`);
     * 
     * // Describe the default namespace
     * const defaultNs = await namespaceApi.describeNamespace(index.host, '__default__');
     * ```
     */
    async describeNamespace(
        host: string, 
        namespaceName: string,
        projectContext?: ProjectContext
    ): Promise<NamespaceDescription> {
        // URL-encode the namespace name to handle special characters
        const encodedName = encodeURIComponent(namespaceName);
        return this.client.request<NamespaceDescription>(
            'GET', 
            `/namespaces/${encodedName}`,
            { host: normalizeHost(host), projectContext }
        );
    }

    /**
     * Deletes a namespace and all its vectors from an index.
     * 
     * This operation is irreversible. Use `__default__` as the namespace
     * name to delete the default namespace.
     * 
     * @param host - Index host URL (from IndexModel.host, without https://)
     * @param namespaceName - Name of the namespace to delete
     * @throws {PineconeApiError} When deletion fails (e.g., namespace not found)
     * 
     * @example
     * ```typescript
     * // Delete a namespace
     * await namespaceApi.deleteNamespace(index.host, 'old-data');
     * 
     * // Delete the default namespace
     * await namespaceApi.deleteNamespace(index.host, '__default__');
     * ```
     */
    async deleteNamespace(
        host: string, 
        namespaceName: string,
        projectContext?: ProjectContext
    ): Promise<void> {
        // URL-encode the namespace name to handle special characters
        const encodedName = encodeURIComponent(namespaceName);
        return this.client.request<void>(
            'DELETE', 
            `/namespaces/${encodedName}`,
            { host: normalizeHost(host), projectContext }
        );
    }
}
