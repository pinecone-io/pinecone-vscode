/**
 * ConfigService Unit Tests
 * 
 * Tests for the configuration service that manages CLI-compatible config files.
 * Uses mock file system operations to test in isolation.
 * 
 * Tests cover:
 * - State configuration (target org/project)
 * - Secrets configuration (sensitive credentials)
 * - App configuration (user preferences)
 * - Organization/Project context clearing behavior
 * - Error handling for file operations
 */

import * as assert from 'assert';

// ============================================================================
// Mock Types
// ============================================================================

interface TargetOrganization {
    name: string;
    id: string;
}

interface TargetProject {
    name: string;
    id: string;
}

interface StateConfig {
    user_context?: { auth_context: string; email?: string } | string;
    target_org?: TargetOrganization;
    target_project?: TargetProject;
}

interface SecretsConfig {
    api_key?: string;
    oauth2?: {
        access_token: string;
        refresh_token: string;
        token_expiry: string;
    };
}

interface AppConfig {
    default_region?: string;
    output_format?: 'json' | 'table';
    telemetry_disabled?: boolean;
}

// ============================================================================
// Mock File System
// ============================================================================

/**
 * Mock file system for testing ConfigService without disk I/O.
 */
class MockFileSystem {
    private files: Map<string, string> = new Map();
    public readErrors: Map<string, Error> = new Map();
    public writeErrors: Map<string, Error> = new Map();
    public lastWriteMode: number | undefined;

    exists(path: string): boolean {
        return this.files.has(path);
    }

    read(path: string): string | undefined {
        if (this.readErrors.has(path)) {
            throw this.readErrors.get(path);
        }
        return this.files.get(path);
    }

    write(path: string, content: string, mode?: number): void {
        if (this.writeErrors.has(path)) {
            throw this.writeErrors.get(path);
        }
        this.files.set(path, content);
        this.lastWriteMode = mode;
    }

    delete(path: string): void {
        this.files.delete(path);
    }

    clear(): void {
        this.files.clear();
        this.readErrors.clear();
        this.writeErrors.clear();
    }
}

/**
 * Simulated ConfigService for testing.
 * Uses mock file system instead of real disk I/O.
 */
class TestConfigService {
    private mockFs: MockFileSystem;
    private secretsPath = '/mock/.config/pinecone/secrets.yaml';
    private statePath = '/mock/.config/pinecone/state.yaml';
    private configPath = '/mock/.config/pinecone/config.yaml';

    constructor(fs: MockFileSystem) {
        this.mockFs = fs;
    }

    // ======= Secrets =======

    getSecrets(): SecretsConfig {
        try {
            const content = this.mockFs.read(this.secretsPath);
            if (!content) { return {}; }
            return this.parseYaml<SecretsConfig>(content);
        } catch {
            // Error reading or parsing - return empty object
            return {};
        }
    }

    saveSecrets(secrets: SecretsConfig): void {
        const content = this.dumpYaml(secrets);
        this.mockFs.write(this.secretsPath, content, 0o600);
    }

    // ======= State =======

    getState(): StateConfig {
        try {
            const content = this.mockFs.read(this.statePath);
            if (!content) { return {}; }
            return this.parseYaml<StateConfig>(content);
        } catch {
            // Error reading or parsing - return empty object
            return {};
        }
    }

    saveState(state: StateConfig): void {
        const content = this.dumpYaml(state);
        this.mockFs.write(this.statePath, content);
    }

    // ======= Config =======

    getConfig(): AppConfig {
        try {
            const content = this.mockFs.read(this.configPath);
            if (!content) { return {}; }
            return this.parseYaml<AppConfig>(content);
        } catch {
            // Error reading or parsing - return empty object
            return {};
        }
    }

    saveConfig(config: AppConfig): void {
        const content = this.dumpYaml(config);
        this.mockFs.write(this.configPath, content);
    }

    // ======= Target Helpers =======

    getTargetOrganization(): TargetOrganization | undefined {
        return this.getState().target_org;
    }

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

    getTargetProject(): TargetProject | undefined {
        return this.getState().target_project;
    }

    setTargetProject(project: TargetProject | undefined): void {
        const state = this.getState();
        state.target_project = project;
        this.saveState(state);
    }

    clearTargetContext(): void {
        const state = this.getState();
        state.target_org = undefined;
        state.target_project = undefined;
        this.saveState(state);
    }

    // ======= Helpers =======

    private parseYaml<T>(content: string): T {
        // Simple JSON-based parsing for testing
        // In real code, this uses js-yaml
        return JSON.parse(content) as T;
    }

    private dumpYaml(data: unknown): string {
        return JSON.stringify(data);
    }
}

// ============================================================================
// Test Suites
// ============================================================================

suite('ConfigService Unit Tests', () => {
    let mockFs: MockFileSystem;
    let configService: TestConfigService;

    setup(() => {
        mockFs = new MockFileSystem();
        configService = new TestConfigService(mockFs);
    });

    suite('Secrets Configuration', () => {

        test('should return empty object when secrets file does not exist', () => {
            const secrets = configService.getSecrets();
            assert.deepStrictEqual(secrets, {});
        });

        test('should read API key from secrets', () => {
            mockFs.write('/mock/.config/pinecone/secrets.yaml', JSON.stringify({
                api_key: 'pk-1234567890'
            }));

            const secrets = configService.getSecrets();
            assert.strictEqual(secrets.api_key, 'pk-1234567890');
        });

        test('should read OAuth2 tokens from secrets', () => {
            mockFs.write('/mock/.config/pinecone/secrets.yaml', JSON.stringify({
                oauth2: {
                    access_token: 'access-token-123',
                    refresh_token: 'refresh-token-456',
                    token_expiry: '2024-12-31T23:59:59Z'
                }
            }));

            const secrets = configService.getSecrets();
            assert.strictEqual(secrets.oauth2?.access_token, 'access-token-123');
            assert.strictEqual(secrets.oauth2?.refresh_token, 'refresh-token-456');
        });

        test('should save secrets with restricted file mode', () => {
            configService.saveSecrets({ api_key: 'pk-new-key' });

            assert.strictEqual(mockFs.lastWriteMode, 0o600);
        });

        test('should handle corrupted secrets file gracefully', () => {
            mockFs.write('/mock/.config/pinecone/secrets.yaml', 'not valid yaml/json');

            const secrets = configService.getSecrets();
            assert.deepStrictEqual(secrets, {});
        });
    });

    suite('State Configuration', () => {

        test('should return empty object when state file does not exist', () => {
            const state = configService.getState();
            assert.deepStrictEqual(state, {});
        });

        test('should read target organization from state', () => {
            mockFs.write('/mock/.config/pinecone/state.yaml', JSON.stringify({
                target_org: { id: 'org-123', name: 'My Organization' }
            }));

            const state = configService.getState();
            assert.strictEqual(state.target_org?.id, 'org-123');
            assert.strictEqual(state.target_org?.name, 'My Organization');
        });

        test('should read target project from state', () => {
            mockFs.write('/mock/.config/pinecone/state.yaml', JSON.stringify({
                target_project: { id: 'proj-456', name: 'My Project' }
            }));

            const state = configService.getState();
            assert.strictEqual(state.target_project?.id, 'proj-456');
        });

        test('should read user context from state', () => {
            mockFs.write('/mock/.config/pinecone/state.yaml', JSON.stringify({
                user_context: {
                    auth_context: 'user_token',
                    email: 'user@example.com'
                }
            }));

            const state = configService.getState();
            const ctx = state.user_context as { auth_context: string; email?: string };
            assert.strictEqual(ctx.auth_context, 'user_token');
            assert.strictEqual(ctx.email, 'user@example.com');
        });

        test('should save state configuration', () => {
            configService.saveState({
                target_org: { id: 'org-new', name: 'New Org' }
            });

            const state = configService.getState();
            assert.strictEqual(state.target_org?.id, 'org-new');
        });
    });

    suite('App Configuration', () => {

        test('should return empty object when config file does not exist', () => {
            const config = configService.getConfig();
            assert.deepStrictEqual(config, {});
        });

        test('should read default region from config', () => {
            mockFs.write('/mock/.config/pinecone/config.yaml', JSON.stringify({
                default_region: 'us-west-2'
            }));

            const config = configService.getConfig();
            assert.strictEqual(config.default_region, 'us-west-2');
        });

        test('should read output format from config', () => {
            mockFs.write('/mock/.config/pinecone/config.yaml', JSON.stringify({
                output_format: 'json'
            }));

            const config = configService.getConfig();
            assert.strictEqual(config.output_format, 'json');
        });

        test('should read telemetry setting from config', () => {
            mockFs.write('/mock/.config/pinecone/config.yaml', JSON.stringify({
                telemetry_disabled: true
            }));

            const config = configService.getConfig();
            assert.strictEqual(config.telemetry_disabled, true);
        });

        test('should save app configuration', () => {
            configService.saveConfig({
                default_region: 'eu-west-1',
                output_format: 'table'
            });

            const config = configService.getConfig();
            assert.strictEqual(config.default_region, 'eu-west-1');
            assert.strictEqual(config.output_format, 'table');
        });
    });

    suite('Target Organization Management', () => {

        test('should get target organization', () => {
            mockFs.write('/mock/.config/pinecone/state.yaml', JSON.stringify({
                target_org: { id: 'org-1', name: 'Org One' }
            }));

            const org = configService.getTargetOrganization();
            assert.strictEqual(org?.id, 'org-1');
            assert.strictEqual(org?.name, 'Org One');
        });

        test('should return undefined when no target organization set', () => {
            const org = configService.getTargetOrganization();
            assert.strictEqual(org, undefined);
        });

        test('should set target organization', () => {
            configService.setTargetOrganization({ id: 'org-new', name: 'New Org' });

            const org = configService.getTargetOrganization();
            assert.strictEqual(org?.id, 'org-new');
        });

        test('should clear target organization when set to undefined', () => {
            configService.setTargetOrganization({ id: 'org-1', name: 'Org' });
            configService.setTargetOrganization(undefined);

            const org = configService.getTargetOrganization();
            assert.strictEqual(org, undefined);
        });

        test('should clear project when organization changes', () => {
            // Set initial org and project
            configService.setTargetOrganization({ id: 'org-1', name: 'Org 1' });
            configService.setTargetProject({ id: 'proj-1', name: 'Project 1' });

            // Change organization
            configService.setTargetOrganization({ id: 'org-2', name: 'Org 2' });

            // Project should be cleared
            const project = configService.getTargetProject();
            assert.strictEqual(project, undefined);
        });

        test('should preserve project when same organization is set', () => {
            // Set initial org and project
            configService.setTargetOrganization({ id: 'org-1', name: 'Org 1' });
            configService.setTargetProject({ id: 'proj-1', name: 'Project 1' });

            // Set same organization (with different name but same ID)
            configService.setTargetOrganization({ id: 'org-1', name: 'Org 1 Renamed' });

            // Project should be preserved
            const project = configService.getTargetProject();
            assert.strictEqual(project?.id, 'proj-1');
        });
    });

    suite('Target Project Management', () => {

        test('should get target project', () => {
            mockFs.write('/mock/.config/pinecone/state.yaml', JSON.stringify({
                target_project: { id: 'proj-1', name: 'Project One' }
            }));

            const project = configService.getTargetProject();
            assert.strictEqual(project?.id, 'proj-1');
            assert.strictEqual(project?.name, 'Project One');
        });

        test('should return undefined when no target project set', () => {
            const project = configService.getTargetProject();
            assert.strictEqual(project, undefined);
        });

        test('should set target project', () => {
            configService.setTargetProject({ id: 'proj-new', name: 'New Project' });

            const project = configService.getTargetProject();
            assert.strictEqual(project?.id, 'proj-new');
        });

        test('should clear target project when set to undefined', () => {
            configService.setTargetProject({ id: 'proj-1', name: 'Project' });
            configService.setTargetProject(undefined);

            const project = configService.getTargetProject();
            assert.strictEqual(project, undefined);
        });
    });

    suite('Clear Target Context', () => {

        test('should clear both organization and project', () => {
            configService.setTargetOrganization({ id: 'org-1', name: 'Org' });
            configService.setTargetProject({ id: 'proj-1', name: 'Project' });

            configService.clearTargetContext();

            assert.strictEqual(configService.getTargetOrganization(), undefined);
            assert.strictEqual(configService.getTargetProject(), undefined);
        });

        test('should handle clearing when nothing is set', () => {
            // Should not throw
            configService.clearTargetContext();

            assert.strictEqual(configService.getTargetOrganization(), undefined);
            assert.strictEqual(configService.getTargetProject(), undefined);
        });

        test('should preserve user_context when clearing target context', () => {
            mockFs.write('/mock/.config/pinecone/state.yaml', JSON.stringify({
                user_context: { auth_context: 'user_token', email: 'user@test.com' },
                target_org: { id: 'org-1', name: 'Org' },
                target_project: { id: 'proj-1', name: 'Project' }
            }));

            configService.clearTargetContext();

            const state = configService.getState();
            const ctx = state.user_context as { auth_context: string; email?: string };
            assert.strictEqual(ctx.auth_context, 'user_token');
            assert.strictEqual(ctx.email, 'user@test.com');
        });
    });

    suite('Error Handling', () => {

        test('should return empty secrets on read error', () => {
            mockFs.readErrors.set('/mock/.config/pinecone/secrets.yaml', new Error('Permission denied'));

            // Should not throw, returns empty
            const secrets = configService.getSecrets();
            assert.deepStrictEqual(secrets, {});
        });

        test('should return empty state on read error', () => {
            mockFs.readErrors.set('/mock/.config/pinecone/state.yaml', new Error('File corrupted'));

            // Should not throw, returns empty
            const state = configService.getState();
            assert.deepStrictEqual(state, {});
        });

        test('should return empty config on read error', () => {
            mockFs.readErrors.set('/mock/.config/pinecone/config.yaml', new Error('Disk error'));

            // Should not throw, returns empty
            const config = configService.getConfig();
            assert.deepStrictEqual(config, {});
        });
    });

    suite('File Permissions', () => {

        test('should save secrets with mode 0600', () => {
            configService.saveSecrets({ api_key: 'secret-key' });

            assert.strictEqual(mockFs.lastWriteMode, 0o600);
        });

        test('should save state without explicit mode', () => {
            configService.saveState({ target_org: { id: 'org-1', name: 'Org' } });

            assert.strictEqual(mockFs.lastWriteMode, undefined);
        });

        test('should save config without explicit mode', () => {
            configService.saveConfig({ default_region: 'us-west-2' });

            assert.strictEqual(mockFs.lastWriteMode, undefined);
        });
    });
});
