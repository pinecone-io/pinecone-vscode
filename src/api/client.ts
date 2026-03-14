/**
 * Pinecone API Client
 * 
 * This module provides a generic HTTP client for making authenticated requests
 * to Pinecone APIs (Control Plane, Data Plane, and Assistant APIs).
 */

import * as vscode from 'vscode';
import nodeFetch, { RequestInit, Response } from 'node-fetch';
import FormData from 'form-data';
import { AuthService } from '../services/authService';
import { getApiBaseUrl, API_VERSION, AUTH_CONTEXTS } from '../utils/constants';
import { createComponentLogger } from '../utils/logger';

/** Logger for API client operations */
const log = createComponentLogger('Client');

/**
 * Type definition for the fetch function.
 * This allows dependency injection for testing.
 */
export type FetchFunction = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Error thrown when a Pinecone API request fails.
 * 
 * Contains the HTTP status code and error message from the API response.
 * The `message` property contains the full formatted error including status code.
 * The `apiMessage` property contains just the raw message from the API.
 * 
 * @example
 * ```typescript
 * try {
 *   await client.request('GET', '/indexes/my-index');
 * } catch (error) {
 *   if (error instanceof PineconeApiError) {
 *     console.log(`API Error ${error.status}: ${error.message}`);
 *     console.log(`Raw API message: ${error.apiMessage}`);
 *   }
 * }
 * ```
 */
export class PineconeApiError extends Error {
    /** The raw error message from the API response (without status code prefix) */
    public readonly apiMessage: string;

    /**
     * Creates a new PineconeApiError.
     * @param status - HTTP status code from the failed request
     * @param apiMessage - Error message from the API response body
     */
    constructor(public readonly status: number, apiMessage: string) {
        super(`Pinecone API Error ${status}: ${apiMessage}`);
        this.name = 'PineconeApiError';
        this.apiMessage = apiMessage;
    }
}

/** Default timeout for API requests in milliseconds */
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Options for API requests.
 */
export interface RequestOptions {
    /** Request body (JSON object or FormData for file uploads) */
    body?: unknown;
    /** Override the base URL (used for data plane requests to index hosts) */
    host?: string;
    /** Additional headers to include */
    headers?: Record<string, string>;
    /** Query parameters to append to the URL */
    queryParams?: Record<string, string | string[]>;
    /** Request timeout in milliseconds (default: 30000) */
    timeout?: number;
    /** 
     * Per-request project ID (overrides shared state).
     * Use this for concurrent operations to avoid race conditions.
     */
    projectId?: string;
    /**
     * Per-request full project context (overrides shared state).
     * Use this for concurrent operations that need managed API key auth.
     */
    projectContext?: ProjectContext;
}

/**
 * Generic HTTP client for Pinecone API requests.
 * 
 * Handles authentication, request signing, and error handling for all
 * Pinecone API endpoints. Supports both JSON and multipart/form-data requests.
 * 
 * For JWT-based authentication (OAuth or service account), the client
 * automatically includes the X-Project-Id header when a project is set.
 * This header is required for the Pinecone API to identify which project
 * context to use for the request.
 * 
 * @example
 * ```typescript
 * const client = new PineconeClient(authService);
 * 
 * // Set the project context for subsequent requests
 * client.setProjectId('proj-123');
 * 
 * // Requests now include X-Project-Id header
 * const indexes = await client.request<{indexes: IndexModel[]}>('GET', '/indexes');
 * ```
 */
/**
 * Project context for API requests.
 * Required for JWT authentication to identify which project's resources to access.
 */
export interface ProjectContext {
    /** Unique project identifier */
    id: string;
    /** Project name (used for managed key creation) */
    name: string;
    /** Organization ID the project belongs to */
    organizationId: string;
}

export class PineconeClient {
    private fetchFn: FetchFunction;
    
    /**
     * Current project ID for X-Project-Id header.
     * Required for JWT authentication (OAuth/service account).
     * Not needed for API key auth (API keys are already project-scoped).
     */
    private _projectId: string | undefined;

    /**
     * Full project context for managed API key creation.
     * When set, the client will use managed API keys instead of Bearer tokens
     * for JWT authentication (similar to how the Pinecone CLI works).
     */
    private _projectContext: ProjectContext | undefined;

    /**
     * Creates a new PineconeClient.
     * @param authService - Authentication service for obtaining access tokens
     * @param fetchFn - Optional fetch function for dependency injection (defaults to node-fetch)
     */
    constructor(
        private authService: AuthService,
        fetchFn?: FetchFunction
    ) {
        this.fetchFn = fetchFn ?? nodeFetch;
    }

    /**
     * Sets the project ID for subsequent API requests.
     * 
     * For JWT-based authentication (OAuth or service account), API requests
     * require the X-Project-Id header. This method sets that project context.
     * 
     * Note: For full managed API key support (recommended for JWT auth), use
     * setProjectContext() instead which provides all necessary context for
     * creating managed API keys.
     * 
     * @param projectId - The project ID to use, or undefined to clear
     */
    setProjectId(projectId: string | undefined): void {
        this._projectId = projectId;
        // Clear project context if ID is cleared
        if (!projectId) {
            this._projectContext = undefined;
        }
    }

    /**
     * Gets the currently set project ID.
     * @returns The current project ID, or undefined if not set
     */
    getProjectId(): string | undefined {
        return this._projectId;
    }

    /**
     * Sets the full project context for managed API key authentication.
     * 
     * For JWT authentication (OAuth/service account), the Pinecone API works best
     * with managed API keys rather than Bearer tokens. This method sets the full
     * project context needed to create/retrieve managed API keys.
     * 
     * This is the recommended approach for JWT auth as it matches how the
     * Pinecone CLI handles authentication.
     * 
     * @param context - Project context, or undefined to clear
     */
    setProjectContext(context: ProjectContext | undefined): void {
        this._projectContext = context;
        this._projectId = context?.id;
    }

    /**
     * Gets the currently set project context.
     * @returns The current project context, or undefined if not set
     */
    getProjectContext(): ProjectContext | undefined {
        return this._projectContext;
    }

    /**
     * Makes an authenticated request to a Pinecone API endpoint.
     * 
     * Automatically handles:
     * - Token retrieval and refresh
     * - Request signing (Bearer token or API key based on auth context)
     * - Content-Type headers (JSON or multipart/form-data)
     * - Query parameter encoding
     * - Error response parsing
     * 
     * @typeParam T - Expected response type
     * @param method - HTTP method (GET, POST, PUT, PATCH, DELETE)
     * @param path - API endpoint path (e.g., '/indexes', '/indexes/my-index')
     * @param options - Request options including body, headers, and query params
     * @returns Promise resolving to the parsed JSON response
     * @throws {PineconeApiError} When the API returns a non-2xx status code
     * @throws {Error} When authentication fails
     * 
     * @example
     * ```typescript
     * // GET request
     * const response = await client.request<{indexes: IndexModel[]}>('GET', '/indexes');
     * 
     * // POST request with body
     * const index = await client.request<IndexModel>('POST', '/indexes', {
     *   body: { name: 'my-index', dimension: 1536, metric: 'cosine' }
     * });
     * 
     * // Request to a specific host (data plane)
     * const queryResult = await client.request<QueryResponse>('POST', '/query', {
     *   host: 'https://my-index-abc123.svc.us-east-1.pinecone.io',
     *   body: { vector: [0.1, 0.2, 0.3], topK: 10 }
     * });
     * ```
     */
    async request<T>(
        method: string,
        path: string,
        options?: RequestOptions
    ): Promise<T> {
        let token: string;
        try {
            token = await this.authService.getAccessToken();
        } catch (e: unknown) {
            throw new Error(`Authentication error: ${e}`);
        }

        const headers: Record<string, string> = {
            'X-Pinecone-Api-Version': API_VERSION,
            ...options?.headers
        };
        
        // Detect FormData and let node-fetch set the Content-Type with boundary
        // Using instanceof check which is more robust than constructor.name (handles minification)
        const isFormData = options?.body instanceof FormData;
        if (!isFormData) {
            headers['Content-Type'] = 'application/json';
        }

        // Set authorization header based on authentication context
        // For JWT auth (OAuth/service account), we use managed API keys when project
        // context is available, which is the recommended approach (matches Pinecone CLI behavior)
        //
        // Per-request context (options.projectContext/projectId) takes precedence over
        // shared state (this._projectContext/_projectId) to avoid race conditions in
        // concurrent operations like tree view refreshes.
        const authContext = this.authService.getAuthContext();
        const isJwtAuth = authContext === AUTH_CONTEXTS.USER_TOKEN || authContext === AUTH_CONTEXTS.SERVICE_ACCOUNT;
        const effectiveProjectContext = options?.projectContext || this._projectContext;
        const effectiveProjectId = options?.projectId || this._projectId;

        const applyAuthHeaders = async (): Promise<void> => {
            delete headers['Authorization'];
            delete headers['Api-Key'];
            delete headers['X-Project-Id'];

            if (isJwtAuth) {
                if (effectiveProjectContext) {
                    const managedKey = await this.authService.getOrCreateManagedKey(
                        effectiveProjectContext.id,
                        effectiveProjectContext.name,
                        effectiveProjectContext.organizationId
                    );
                    headers['Api-Key'] = managedKey;
                    headers['X-Project-Id'] = effectiveProjectContext.id;
                    log.debug(`Using managed API key for project ${effectiveProjectContext.name}`);
                    return;
                }

                headers['Authorization'] = `Bearer ${token}`;
                if (effectiveProjectId) {
                    headers['X-Project-Id'] = effectiveProjectId;
                }
                log.debug('Using Bearer token auth (no project context set)');
                return;
            }

            // API keys are already project-scoped, so no X-Project-Id needed
            headers['Api-Key'] = token;
        };

        await applyAuthHeaders();

        // Build full URL with optional query parameters
        // Use environment setting if no explicit host is provided
        const config = vscode.workspace.getConfiguration('pinecone');
        const environment = config.get<'production' | 'staging'>('environment', 'production');
        const baseUrl = options?.host || getApiBaseUrl(environment);
        
        let url = `${baseUrl}${path}`;
        if (options?.queryParams) {
            const params = new URLSearchParams();
            for (const [key, rawValue] of Object.entries(options.queryParams)) {
                if (Array.isArray(rawValue)) {
                    rawValue.forEach((value) => params.append(key, value));
                } else {
                    params.append(key, rawValue);
                }
            }
            url += `?${params.toString()}`;
        }

        // Prepare request body once (safe to reuse across retries for string/FormData)
        let requestBody: string | FormData | undefined;
        if (options?.body) {
            if (isFormData) {
                requestBody = options.body as FormData;
            } else {
                requestBody = JSON.stringify(options.body);
            }
        }

        const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;
        const canRetryManagedKey =
            isJwtAuth &&
            Boolean(effectiveProjectContext);
        let didRetryManagedKey = false;

        const maxAttempts = canRetryManagedKey ? 2 : 1;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            try {
                const response = await this.fetchFn(url, {
                    method,
                    headers,
                    body: requestBody,
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (!response.ok) {
                    const text = await response.text();
                    const isAuthFailure = response.status === 401 || response.status === 403;

                    // If a managed key was deleted server-side (or otherwise invalid),
                    // self-heal by clearing local cache and recreating once.
                    if (canRetryManagedKey && isAuthFailure && !didRetryManagedKey && effectiveProjectContext) {
                        didRetryManagedKey = true;
                        log.warn(
                            `Managed key auth failed (${response.status}) for project ${effectiveProjectContext.id}; ` +
                            'clearing cached managed key and retrying once.'
                        );
                        await this.authService.deleteManagedKey(effectiveProjectContext.id, false);
                        await applyAuthHeaders();
                        continue;
                    }

                    throw new PineconeApiError(response.status, text);
                }

                // ─────────────────────────────────────────────────────────────────
                // Response Body Handling with Error Recovery
                // ─────────────────────────────────────────────────────────────────
                // 
                // Error Recovery Strategy:
                // 1. 204 No Content → Return empty object (standard REST pattern)
                // 2. Empty body with 200 → Return empty object (DELETE operations)
                // 3. Invalid JSON → Log warning, return empty object
                //
                // Rationale: Many operations (DELETE, some POSTs) return empty bodies.
                // Rather than throwing errors that disrupt the UI, we return an empty
                // object and let the caller handle the absence of data gracefully.
                // This provides resilience against API inconsistencies while still
                // logging warnings for debugging.
                // ─────────────────────────────────────────────────────────────────

                // Case 1: Explicit 204 No Content - standard REST response for success with no body
                if (response.status === 204) {
                    return {} as T;
                }

                // Case 2: Empty body check - some APIs return 200 with no body
                const text = await response.text();
                if (!text || text.trim() === '') {
                    return {} as T;
                }

                // Case 3: Parse JSON - with graceful fallback on parse errors
                try {
                    return JSON.parse(text) as T;
                } catch (parseError: unknown) {
                    // Error Recovery: Log for debugging but don't crash the UI
                    // This could indicate an API version mismatch or unexpected response format.
                    // The warning helps developers investigate without disrupting user experience.
                    log.warn(
                        'Failed to parse JSON response (returning empty object):',
                        parseError,
                        'Response text preview:',
                        text.substring(0, 200)
                    );
                    return {} as T;
                }
            } catch (error: unknown) {
                clearTimeout(timeoutId);
                if (error instanceof Error && error.name === 'AbortError') {
                    throw new PineconeApiError(408, `Request timeout after ${timeout}ms`);
                }
                throw error;
            }
        }

        throw new PineconeApiError(500, 'Request failed after retry attempts');
    }
}
