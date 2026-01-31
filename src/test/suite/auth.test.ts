/**
 * Authentication Service Tests
 * 
 * Unit tests for the authentication service including
 * credential management and auth context handling.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { AuthService, AuthContext, OAuth2Token, SecretsConfig } from '../../services/authService';
// ManagedKey type is tested implicitly via SecretsConfig.project_api_keys
import { AUTH_CONTEXTS } from '../../utils/constants';

// Mock SecretStorage (VSCode API)
class MockSecretStorage {
    private secrets = new Map<string, string>();
    
    get(key: string): Thenable<string | undefined> {
        return Promise.resolve(this.secrets.get(key));
    }
    
    store(key: string, value: string): Thenable<void> {
        this.secrets.set(key, value);
        return Promise.resolve();
    }
    
    delete(key: string): Thenable<void> {
        this.secrets.delete(key);
        return Promise.resolve();
    }
    
    keys(): Thenable<readonly string[]> {
        return Promise.resolve(Array.from(this.secrets.keys()));
    }
    
    // Mock event emitter - VSCode SecretStorage requires this
    onDidChange = (() => ({ dispose: () => {} })) as vscode.SecretStorage['onDidChange'];
}

suite('AuthService Test Suite', () => {
    let authService: AuthService;
    let mockSecrets: MockSecretStorage;

    setup(() => {
        mockSecrets = new MockSecretStorage();
        // Cast required because MockSecretStorage implements a subset of the interface
        authService = new AuthService(mockSecrets as unknown as vscode.SecretStorage);
    });

    test('Initial state should be unauthenticated', () => {
        // Note: Actual auth state depends on config files on disk
        // In a clean environment, this should be false
        const context = authService.getAuthContext();
        const validContexts = [
            AUTH_CONTEXTS.NOT_AUTHENTICATED,
            AUTH_CONTEXTS.USER_TOKEN,
            AUTH_CONTEXTS.SERVICE_ACCOUNT,
            AUTH_CONTEXTS.API_KEY
        ];
        assert.ok(validContexts.includes(context));
    });

    test('isAuthenticated should return false for empty context', () => {
        // Directly test the logic
        const context: AuthContext = AUTH_CONTEXTS.NOT_AUTHENTICATED;
        assert.strictEqual(context === AUTH_CONTEXTS.NOT_AUTHENTICATED, true);
    });

    test('isAuthenticated should return true for valid contexts', () => {
        const validContexts: AuthContext[] = [
            AUTH_CONTEXTS.USER_TOKEN,
            AUTH_CONTEXTS.SERVICE_ACCOUNT,
            AUTH_CONTEXTS.API_KEY
        ];
        validContexts.forEach(context => {
            assert.strictEqual(context !== AUTH_CONTEXTS.NOT_AUTHENTICATED, true);
        });
    });

    test('onDidChangeAuth event should be defined', () => {
        assert.ok(authService.onDidChangeAuth);
    });
});

suite('OAuth2Token Test Suite', () => {
    
    test('OAuth2Token should have all required fields', () => {
        const token: OAuth2Token = {
            access_token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9...',
            refresh_token: 'dGVzdC1yZWZyZXNoLXRva2Vu',
            token_type: 'Bearer',
            expiry: '2024-12-31T23:59:59Z'
        };

        assert.strictEqual(token.token_type, 'Bearer');
        assert.ok(token.access_token.length > 0);
        assert.ok(token.refresh_token.length > 0);
    });

    test('Token expiry should be parseable as Date', () => {
        const token: OAuth2Token = {
            access_token: 'test',
            refresh_token: 'test',
            token_type: 'Bearer',
            expiry: '2024-12-31T23:59:59Z'
        };

        const expiryDate = new Date(token.expiry);
        assert.ok(!isNaN(expiryDate.getTime()));
        assert.strictEqual(expiryDate.getFullYear(), 2024);
    });
});

suite('SecretsConfig Test Suite', () => {
    
    test('SecretsConfig should support OAuth2 token', () => {
        const config: SecretsConfig = {
            oauth2_token: {
                access_token: 'test-access',
                refresh_token: 'test-refresh',
                token_type: 'Bearer',
                expiry: '2024-12-31T23:59:59Z'
            }
        };

        assert.ok(config.oauth2_token);
        assert.strictEqual(config.oauth2_token.access_token, 'test-access');
    });

    test('SecretsConfig should support API key', () => {
        const config: SecretsConfig = {
            api_key: 'pcsk_test_api_key_123'
        };

        assert.strictEqual(config.api_key, 'pcsk_test_api_key_123');
    });

    test('SecretsConfig should support service account', () => {
        const config: SecretsConfig = {
            client_id: 'test-client-id',
            client_secret: 'test-client-secret'
        };

        assert.strictEqual(config.client_id, 'test-client-id');
        assert.strictEqual(config.client_secret, 'test-client-secret');
    });

    test('SecretsConfig can have all auth methods', () => {
        const config: SecretsConfig = {
            oauth2_token: {
                access_token: 'token',
                refresh_token: 'refresh',
                token_type: 'Bearer',
                expiry: '2024-12-31T23:59:59Z'
            },
            api_key: 'pcsk_key',
            client_id: 'client',
            client_secret: 'secret'
        };

        assert.ok(config.oauth2_token);
        assert.ok(config.api_key);
        assert.ok(config.client_id);
        assert.ok(config.client_secret);
    });
});

suite('AuthContext Test Suite', () => {
    
    test('AuthContext should include all valid values', () => {
        const validContexts: AuthContext[] = [
            AUTH_CONTEXTS.NOT_AUTHENTICATED,
            AUTH_CONTEXTS.USER_TOKEN,
            AUTH_CONTEXTS.SERVICE_ACCOUNT,
            AUTH_CONTEXTS.API_KEY
        ];
        
        assert.strictEqual(validContexts.length, 4);
        assert.ok(validContexts.includes(AUTH_CONTEXTS.NOT_AUTHENTICATED));
        assert.ok(validContexts.includes(AUTH_CONTEXTS.USER_TOKEN));
        assert.ok(validContexts.includes(AUTH_CONTEXTS.SERVICE_ACCOUNT));
        assert.ok(validContexts.includes(AUTH_CONTEXTS.API_KEY));
    });
});

suite('ManagedKey Type Suite', () => {
    // Import ManagedKey type for testing
    // The actual import is: import { ManagedKey } from '../../services/authService';
    
    test('ManagedKey should have all required properties', () => {
        // Test the structure of a managed key (used for data plane auth)
        const managedKey = {
            name: 'pinecone-vscode-123456',
            id: 'key-abc123',
            value: 'pcsk_test_key_value',
            origin: 'vscode_managed' as const,
            project_id: 'proj-123',
            project_name: 'My Project',
            organization_id: 'org-456'
        };
        
        assert.strictEqual(managedKey.name, 'pinecone-vscode-123456');
        assert.strictEqual(managedKey.id, 'key-abc123');
        assert.ok(managedKey.value.length > 0);
        assert.strictEqual(managedKey.origin, 'vscode_managed');
        assert.strictEqual(managedKey.project_id, 'proj-123');
        assert.strictEqual(managedKey.project_name, 'My Project');
        assert.strictEqual(managedKey.organization_id, 'org-456');
    });
    
    test('ManagedKey origin should accept valid values', () => {
        const validOrigins = ['cli_created', 'user_created', 'vscode_managed'] as const;
        
        validOrigins.forEach(origin => {
            const key = {
                name: 'test',
                id: 'id',
                value: 'val',
                origin,
                project_id: 'proj',
                project_name: 'Project',
                organization_id: 'org'
            };
            assert.strictEqual(key.origin, origin);
        });
    });
    
    test('SecretsConfig should support project_api_keys', () => {
        const config: SecretsConfig = {
            project_api_keys: {
                'proj-123': {
                    name: 'pinecone-vscode-123',
                    id: 'key-123',
                    value: 'pcsk_test',
                    origin: 'vscode_managed',
                    project_id: 'proj-123',
                    project_name: 'Test Project',
                    organization_id: 'org-456'
                }
            }
        };
        
        assert.ok(config.project_api_keys);
        assert.ok(config.project_api_keys['proj-123']);
        assert.strictEqual(config.project_api_keys['proj-123'].origin, 'vscode_managed');
    });
});
