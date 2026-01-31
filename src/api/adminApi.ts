/**
 * Pinecone Admin API Client
 * 
 * Provides methods for organization and project management.
 * The Admin API is used for operations that require organization-level
 * access, such as listing organizations, managing projects, etc.
 * 
 * For OAuth/JWT users, this API is used to:
 * 1. List organizations the user belongs to
 * 2. List projects within an organization
 * 3. Manage project lifecycle (create, delete)
 * 
 * @see https://docs.pinecone.io/reference/api/admin
 */

import * as vscode from 'vscode';
import fetch from 'node-fetch';
import { Organization, Project, CreateProjectParams, APIKey, APIKeyWithSecret } from './types';
import { OAUTH_CONFIG, getApiBaseUrl, API_VERSION } from '../utils/constants';

// ============================================================================
// API Key Types
// ============================================================================

/**
 * Parameters for creating an API key.
 */
export interface CreateAPIKeyParams {
    /** Display name for the key */
    name: string;
    /** Roles to assign (e.g., 'ProjectEditor') */
    roles?: string[];
}

/**
 * Client for Pinecone Admin API operations.
 * 
 * Handles organization-level operations like listing organizations,
 * managing projects, etc. Works with both OAuth tokens and service
 * account credentials.
 * 
 * Note: This client manages its own authentication separately from
 * the main PineconeClient to support the client credentials flow.
 * 
 * @example
 * ```typescript
 * const adminApi = new AdminApiClient();
 * const token = await adminApi.getAccessToken(clientId, clientSecret);
 * const projects = await adminApi.listProjects(token);
 * ```
 */
export class AdminApiClient {
    /**
     * Obtains an access token using service account credentials.
     * 
     * Uses the OAuth 2.0 client credentials flow to exchange
     * the service account's client ID and secret for a bearer token.
     * 
     * @param clientId - Service account client ID
     * @param clientSecret - Service account client secret
     * @returns Access token for Admin API requests
     * @throws {Error} When authentication fails
     * 
     * @example
     * ```typescript
     * const token = await adminApi.getAccessToken(
     *   'your-client-id',
     *   'your-client-secret'
     * );
     * ```
     */
    async getAccessToken(clientId: string, clientSecret: string): Promise<string> {
        const response = await fetch(OAUTH_CONFIG.tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'client_credentials',
                audience: 'https://api.pinecone.io/'
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to authenticate service account: ${response.statusText}`);
        }

        const data = await response.json() as { access_token: string };
        return data.access_token;
    }

    /**
     * Lists all organizations the user has access to.
     * 
     * Users can belong to multiple organizations. This method returns
     * all organizations where the user is a member. Each organization
     * may contain multiple projects.
     * 
     * @param accessToken - Valid OAuth/JWT access token
     * @returns Array of organization models
     * @throws {Error} When the request fails
     * 
     * @example
     * ```typescript
     * const orgs = await adminApi.listOrganizations(token);
     * orgs.forEach(org => console.log(org.name, org.id));
     * ```
     */
    async listOrganizations(accessToken: string): Promise<Organization[]> {
        const config = vscode.workspace.getConfiguration('pinecone');
        const environment = config.get<'production' | 'staging'>('environment', 'production');
        const baseUrl = getApiBaseUrl(environment);

        const response = await fetch(`${baseUrl}/admin/organizations`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'X-Pinecone-Api-Version': API_VERSION
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to list organizations: ${errorText || response.statusText}`);
        }

        const data = await response.json() as { data?: Organization[]; organizations?: Organization[] };
        // API response format may vary - handle both possible structures
        return data.data || data.organizations || [];
    }

    /**
     * Lists all projects within an organization.
     * 
     * Projects are scoped to an organization. If organizationId is provided,
     * only projects in that organization are returned. The API uses the
     * organization context from the token if no explicit ID is provided.
     * 
     * @param accessToken - Valid OAuth/JWT access token
     * @param organizationId - Optional organization ID to filter projects
     * @returns Array of project models
     * @throws {Error} When the request fails
     * 
     * @example
     * ```typescript
     * // List all projects in a specific organization
     * const projects = await adminApi.listProjects(token, 'org-123');
     * projects.forEach(p => console.log(p.name, p.id));
     * ```
     */
    async listProjects(accessToken: string, organizationId?: string): Promise<Project[]> {
        const config = vscode.workspace.getConfiguration('pinecone');
        const environment = config.get<'production' | 'staging'>('environment', 'production');
        const baseUrl = getApiBaseUrl(environment);

        const headers: Record<string, string> = {
            'Authorization': `Bearer ${accessToken}`,
            'X-Pinecone-Api-Version': API_VERSION
        };

        // Add organization ID header if provided to scope the request
        // Note: The API may not properly filter by this header, so we also filter client-side
        if (organizationId) {
            headers['X-Organization-Id'] = organizationId;
        }

        const response = await fetch(`${baseUrl}/admin/projects`, {
            headers
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to list projects: ${errorText || response.statusText}`);
        }

        const data = await response.json() as { data?: Project[]; projects?: Project[] };
        // API response format may vary - handle both possible structures
        const allProjects = data.data || data.projects || [];
        
        // Filter projects by organization_id client-side to ensure correct scoping
        // The API's X-Organization-Id header may not reliably filter projects,
        // so we explicitly filter here to only show projects belonging to the requested org
        if (organizationId) {
            return allProjects.filter(project => project.organization_id === organizationId);
        }
        
        return allProjects;
    }

    /**
     * Creates a new project in the specified organization.
     * 
     * Projects are created without max_pods since this extension
     * only supports serverless indexes.
     * 
     * @param accessToken - Valid OAuth/JWT access token
     * @param params - Project creation parameters
     * @param organizationId - Optional organization ID to create the project in
     * @returns The created project model
     * @throws {Error} When project creation fails
     * 
     * @example
     * ```typescript
     * const project = await adminApi.createProject(token, {
     *   name: 'my-new-project',
     *   force_encryption_with_cmek: false
     * }, 'org-123');
     * ```
     */
    async createProject(accessToken: string, params: CreateProjectParams, organizationId?: string): Promise<Project> {
        const config = vscode.workspace.getConfiguration('pinecone');
        const environment = config.get<'production' | 'staging'>('environment', 'production');
        const baseUrl = getApiBaseUrl(environment);

        const headers: Record<string, string> = {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Pinecone-Api-Version': API_VERSION
        };

        // Include organization ID header if provided
        if (organizationId) {
            headers['X-Organization-Id'] = organizationId;
        }

        const response = await fetch(`${baseUrl}/admin/projects`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                name: params.name,
                force_encryption_with_cmek: params.force_encryption_with_cmek ?? false
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to create project: ${errorText || response.statusText}`);
        }

        return response.json() as Promise<Project>;
    }

    /**
     * Gets detailed information about a specific project.
     * 
     * @param accessToken - Valid access token from getAccessToken()
     * @param projectId - ID of the project to describe
     * @returns The project model with full details
     * @throws {Error} When the project doesn't exist
     */
    async describeProject(accessToken: string, projectId: string): Promise<Project> {
        const config = vscode.workspace.getConfiguration('pinecone');
        const environment = config.get<'production' | 'staging'>('environment', 'production');
        const baseUrl = getApiBaseUrl(environment);

        const response = await fetch(`${baseUrl}/admin/projects/${projectId}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'X-Pinecone-Api-Version': API_VERSION
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to describe project: ${response.statusText}`);
        }

        return response.json() as Promise<Project>;
    }

    /**
     * Deletes a project and all its resources.
     * 
     * WARNING: This operation is irreversible. All indexes, assistants,
     * backups, and other resources in the project will be deleted.
     * 
     * @param accessToken - Valid access token from getAccessToken()
     * @param projectId - ID of the project to delete
     * @throws {Error} When deletion fails
     */
    async deleteProject(accessToken: string, projectId: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('pinecone');
        const environment = config.get<'production' | 'staging'>('environment', 'production');
        const baseUrl = getApiBaseUrl(environment);

        const response = await fetch(`${baseUrl}/admin/projects/${projectId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'X-Pinecone-Api-Version': API_VERSION
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to delete project: ${errorText || response.statusText}`);
        }
    }

    // ========================================================================
    // API Key Management
    // ========================================================================

    /**
     * Creates a new API key for a project.
     * 
     * API keys are used for data plane operations and provide an alternative
     * to OAuth/JWT authentication. When using OAuth login, the extension
     * creates managed API keys for data plane access (similar to the CLI).
     * 
     * IMPORTANT: The key value is only returned at creation time and cannot
     * be retrieved later. Store it securely.
     * 
     * @param accessToken - Valid OAuth/JWT access token
     * @param projectId - ID of the project to create the key for
     * @param params - Key creation parameters (name, roles)
     * @returns The created API key with its secret value
     * @throws {Error} When key creation fails
     * 
     * @example
     * ```typescript
     * const keyWithSecret = await adminApi.createAPIKey(token, 'proj-123', {
     *   name: 'pinecone-vscode-managed',
     *   roles: ['ProjectEditor']
     * });
     * // Store keyWithSecret.value securely - it won't be available again!
     * ```
     */
    async createAPIKey(
        accessToken: string, 
        projectId: string, 
        params: CreateAPIKeyParams
    ): Promise<APIKeyWithSecret> {
        const config = vscode.workspace.getConfiguration('pinecone');
        const environment = config.get<'production' | 'staging'>('environment', 'production');
        const baseUrl = getApiBaseUrl(environment);

        const response = await fetch(`${baseUrl}/admin/projects/${projectId}/api-keys`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'X-Pinecone-Api-Version': API_VERSION
            },
            body: JSON.stringify({
                name: params.name,
                roles: params.roles || ['ProjectEditor']
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to create API key: ${errorText || response.statusText}`);
        }

        return response.json() as Promise<APIKeyWithSecret>;
    }

    /**
     * Lists all API keys for a project.
     * 
     * Note: This only returns key metadata, not the actual key values.
     * Key values are only available at creation time.
     * 
     * @param accessToken - Valid OAuth/JWT access token
     * @param projectId - ID of the project to list keys for
     * @returns Array of API key metadata
     * @throws {Error} When listing fails
     */
    async listAPIKeys(accessToken: string, projectId: string): Promise<APIKey[]> {
        const config = vscode.workspace.getConfiguration('pinecone');
        const environment = config.get<'production' | 'staging'>('environment', 'production');
        const baseUrl = getApiBaseUrl(environment);

        const response = await fetch(`${baseUrl}/admin/projects/${projectId}/api-keys`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'X-Pinecone-Api-Version': API_VERSION
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to list API keys: ${errorText || response.statusText}`);
        }

        const data = await response.json() as { data?: APIKey[]; api_keys?: APIKey[] };
        // API response format may vary - handle both possible structures
        return data.data || data.api_keys || [];
    }

    /**
     * Deletes an API key.
     * 
     * @param accessToken - Valid OAuth/JWT access token
     * @param keyId - ID of the API key to delete
     * @throws {Error} When deletion fails
     */
    async deleteAPIKey(accessToken: string, keyId: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('pinecone');
        const environment = config.get<'production' | 'staging'>('environment', 'production');
        const baseUrl = getApiBaseUrl(environment);

        const response = await fetch(`${baseUrl}/admin/api-keys/${keyId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'X-Pinecone-Api-Version': API_VERSION
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to delete API key: ${errorText || response.statusText}`);
        }
    }
}
