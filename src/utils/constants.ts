/**
 * Configuration Constants
 * 
 * This module defines all configuration constants used throughout the extension,
 * including file paths, OAuth settings, and API endpoints.
 * 
 * Configuration files are stored in ~/.config/pinecone/ for compatibility
 * with the Pinecone CLI.
 */

import * as path from 'path';
import * as os from 'os';

// ============================================================================
// Configuration File Paths
// ============================================================================

/**
 * Root directory for Pinecone configuration files.
 * Located at ~/.config/pinecone/ for CLI compatibility.
 */
export const PINECONE_CONFIG_DIR = path.join(os.homedir(), '.config', 'pinecone');

/**
 * Path to secrets.yaml containing sensitive credentials.
 * Stores OAuth tokens, API keys, and service account credentials.
 * File permissions should be 0600 (owner read/write only).
 */
export const SECRETS_FILE = path.join(PINECONE_CONFIG_DIR, 'secrets.yaml');

/**
 * Path to state.yaml containing non-sensitive session state.
 * Stores current auth context, target org/project, etc.
 */
export const STATE_FILE = path.join(PINECONE_CONFIG_DIR, 'state.yaml');

/**
 * Path to config.yaml containing user preferences.
 * Stores default regions, output formats, etc.
 */
export const CONFIG_FILE = path.join(PINECONE_CONFIG_DIR, 'config.yaml');

// ============================================================================
// OAuth 2.0 Configuration
// ============================================================================

/**
 * OAuth 2.0 configuration for Pinecone authentication.
 * Uses Auth0 as the identity provider with PKCE flow for security.
 */
export const OAUTH_CONFIG = {
    /** Authorization endpoint for initiating OAuth flow */
    authUrl: 'https://login.pinecone.io/oauth/authorize',
    /** Token endpoint for exchanging codes and refreshing tokens */
    tokenUrl: 'https://login.pinecone.io/oauth/token',
    /** Public client ID for the VSCode extension */
    clientId: 'A4ONXSaOGstwwir0zUztoI6zjyt9zsRH',
    /** Local callback URL for receiving auth codes */
    redirectUri: 'http://127.0.0.1:59049/auth-callback',
    /** OAuth scopes requested */
    scopes: ['openid', 'profile', 'email', 'offline_access'],
    /** API audience for token validation */
    audience: 'https://us-central1-production-console.cloudfunctions.net/api/v1'
} as const;

// ============================================================================
// API Configuration
// ============================================================================

/**
 * API URLs by environment.
 * Production is the default; staging is used for internal testing.
 */
export const API_URLS = {
    production: 'https://api.pinecone.io',
    staging: 'https://api-staging.pinecone.io'
} as const;

/**
 * Gets the API base URL for the configured environment.
 * 
 * @param environment - 'production' or 'staging'
 * @returns The appropriate API base URL
 */
export function getApiBaseUrl(environment: 'production' | 'staging' = 'production'): string {
    return API_URLS[environment] || API_URLS.production;
}

/**
 * API version header value.
 * 
 * This version is sent with all API requests via the `X-Pinecone-Api-Version`
 * header to ensure consistent API behavior. The version determines which
 * API features and response formats are available.
 * 
 * **Version History:**
 * - 2025-10: Current version used by this extension
 * 
 * **Important:** When updating this version, ensure all API response types
 * in `types.ts` are updated to match the new schema.
 * 
 * @see https://docs.pinecone.io/reference/api/versioning
 */
export const API_VERSION = '2025-10';

// ============================================================================
// Assistant Models Configuration
// ============================================================================

/**
 * Supported AI models for Pinecone Assistant chat.
 * 
 * These models are available for use with the Assistant chat API.
 * The model ID is sent to the API; the display name and provider
 * are shown in the UI.
 * 
 * **Updating this list:**
 * When Pinecone adds or removes supported models, update this array
 * and also update the README.md model list to match.
 * 
 * @see https://docs.pinecone.io/guides/assistant/understanding-assistant
 */
export const ASSISTANT_MODELS = [
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
    { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'OpenAI' },
    { id: 'gpt-5', name: 'GPT-5', provider: 'OpenAI' },
    { id: 'o4-mini', name: 'o4-mini', provider: 'OpenAI' },
    { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', provider: 'Anthropic' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'Google' }
] as const;

/** Type for a supported assistant model */
export type AssistantModelConfig = typeof ASSISTANT_MODELS[number];

/** Type for assistant model IDs */
export type AssistantModelId = typeof ASSISTANT_MODELS[number]['id'];

// ============================================================================
// Embedding Models Configuration
// ============================================================================

/**
 * Embedding model name type matching API expectations.
 * These are the model identifiers accepted by the Pinecone API.
 */
export type EmbeddingModelName = 
    | 'llama-text-embed-v2' 
    | 'multilingual-e5-large' 
    | 'pinecone-sparse-english-v0';

/**
 * Embedding model configuration type for integrated embeddings.
 */
export interface EmbeddingModelConfig {
    /** Model identifier used in API calls - must be a valid EmbeddingModelName */
    name: EmbeddingModelName;
    /** Human-readable label for UI display */
    label: string;
    /** Whether this is a sparse embedding model */
    isSparse: boolean;
    /** Available dimensions (empty for sparse models) */
    dimensions: readonly number[];
    /** Default dimension to use (undefined for sparse models) */
    defaultDimension?: number;
    /** Default distance metric */
    defaultMetric: 'cosine' | 'dotproduct' | 'euclidean';
}

/**
 * Available embedding models for integrated embeddings.
 * 
 * When creating an index with integrated embeddings, these models
 * are available for automatic text-to-vector conversion.
 * 
 * - **llama-text-embed-v2**: Dense embeddings, configurable dimensions
 * - **multilingual-e5-large**: Dense embeddings, fixed 1024 dimensions
 * - **pinecone-sparse-english-v0**: Sparse embeddings for keyword search
 * 
 * @see https://docs.pinecone.io/guides/index-data/create-an-index#embedding-models
 */
export const EMBEDDING_MODELS: readonly EmbeddingModelConfig[] = [
    {
        name: 'llama-text-embed-v2',
        label: 'Llama Text Embed v2',
        isSparse: false,
        dimensions: [384, 512, 768, 1024, 2048],
        defaultDimension: 1024,
        defaultMetric: 'cosine'
    },
    {
        name: 'multilingual-e5-large',
        label: 'Multilingual E5 Large',
        isSparse: false,
        dimensions: [1024],
        defaultDimension: 1024,
        defaultMetric: 'cosine'
    },
    {
        name: 'pinecone-sparse-english-v0',
        label: 'Pinecone Sparse English v0',
        isSparse: true,
        dimensions: [],
        defaultMetric: 'dotproduct'
    }
];

// ============================================================================
// Cloud Regions Configuration
// ============================================================================

/**
 * Available cloud regions by provider for serverless indexes.
 * 
 * These are the regions where Pinecone serverless indexes can be deployed.
 * The list should be updated when Pinecone adds support for new regions.
 * 
 * Properties:
 * - `label`: Region code used in API calls
 * - `description`: Human-readable region description
 * 
 * @see https://docs.pinecone.io/guides/indexes/create-an-index#serverless-indexes
 */
export const CLOUD_REGIONS: Record<string, Array<{ label: string; description: string }>> = {
    aws: [
        { label: 'us-east-1', description: 'N. Virginia' },
        { label: 'us-west-2', description: 'Oregon' },
        { label: 'eu-west-1', description: 'Ireland' }
    ],
    gcp: [
        { label: 'us-central1', description: 'Iowa' },
        { label: 'europe-west4', description: 'Netherlands' }
    ],
    azure: [
        { label: 'eastus2', description: 'East US 2' }
    ]
};

// ============================================================================
// Authentication Constants
// ============================================================================

/**
 * Authentication context values.
 * These match the values used in the CLI's state.yaml file.
 * 
 * - NOT_AUTHENTICATED: No credentials configured
 * - USER_TOKEN: OAuth2 browser login (JWT)
 * - SERVICE_ACCOUNT: Client credentials (JWT)
 * - API_KEY: Direct API key (project-scoped)
 */
export const AUTH_CONTEXTS = {
    /** Not authenticated - no valid credentials */
    NOT_AUTHENTICATED: '',
    /** OAuth2 user token from browser login */
    USER_TOKEN: 'user_token',
    /** Service account client credentials */
    SERVICE_ACCOUNT: 'service_account',
    /** Direct API key (legacy, project-scoped) */
    API_KEY: 'default_api_key'
} as const;

/** Type for auth context values */
export type AuthContextValue = typeof AUTH_CONTEXTS[keyof typeof AUTH_CONTEXTS];

// ============================================================================
// Extension Constants
// ============================================================================

/**
 * Extension identifier used in VSCode.
 */
export const EXTENSION_ID = 'pinecone.pinecone-vscode';

/**
 * Local server port for OAuth callback.
 * Must match the port in redirectUri.
 */
export const OAUTH_CALLBACK_PORT = 59049;

/**
 * Maximum time to wait for OAuth callback completion.
 * If the browser flow is not completed within this window, login is aborted.
 */
export const OAUTH_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

// ============================================================================
// Polling Configuration
// ============================================================================

/**
 * Polling configuration for asynchronous operations.
 * 
 * Used for backup creation, index restoration, and other long-running
 * operations that require polling for completion status.
 * 
 * **Rationale for values:**
 * - MAX_WAIT_MS: 30 minutes allows for large backup/restore operations
 * - POLL_INTERVAL_MS: 5 seconds balances responsiveness with API limits
 * - REFRESH_DELAY_MS: 500ms allows UI to stabilize before refresh
 */
export const POLLING_CONFIG = {
    /** Maximum time to wait for an operation to complete (30 minutes) */
    MAX_WAIT_MS: 30 * 60 * 1000,
    /** Interval between status checks (5 seconds) */
    POLL_INTERVAL_MS: 5000,
    /** Delay before refreshing tree view after operation (500ms) */
    REFRESH_DELAY_MS: 500
} as const;

// Note: getErrorMessage utility has been moved to errorHandling.ts
// for centralized error handling with PineconeApiError support.
