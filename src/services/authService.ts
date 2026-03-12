/**
 * Authentication Service
 * 
 * Manages authentication state for the Pinecone VSCode extension.
 * The extension UI provides OAuth2 browser-based login. Additionally,
 * credentials configured via the Pinecone CLI are automatically detected
 * and supported (including API keys and service accounts).
 * 
 * Configuration is stored in ~/.config/pinecone/ for CLI compatibility.
 * 
 * @see https://docs.pinecone.io/guides/getting-started/authentication
 */

import * as vscode from 'vscode';
import * as http from 'http';
import * as crypto from 'crypto';
import fetch from 'node-fetch';
import { ConfigService } from './configService';
import { AdminApiClient } from '../api/adminApi';
import { OAUTH_CONFIG, AUTH_CONTEXTS, AuthContextValue, OAUTH_CALLBACK_PORT, OAUTH_LOGIN_TIMEOUT_MS } from '../utils/constants';
import { createComponentLogger } from '../utils/logger';
import { getErrorMessage } from '../utils/errorHandling';

/** Logger for AuthService operations */
const log = createComponentLogger('AuthService');

/**
 * Represents a managed API key for data plane operations.
 * 
 * When using OAuth login (JWT auth), data plane APIs (like Assistant chat)
 * require API key authentication. The extension creates and manages these
 * keys automatically, similar to the Pinecone CLI's approach.
 * 
 * Keys are stored in secrets.yaml under `project_api_keys` and reused
 * across sessions to avoid creating duplicate keys.
 */
export interface ManagedKey {
    /** Display name of the key */
    name: string;
    /** Unique key identifier */
    id: string;
    /** The actual API key value */
    value: string;
    /** How the key was created */
    origin: 'cli_created' | 'user_created' | 'vscode_managed';
    /** Associated project ID */
    project_id: string;
    /** Associated project name */
    project_name: string;
    /** Associated organization ID */
    organization_id: string;
}

/** Prefix for API keys created by the extension */
const VSCODE_API_KEY_PREFIX = 'pinecone-vscode-';

/**
 * OAuth2 token response structure.
 */
export interface OAuth2Token {
    /** Bearer token for API requests */
    access_token: string;
    /** Token for obtaining new access tokens */
    refresh_token: string;
    /** Token type (always 'Bearer') */
    token_type: string;
    /** ISO 8601 expiration timestamp */
    expiry: string;
}

/**
 * Authentication context type.
 * Re-exports the AuthContextValue type from constants for backward compatibility.
 * 
 * @see AUTH_CONTEXTS for the constant values
 */
export type AuthContext = AuthContextValue;

/**
 * Structure of the secrets.yaml configuration file.
 */
export interface SecretsConfig {
    /** OAuth2 token for user login */
    oauth2_token?: OAuth2Token;
    /** Service account client ID */
    client_id?: string;
    /** Service account client secret */
    client_secret?: string;
    /** Direct API key */
    api_key?: string;
    /** Project-specific API keys */
    project_api_keys?: Record<string, ManagedKey>;
}

/**
 * Cached service account token with expiry tracking.
 */
interface CachedToken {
    /** The access token */
    token: string;
    /** Expiration timestamp (ms since epoch) */
    expiresAt: number;
}

/**
 * Service for managing Pinecone authentication.
 * 
 * Handles OAuth2 login flow, token refresh, and credential storage.
 * Maintains compatibility with the Pinecone CLI by using the same
 * configuration file format.
 * 
 * @example
 * ```typescript
 * const authService = new AuthService(context.secrets);
 * 
 * // Check if authenticated
 * if (!authService.isAuthenticated()) {
 *   await authService.login();
 * }
 * 
 * // Get token for API requests
 * const token = await authService.getAccessToken();
 * ```
 */
export class AuthService {
    private configService: ConfigService;
    private secretStorage: vscode.SecretStorage;
    private _onDidChangeAuth = new vscode.EventEmitter<void>();
    
    /** Event fired when authentication state changes */
    readonly onDidChangeAuth = this._onDidChangeAuth.event;
    
    /** Cache for service account tokens to avoid repeated token exchanges */
    private serviceAccountTokenCache: CachedToken | null = null;

    /**
     * Creates a new AuthService instance.
     * 
     * @param secretStorage - VSCode SecretStorage for secure credential storage
     */
    constructor(secretStorage: vscode.SecretStorage) {
        this.secretStorage = secretStorage;
        this.configService = new ConfigService();
        this.syncWithCliConfig();
    }

    /**
     * Synchronizes authentication state with CLI configuration files.
     * Called on initialization to detect existing CLI login.
     */
    private async syncWithCliConfig(): Promise<void> {
        await this.updateAuthContext();
        this._onDidChangeAuth.fire();
    }

    /**
     * Updates VSCode context variables for authentication state.
     * 
     * Sets `pinecone.isAuthenticated` and `pinecone.authContext` which
     * are used in `when` clauses for commands and welcome views.
     */
    private async updateAuthContext(): Promise<void> {
        const isAuth = this.isAuthenticated();
        const context = this.getAuthContext();
        
        await vscode.commands.executeCommand('setContext', 'pinecone.isAuthenticated', isAuth);
        await vscode.commands.executeCommand('setContext', 'pinecone.authContext', context);
    }

    /**
     * Gets the current authentication context type.
     * 
     * @returns The authentication method in use, or empty string if not authenticated
     */
    getAuthContext(): AuthContext {
        const state = this.configService.getState();
        const userContext = state.user_context;
        
        // Handle both string format (from YAML parsing) and object format
        if (typeof userContext === 'string') {
             try {
                const parsed = JSON.parse(userContext);
                return (parsed.auth_context as AuthContext) || '';
             } catch {
                 return '';
             }
        }
        return (userContext?.auth_context as AuthContext) || '';
    }

    /**
     * Initiates OAuth2 login flow via browser.
     * 
     * Opens the user's default browser to the Pinecone login page.
     * Uses PKCE (Proof Key for Code Exchange) for security.
     * 
     * @throws {Error} When the callback server cannot start
     */
    async login(timeoutMs: number = OAUTH_LOGIN_TIMEOUT_MS, organizationId?: string): Promise<void> {
        const state = crypto.randomBytes(16).toString('hex');
        const codeVerifier = crypto.randomBytes(32).toString('base64url');
        const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
        const authUrl = new URL(OAUTH_CONFIG.authUrl);
        authUrl.searchParams.append('response_type', 'code');
        authUrl.searchParams.append('client_id', OAUTH_CONFIG.clientId);
        authUrl.searchParams.append('redirect_uri', OAUTH_CONFIG.redirectUri);
        authUrl.searchParams.append('scope', OAUTH_CONFIG.scopes.join(' '));
        authUrl.searchParams.append('state', state);
        authUrl.searchParams.append('code_challenge', codeChallenge);
        authUrl.searchParams.append('code_challenge_method', 'S256');
        authUrl.searchParams.append('audience', OAUTH_CONFIG.audience);
        if (organizationId) {
            authUrl.searchParams.append('orgId', organizationId);
        }

        await new Promise<void>((resolve, reject) => {
            let timeoutId: NodeJS.Timeout | undefined;
            let settled = false;

            const server = http.createServer((req, res) => {
                void (async () => {
                    if (!req.url || !req.headers.host) {
                        res.writeHead(400);
                        res.end('Invalid callback request');
                        await settleReject(new Error('Invalid OAuth callback request.'));
                        return;
                    }

                    const url = new URL(req.url, `http://${req.headers.host}`);
                    if (url.pathname !== '/auth-callback') {
                        res.writeHead(404);
                        res.end('Not found');
                        return;
                    }

                    const code = url.searchParams.get('code');
                    const returnedState = url.searchParams.get('state');

                    if (returnedState !== state) {
                        res.writeHead(400);
                        res.end('Invalid state parameter');
                        await settleReject(new Error('Invalid state parameter received from OAuth callback.'));
                        return;
                    }

                    if (!code) {
                        res.writeHead(400);
                        res.end('Missing authorization code');
                        await settleReject(new Error('OAuth callback did not include an authorization code.'));
                        return;
                    }

                    try {
                        const token = await this.exchangeCodeForToken(code, codeVerifier);
                        this.saveOAuthToken(token);
                        this.setAuthContextState(AUTH_CONTEXTS.USER_TOKEN);

                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end('<h1>Login Successful</h1><p>You can close this window and return to VSCode.</p>');

                        await this.updateAuthContext();
                        this._onDidChangeAuth.fire();
                        vscode.window.showInformationMessage('Successfully logged in to Pinecone!');
                        await settleResolve();
                    } catch (error: unknown) {
                        res.writeHead(500);
                        res.end('Authentication failed');
                        await settleReject(new Error(`Authentication failed: ${getErrorMessage(error)}`));
                    }
                })();
            });

            const settleResolve = async (): Promise<void> => {
                if (settled) {
                    return;
                }
                settled = true;
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                await this.closeServer(server);
                resolve();
            };

            const settleReject = async (error: Error): Promise<void> => {
                if (settled) {
                    return;
                }
                settled = true;
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                await this.closeServer(server);
                reject(error);
            };

            server.on('error', (error: NodeJS.ErrnoException) => {
                if (error.code === 'EADDRINUSE') {
                    void settleReject(
                        new Error(
                            `OAuth callback port ${OAUTH_CALLBACK_PORT} is already in use (EADDRINUSE).`
                        )
                    );
                    return;
                }
                void settleReject(error);
            });

            server.listen(OAUTH_CALLBACK_PORT, () => {
                timeoutId = setTimeout(() => {
                    void settleReject(
                        new Error(
                            `Login timed out after ${Math.floor(timeoutMs / 1000)} seconds.`
                        )
                    );
                }, timeoutMs);

                void (async () => {
                    try {
                        const opened = await vscode.env.openExternal(vscode.Uri.parse(authUrl.toString()));
                        if (!opened) {
                            await settleReject(new Error('Could not open browser for OAuth login.'));
                        }
                    } catch (error: unknown) {
                        await settleReject(
                            new Error(`Could not open browser for OAuth login: ${getErrorMessage(error)}`)
                        );
                    }
                })();
            });
        });
    }

    /**
     * Attempts to switch OAuth organization scope using refresh token exchange.
     *
     * Returns true only when the refreshed token is scoped to the requested org.
     */
    async switchOrganization(organizationId: string): Promise<boolean> {
        if (!organizationId || this.getAuthContext() !== AUTH_CONTEXTS.USER_TOKEN) {
            return false;
        }

        const secrets = this.configService.getSecrets();
        const currentToken = secrets.oauth2_token;
        if (!currentToken?.refresh_token) {
            return false;
        }

        const currentOrgId = this.getTokenOrganizationId(currentToken.access_token);
        if (currentOrgId === organizationId) {
            return true;
        }

        try {
            const refreshed = await this.refreshToken(currentToken.refresh_token, organizationId);
            this.saveOAuthToken(refreshed);

            const refreshedOrgId = this.getTokenOrganizationId(refreshed.access_token);
            if (refreshedOrgId !== organizationId) {
                log.warn(`Requested org scope "${organizationId}" but received token for "${refreshedOrgId || 'unknown'}".`);
                return false;
            }

            // Do not fire auth-change refresh events when only org scope changes.
            // Auth context and authenticated state remain unchanged, and emitting
            // this event can create tree refresh loops when multiple orgs are expanded.
            return true;
        } catch (error: unknown) {
            log.warn(`Failed to switch OAuth organization to "${organizationId}":`, error);
            return false;
        }
    }

    /**
     * Extracts the organization ID claim from an access token.
     */
    private getTokenOrganizationId(accessToken: string | undefined): string | undefined {
        if (!accessToken) {
            return undefined;
        }

        try {
            const parts = accessToken.split('.');
            if (parts.length < 2) {
                return undefined;
            }

            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
            const orgId =
                payload['https://pinecone.io/orgId'] ??
                payload.orgId ??
                payload.organization_id;

            return typeof orgId === 'string' ? orgId : undefined;
        } catch {
            return undefined;
        }
    }

    /**
     * Closes the OAuth callback server and waits for completion.
     */
    private async closeServer(server: http.Server): Promise<void> {
        await new Promise<void>((resolve) => {
            if (!server.listening) {
                resolve();
                return;
            }
            server.close(() => resolve());
        });
        server.removeAllListeners();
    }

    private async exchangeCodeForToken(code: string, codeVerifier: string): Promise<OAuth2Token> {
        const response = await fetch(OAUTH_CONFIG.tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                grant_type: 'authorization_code',
                client_id: OAUTH_CONFIG.clientId,
                code_verifier: codeVerifier,
                code,
                redirect_uri: OAUTH_CONFIG.redirectUri
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to exchange code for token: ${response.statusText}`);
        }

        const data = await response.json() as { 
            access_token: string; 
            refresh_token: string; 
            token_type: string; 
            expires_in: number; 
        };
        // Calculate expiry
        const expiryDate = new Date();
        expiryDate.setSeconds(expiryDate.getSeconds() + data.expires_in);

        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            token_type: data.token_type,
            expiry: expiryDate.toISOString()
        };
    }

    private saveOAuthToken(token: OAuth2Token) {
        const secrets = this.configService.getSecrets();
        secrets.oauth2_token = token;
        this.configService.saveSecrets(secrets);
    }

    private setAuthContextState(context: AuthContext, email: string = '') {
        const state = this.configService.getState();
        state.user_context = {
            auth_context: context,
            email: email
        };
        this.configService.saveState(state);
    }

    /**
     * Logs out and clears stored credentials.
     * 
     * Removes OAuth tokens. API keys and service account credentials
     * configured via the CLI are preserved in the config files.
     */
    async logout(): Promise<void> {
        const secrets = this.configService.getSecrets();
        delete secrets.oauth2_token;
        this.configService.saveSecrets(secrets);
        
        // Clear service account token cache
        this.serviceAccountTokenCache = null;
        
        // Clear target organization/project context on logout
        // This ensures a clean state when the user logs back in
        this.configService.clearTargetContext();
        
        this.setAuthContextState('');
        await this.updateAuthContext();
        this._onDidChangeAuth.fire();
        vscode.window.showInformationMessage('Logged out of Pinecone.');
    }

    /**
     * Gets an access token for API requests.
     * 
     * Handles token refresh and caching automatically based on
     * the current authentication context.
     * 
     * @returns Valid access token or API key
     * @throws {Error} When not authenticated or token refresh fails
     */
    async getAccessToken(): Promise<string> {
        const context = this.getAuthContext();
        const secrets = this.configService.getSecrets();

        if (context === AUTH_CONTEXTS.USER_TOKEN) {
            let token = secrets.oauth2_token;
            if (!token) {
                throw new Error('No OAuth token found. Please log in.');
            }
            
            // Check expiry and refresh if needed (refresh 90 seconds before expiry)
            const expiryTime = new Date(token.expiry).getTime();
            const timeUntilExpiry = expiryTime - Date.now();
            
            if (timeUntilExpiry < 90000) {
                if (token.refresh_token) {
                    try {
                        token = await this.refreshToken(token.refresh_token);
                        this.saveOAuthToken(token);
                    } catch (error: unknown) {
                        await this.handleAuthFailure('Token expired. Please log in again.');
                        throw new Error('Token expired and refresh failed');
                    }
                } else {
                    await this.handleAuthFailure('Token expired. Please log in again.');
                    throw new Error('Token expired and no refresh token available');
                }
            }
            return token.access_token;
            
        } else if (context === AUTH_CONTEXTS.API_KEY) {
            const apiKey = secrets.api_key;
            if (!apiKey) {
                throw new Error('No API key configured. Configure via the Pinecone CLI.');
            }
            return apiKey;
            
        } else if (context === AUTH_CONTEXTS.SERVICE_ACCOUNT) {
            const { client_id, client_secret } = secrets;
            if (!client_id || !client_secret) {
                throw new Error('Service account credentials not configured.');
            }
            return await this.getServiceAccountToken(client_id, client_secret);
        }
        
        throw new Error('Not authenticated. Please log in or configure credentials.');
    }

    /**
     * Refreshes an OAuth2 token using the refresh token.
     * 
     * @param refreshToken - Current refresh token
     * @returns New OAuth2 token with updated access and refresh tokens
     * @throws {Error} When refresh fails
     */
    private async refreshToken(refreshToken: string, organizationId?: string): Promise<OAuth2Token> {
        const body = new URLSearchParams();
        body.set('grant_type', 'refresh_token');
        body.set('client_id', OAUTH_CONFIG.clientId);
        body.set('refresh_token', refreshToken);
        body.set('audience', OAUTH_CONFIG.audience);
        if (organizationId) {
            body.set('orgId', organizationId);
        }

        const response = await fetch(OAUTH_CONFIG.tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        });

        if (!response.ok) {
            throw new Error(`Failed to refresh token: ${response.statusText}`);
        }

        const data = await response.json() as { 
            access_token: string; 
            refresh_token?: string; 
            token_type: string; 
            expires_in: number 
        };
        
        const expiryDate = new Date();
        expiryDate.setSeconds(expiryDate.getSeconds() + data.expires_in);

        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token || refreshToken,
            token_type: data.token_type,
            expiry: expiryDate.toISOString()
        };
    }

    /**
     * Gets access token for service account using client credentials flow.
     * 
     * Implements token caching to avoid unnecessary token exchanges.
     * Tokens are cached until 90 seconds before expiry.
     * 
     * @param clientId - Service account client ID
     * @param clientSecret - Service account client secret
     * @returns Access token for API requests
     * @throws {Error} When authentication fails
     */
    private async getServiceAccountToken(clientId: string, clientSecret: string): Promise<string> {
        // Check if we have a valid cached token
        if (this.serviceAccountTokenCache) {
            const timeUntilExpiry = this.serviceAccountTokenCache.expiresAt - Date.now();
            if (timeUntilExpiry > 90000) {
                return this.serviceAccountTokenCache.token;
            }
        }
        
        // Exchange credentials for new token
        const response = await fetch(OAUTH_CONFIG.tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                grant_type: 'client_credentials',
                client_id: clientId,
                client_secret: clientSecret,
                audience: OAUTH_CONFIG.audience
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to get service account token: ${response.statusText}`);
        }

        const data = await response.json() as { access_token: string; expires_in: number };
        
        // Cache the token with expiry time
        this.serviceAccountTokenCache = {
            token: data.access_token,
            expiresAt: Date.now() + (data.expires_in * 1000)
        };
        
        return data.access_token;
    }

    /**
     * Handles authentication failure by clearing state and prompting user.
     * 
     * @param message - Message to display to the user
     */
    private async handleAuthFailure(message: string): Promise<void> {
        this.setAuthContextState('');
        await this.updateAuthContext();
        this._onDidChangeAuth.fire();
        
        const selection = await vscode.window.showWarningMessage(message, 'Login');
        if (selection === 'Login') {
            vscode.commands.executeCommand('pinecone.login');
        }
    }

    /**
     * Checks if the user is currently authenticated.
     * 
     * Validates that both an auth context is set AND the corresponding
     * credentials actually exist in secrets.yaml. This prevents the UI
     * from showing as authenticated when credentials are missing, expired,
     * or deleted.
     * 
     * @returns true if valid credentials exist for the current auth context
     */
    isAuthenticated(): boolean {
        const context = this.getAuthContext();
        if (!context) {
            return false;
        }
        
        // Verify that actual credentials exist for the claimed auth context
        const secrets = this.configService.getSecrets();
        
        switch (context) {
            case AUTH_CONTEXTS.USER_TOKEN:
                return !!secrets.oauth2_token?.access_token;
            case AUTH_CONTEXTS.SERVICE_ACCOUNT:
                return !!secrets.client_id && !!secrets.client_secret;
            case AUTH_CONTEXTS.API_KEY:
                return !!secrets.api_key;
            default:
                return false;
        }
    }

    /**
     * Gets the current user's email address.
     * 
     * Only available for OAuth2 (user token) authentication.
     * 
     * @returns Email address if available, undefined otherwise
     */
    getUserEmail(): string | undefined {
        const state = this.configService.getState();
        const userContext = state.user_context;
        if (typeof userContext === 'object' && userContext?.email) {
            return userContext.email;
        }
        return undefined;
    }
    
    /**
     * Gets the ConfigService instance for direct access to configuration.
     * 
     * Used by PineconeService for service account operations.
     * 
     * @returns The ConfigService instance
     */
    getConfigService(): ConfigService {
        return this.configService;
    }

    // ========================================================================
    // Managed API Key Support
    // ========================================================================

    /**
     * Gets or creates a managed API key for data plane operations.
     * 
     * When using OAuth/JWT authentication, the data plane APIs (like Assistant
     * chat) require API key authentication instead of Bearer tokens. This method
     * automatically creates and manages API keys for each project.
     * 
     * This follows the same pattern as the Pinecone CLI:
     * 1. Check if we have a stored managed key for this project
     * 2. If not, create one via the Admin API
     * 3. Store it in secrets.yaml for future use
     * 
     * @param projectId - ID of the project to get/create a key for
     * @param projectName - Name of the project (for display/storage)
     * @param organizationId - ID of the organization the project belongs to
     * @returns The API key value for data plane authentication
     * @throws {Error} When key creation fails or user is not authenticated
     * 
     * @example
     * ```typescript
     * const apiKey = await authService.getOrCreateManagedKey(
     *   'proj-123',
     *   'My Project',
     *   'org-456'
     * );
     * // Use apiKey for data plane requests
     * ```
     */
    async getOrCreateManagedKey(
        projectId: string,
        projectName: string,
        organizationId: string
    ): Promise<string> {
        const context = this.getAuthContext();
        const secrets = this.configService.getSecrets();
        
        // For API key auth, just return the API key directly
        if (context === AUTH_CONTEXTS.API_KEY) {
            if (!secrets.api_key) {
                throw new Error('No API key configured');
            }
            return secrets.api_key;
        }
        
        // Check if we have a stored managed key for this project
        // Note: Handle edge case where project_api_keys might be a string (from YAML parsing issue)
        let managedKeys = secrets.project_api_keys;
        if (typeof managedKeys !== 'object' || managedKeys === null) {
            managedKeys = {};
        }
        const existingKey = managedKeys[projectId];
        
        if (existingKey?.value) {
            log.debug(`Using existing managed API key for project ${projectId}`);
            return existingKey.value;
        }
        
        // Need to create a new managed key
        log.info(`Creating managed API key for project ${projectName} (${projectId})`);
        
        // Get current access token for Admin API call
        const accessToken = await this.getAccessToken();
        
        // Create the key via Admin API
        const adminApi = new AdminApiClient();
        const keyName = `${VSCODE_API_KEY_PREFIX}${Date.now()}`;
        
        const keyWithSecret = await adminApi.createAPIKey(accessToken, projectId, {
            name: keyName,
            roles: ['ProjectEditor']
        });
        
        // Store the managed key in secrets
        const newManagedKey: ManagedKey = {
            name: keyName,
            id: keyWithSecret.key.id,
            value: keyWithSecret.value,
            origin: 'vscode_managed',
            project_id: projectId,
            project_name: projectName,
            organization_id: organizationId
        };
        
        // Ensure managedKeys is a proper object before assigning
        const updatedKeys: Record<string, ManagedKey> = { ...managedKeys };
        updatedKeys[projectId] = newManagedKey;
        secrets.project_api_keys = updatedKeys;
        this.configService.saveSecrets(secrets);
        
        log.info(`Created and stored managed API key ${keyWithSecret.key.id} for project ${projectName}`);
        
        return keyWithSecret.value;
    }

    /**
     * Deletes a managed API key for a project.
     * 
     * Called when cleaning up resources or when a key is no longer needed.
     * Also removes the key from local storage.
     * 
     * @param projectId - ID of the project to delete the key for
     * @param deleteFromServer - If true, also deletes the key from Pinecone (default: false)
     */
    async deleteManagedKey(projectId: string, deleteFromServer: boolean = false): Promise<void> {
        const secrets = this.configService.getSecrets();
        // Handle edge case where project_api_keys might not be an object
        let managedKeys = secrets.project_api_keys;
        if (typeof managedKeys !== 'object' || managedKeys === null) {
            managedKeys = {};
        }
        const existingKey = managedKeys[projectId];
        
        if (!existingKey) {
            return; // No key to delete
        }
        
        // Delete from server if requested
        if (deleteFromServer && existingKey.origin === 'vscode_managed') {
            try {
                const accessToken = await this.getAccessToken();
                const adminApi = new AdminApiClient();
                await adminApi.deleteAPIKey(accessToken, existingKey.id);
                log.info(`Deleted managed API key ${existingKey.id} from Pinecone`);
            } catch (error: unknown) {
                log.warn(`Failed to delete managed API key from server:`, error);
                // Continue to remove from local storage even if server delete fails
            }
        }
        
        // Remove from local storage
        delete managedKeys[projectId];
        secrets.project_api_keys = managedKeys;
        this.configService.saveSecrets(secrets);
        log.info(`Removed managed API key for project ${projectId} from local storage`);
    }

    /**
     * Disposes of the AuthService resources.
     * 
     * Cleans up the event emitter to prevent memory leaks.
     */
    dispose(): void {
        this._onDidChangeAuth.dispose();
    }
}
