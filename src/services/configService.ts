/**
 * Configuration Service
 * 
 * Manages Pinecone configuration files stored in ~/.config/pinecone/.
 * Maintains compatibility with the Pinecone CLI by using the same
 * file format and locations.
 * 
 * Configuration files:
 * - secrets.yaml: OAuth tokens, API keys, service account credentials
 * - state.yaml: Current auth context, target project/org
 * - config.yaml: User preferences and settings
 * 
 * @see https://docs.pinecone.io/guides/getting-started/authentication
 */

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { SECRETS_FILE, STATE_FILE, CONFIG_FILE, PINECONE_CONFIG_DIR } from '../utils/constants';
import { createComponentLogger } from '../utils/logger';
import { SecretsConfig } from './authService';

/** Logger for ConfigService operations */
const log = createComponentLogger('ConfigService');

/**
 * Target organization context (CLI-compatible).
 * Stored in state.yaml to track the currently selected organization.
 */
export interface TargetOrganization {
    /** Organization display name */
    name: string;
    /** Unique organization identifier */
    id: string;
}

/**
 * Target project context (CLI-compatible).
 * Stored in state.yaml to track the currently selected project.
 */
export interface TargetProject {
    /** Project display name */
    name: string;
    /** Unique project identifier */
    id: string;
}

/**
 * Structure of the state.yaml configuration file.
 * 
 * Maintains CLI compatibility by using the same field names and structure
 * as the Pinecone CLI. This allows credentials configured via CLI to work
 * in the extension and vice versa.
 */
export interface StateConfig {
    /** Current user authentication context */
    user_context?: {
        /** Authentication method in use */
        auth_context: string;
        /** User email (for OAuth login) */
        email?: string;
    } | string;
    /** 
     * Currently targeted organization (CLI-compatible).
     * Contains both name and ID for display and API calls.
     */
    target_org?: TargetOrganization;
    /** 
     * Currently targeted project (CLI-compatible).
     * Contains both name and ID for API calls requiring x-project-id header.
     */
    target_project?: TargetProject;
}

/**
 * Structure of the config.yaml configuration file.
 */
export interface AppConfig {
    /** Default region for new resources */
    default_region?: string;
    /** Output format preference */
    output_format?: 'json' | 'table';
    /** Telemetry opt-out flag */
    telemetry_disabled?: boolean;
}

/**
 * Service for managing Pinecone CLI-compatible configuration files.
 * 
 * All configuration is stored in YAML format in ~/.config/pinecone/.
 * The secrets.yaml file is created with restricted permissions (0600)
 * to protect sensitive credentials.
 * 
 * @example
 * ```typescript
 * const configService = new ConfigService();
 * 
 * // Read current secrets
 * const secrets = configService.getSecrets();
 * 
 * // Update API key
 * secrets.api_key = 'pk-...';
 * configService.saveSecrets(secrets);
 * ```
 */
export class ConfigService {
    /**
     * Creates a new ConfigService instance.
     * Ensures the configuration directory exists.
     */
    constructor() {
        this.ensureConfigDir();
    }

    /**
     * Ensures the Pinecone configuration directory exists.
     * Creates it recursively if needed.
     */
    private ensureConfigDir(): void {
        if (!fs.existsSync(PINECONE_CONFIG_DIR)) {
            fs.mkdirSync(PINECONE_CONFIG_DIR, { recursive: true });
        }
    }

    /**
     * Reads and parses a YAML configuration file.
     * 
     * @typeParam T - Expected type of the parsed content
     * @param filePath - Path to the YAML file
     * @returns Parsed file contents, or undefined if file doesn't exist
     */
    private readFile<T>(filePath: string): T | undefined {
        if (fs.existsSync(filePath)) {
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                return yaml.load(content) as T;
            } catch (error: unknown) {
                log.error(`Failed to read file ${filePath}:`, error);
                return undefined;
            }
        }
        return undefined;
    }

    /**
     * Writes data to a YAML configuration file.
     * 
     * @param filePath - Path to the YAML file
     * @param data - Data to serialize and write
     * @param mode - Optional file permissions (e.g., 0o600 for secrets)
     */
    private writeFile(filePath: string, data: Record<string, unknown>, mode?: number): void {
        try {
            const yamlStr = yaml.dump(data);
            fs.writeFileSync(filePath, yamlStr, { mode });
        } catch (error: unknown) {
            log.error(`Failed to write file ${filePath}:`, error);
        }
    }

    /**
     * Reads the secrets configuration file.
     * 
     * Contains sensitive credentials like OAuth tokens, API keys,
     * and service account credentials.
     * 
     * @returns Secrets configuration object
     */
    getSecrets(): SecretsConfig {
        return this.readFile<SecretsConfig>(SECRETS_FILE) || {};
    }

    /**
     * Saves the secrets configuration file.
     * 
     * File is written with mode 0600 (owner read/write only)
     * to protect sensitive credentials.
     * 
     * @param secrets - Secrets configuration to save
     */
    saveSecrets(secrets: SecretsConfig): void {
        this.writeFile(SECRETS_FILE, secrets as Record<string, unknown>, 0o600);
    }

    /**
     * Reads the state configuration file.
     * 
     * Contains current session state like auth context and
     * target project/organization.
     * 
     * @returns State configuration object
     */
    getState(): StateConfig {
        return this.readFile<StateConfig>(STATE_FILE) || {};
    }

    /**
     * Saves the state configuration file.
     * 
     * @param state - State configuration to save
     */
    saveState(state: StateConfig): void {
        this.writeFile(STATE_FILE, state as Record<string, unknown>);
    }

    /**
     * Reads the application configuration file.
     * 
     * Contains user preferences like default region and
     * output format settings.
     * 
     * @returns Application configuration object
     */
    getConfig(): AppConfig {
        return this.readFile<AppConfig>(CONFIG_FILE) || {};
    }

    /**
     * Saves the application configuration file.
     * 
     * @param config - Application configuration to save
     */
    saveConfig(config: AppConfig): void {
        this.writeFile(CONFIG_FILE, config as Record<string, unknown>);
    }

    // ========================================================================
    // Target Organization/Project Helpers
    // ========================================================================

    /**
     * Gets the currently targeted organization from state.
     * 
     * @returns Target organization or undefined if not set
     */
    getTargetOrganization(): TargetOrganization | undefined {
        const state = this.getState();
        return state.target_org;
    }

    /**
     * Sets the targeted organization in state.
     * 
     * When the organization changes, the target project is cleared
     * since projects are scoped to organizations.
     * 
     * @param org - Organization to target, or undefined to clear
     */
    setTargetOrganization(org: TargetOrganization | undefined): void {
        const state = this.getState();
        const previousOrgId = state.target_org?.id;
        
        state.target_org = org;
        
        // Clear project if organization changed (projects are org-scoped)
        if (org?.id !== previousOrgId) {
            state.target_project = undefined;
        }
        
        this.saveState(state);
    }

    /**
     * Gets the currently targeted project from state.
     * 
     * @returns Target project or undefined if not set
     */
    getTargetProject(): TargetProject | undefined {
        const state = this.getState();
        return state.target_project;
    }

    /**
     * Sets the targeted project in state.
     * 
     * @param project - Project to target, or undefined to clear
     */
    setTargetProject(project: TargetProject | undefined): void {
        const state = this.getState();
        state.target_project = project;
        this.saveState(state);
    }

    /**
     * Clears the target organization and project from state.
     * Called when the user logs out.
     */
    clearTargetContext(): void {
        const state = this.getState();
        state.target_org = undefined;
        state.target_project = undefined;
        this.saveState(state);
    }
}
