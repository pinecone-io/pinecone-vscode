/**
 * API Client Unit Tests
 * 
 * Tests for the Pinecone API client with mocked HTTP responses.
 * Uses dependency injection to provide mock fetch function and mock AuthService.
 * Verifies request formatting, error handling, and response parsing.
 */

import * as assert from 'assert';
import { PineconeClient, PineconeApiError, FetchFunction } from '../../api/client';
import { AuthService, AuthContext } from '../../services/authService';
import { Response } from 'node-fetch';
import { AUTH_CONTEXTS } from '../../utils/constants';

/**
 * Captured call information for assertion verification.
 */
interface CapturedCall {
    url: string;
    options: {
        method?: string;
        headers?: Record<string, string>;
        body?: unknown;
    };
}

/**
 * Mock AuthService for testing.
 * Allows controlling the auth context and token returned.
 */
class MockAuthService {
    private _authContext: AuthContext = AUTH_CONTEXTS.API_KEY;
    private _token: string = 'test-api-key';

    setAuthContext(context: AuthContext): void {
        this._authContext = context;
    }

    setToken(token: string): void {
        this._token = token;
    }

    getAuthContext(): AuthContext {
        return this._authContext;
    }

    async getAccessToken(): Promise<string> {
        return this._token;
    }
}

/**
 * Mock fetch implementation for testing.
 * 
 * Allows setting up canned responses for URL patterns and captures
 * all calls for assertion verification.
 */
class MockFetch {
    private responses: Map<string, { status: number; body: unknown }> = new Map();
    public calls: CapturedCall[] = [];

    /**
     * Sets up a canned response for requests matching a URL pattern.
     */
    setResponse(urlPattern: string, status: number, body: unknown): void {
        this.responses.set(urlPattern, { status, body });
    }

    /**
     * The mock fetch function - matches FetchFunction signature.
     * Pass this to PineconeClient constructor for testing.
     */
    fetch: FetchFunction = async (url, init) => {
        // Capture the call with normalized options
        const capturedOptions: CapturedCall['options'] = {};
        if (init) {
            capturedOptions.method = init.method;
            capturedOptions.body = init.body;
            // Convert headers to Record<string, string> for easy assertion
            if (init.headers) {
                capturedOptions.headers = init.headers as Record<string, string>;
            }
        }
        this.calls.push({ url, options: capturedOptions });
        
        // Find matching response by URL pattern
        for (const [pattern, response] of this.responses) {
            if (url.includes(pattern)) {
                return {
                    ok: response.status >= 200 && response.status < 300,
                    status: response.status,
                    statusText: response.status === 200 ? 'OK' : 'Error',
                    json: async () => response.body,
                    text: async () => JSON.stringify(response.body)
                } as unknown as Response;
            }
        }
        
        // Default 404 for unmatched URLs
        return {
            ok: false,
            status: 404,
            statusText: 'Not Found',
            json: async () => ({ error: 'Not found' }),
            text: async () => 'Not found'
        } as unknown as Response;
    };

    /**
     * Resets the mock state between tests.
     */
    reset(): void {
        this.responses.clear();
        this.calls = [];
    }
}

suite('PineconeClient Test Suite', () => {
    let mockFetch: MockFetch;
    let mockAuthService: MockAuthService;

    setup(() => {
        mockFetch = new MockFetch();
        mockAuthService = new MockAuthService();
    });

    teardown(() => {
        mockFetch.reset();
    });

    test('should include Api-Key header for API key auth', async () => {
        // Inject mock fetch and auth service via constructor
        mockAuthService.setAuthContext(AUTH_CONTEXTS.API_KEY);
        mockAuthService.setToken('test-api-key');
        
        const client = new PineconeClient(
            mockAuthService as unknown as AuthService,
            mockFetch.fetch
        );
        mockFetch.setResponse('/indexes', 200, { indexes: [] });

        await client.request('GET', '/indexes');

        assert.strictEqual(mockFetch.calls.length, 1);
        const headers = mockFetch.calls[0].options.headers as Record<string, string>;
        assert.strictEqual(headers['Api-Key'], 'test-api-key');
        assert.strictEqual(headers['Authorization'], undefined);
    });

    test('should include Bearer token for JWT auth', async () => {
        mockAuthService.setAuthContext(AUTH_CONTEXTS.USER_TOKEN);
        mockAuthService.setToken('jwt-access-token');
        
        const client = new PineconeClient(
            mockAuthService as unknown as AuthService,
            mockFetch.fetch
        );
        mockFetch.setResponse('/indexes', 200, { indexes: [] });

        await client.request('GET', '/indexes');

        const headers = mockFetch.calls[0].options.headers as Record<string, string>;
        assert.strictEqual(headers['Authorization'], 'Bearer jwt-access-token');
        assert.strictEqual(headers['Api-Key'], undefined);
    });

    test('should include X-Project-Id header for JWT auth when project is set', async () => {
        mockAuthService.setAuthContext(AUTH_CONTEXTS.USER_TOKEN);
        mockAuthService.setToken('jwt-token');
        
        const client = new PineconeClient(
            mockAuthService as unknown as AuthService,
            mockFetch.fetch
        );
        client.setProjectId('proj-123');
        mockFetch.setResponse('/indexes', 200, { indexes: [] });

        await client.request('GET', '/indexes');

        const headers = mockFetch.calls[0].options.headers as Record<string, string>;
        assert.strictEqual(headers['X-Project-Id'], 'proj-123');
    });

    test('should include content-type for JSON requests', async () => {
        const client = new PineconeClient(
            mockAuthService as unknown as AuthService,
            mockFetch.fetch
        );
        mockFetch.setResponse('/indexes', 200, { name: 'test' });

        await client.request('POST', '/indexes', {
            body: { name: 'test-index' }
        });

        const headers = mockFetch.calls[0].options.headers as Record<string, string>;
        assert.strictEqual(headers['Content-Type'], 'application/json');
    });

    test('should throw PineconeApiError on 401', async () => {
        mockAuthService.setToken('invalid-key');
        
        const client = new PineconeClient(
            mockAuthService as unknown as AuthService,
            mockFetch.fetch
        );
        mockFetch.setResponse('/indexes', 401, { error: 'Unauthorized' });

        try {
            await client.request('GET', '/indexes');
            assert.fail('Should have thrown');
        } catch (error) {
            assert.ok(error instanceof PineconeApiError);
            assert.strictEqual((error as PineconeApiError).status, 401);
        }
    });

    test('should throw PineconeApiError on 404', async () => {
        const client = new PineconeClient(
            mockAuthService as unknown as AuthService,
            mockFetch.fetch
        );
        mockFetch.setResponse('/indexes/nonexistent', 404, { error: 'Index not found' });

        try {
            await client.request('GET', '/indexes/nonexistent');
            assert.fail('Should have thrown');
        } catch (error) {
            assert.ok(error instanceof PineconeApiError);
            assert.strictEqual((error as PineconeApiError).status, 404);
        }
    });

    test('should throw PineconeApiError on 500', async () => {
        const client = new PineconeClient(
            mockAuthService as unknown as AuthService,
            mockFetch.fetch
        );
        mockFetch.setResponse('/indexes', 500, { error: 'Internal server error' });

        try {
            await client.request('GET', '/indexes');
            assert.fail('Should have thrown');
        } catch (error) {
            assert.ok(error instanceof PineconeApiError);
            assert.strictEqual((error as PineconeApiError).status, 500);
        }
    });

    test('should parse JSON response correctly', async () => {
        const client = new PineconeClient(
            mockAuthService as unknown as AuthService,
            mockFetch.fetch
        );
        const expectedData = {
            indexes: [
                { name: 'index-1', dimension: 1536 },
                { name: 'index-2', dimension: 768 }
            ]
        };
        mockFetch.setResponse('/indexes', 200, expectedData);

        const result = await client.request('GET', '/indexes');

        assert.deepStrictEqual(result, expectedData);
    });

    test('should handle empty response body', async () => {
        const client = new PineconeClient(
            mockAuthService as unknown as AuthService,
            mockFetch.fetch
        );
        mockFetch.setResponse('/indexes/test', 204, null);

        // 204 should not throw and return empty object
        const result = await client.request('DELETE', '/indexes/test');
        assert.deepStrictEqual(result, {});
    });

    test('should handle 200 OK with empty body (e.g., DELETE operations)', async () => {
        // Some APIs return 200 with empty body instead of 204
        // The client should handle this gracefully without JSON parse errors
        
        // Create a custom fetch that returns 200 with empty body
        const emptyBodyFetch: FetchFunction = async (url) => {
            if (url.includes('/indexes/test-index')) {
                return {
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    text: async () => '',  // Empty body
                    json: async () => { throw new Error('Unexpected end of JSON input'); }
                } as unknown as Response;
            }
            return {
                ok: false,
                status: 404,
                statusText: 'Not Found',
                text: async () => 'Not found',
                json: async () => ({ error: 'Not found' })
            } as unknown as Response;
        };

        const client = new PineconeClient(
            mockAuthService as unknown as AuthService,
            emptyBodyFetch
        );

        // Should not throw JSON parse error
        const result = await client.request('DELETE', '/indexes/test-index');
        assert.deepStrictEqual(result, {});
    });
});

suite('Request Formatting Test Suite', () => {
    let mockFetch: MockFetch;
    let mockAuthService: MockAuthService;

    setup(() => {
        mockFetch = new MockFetch();
        mockAuthService = new MockAuthService();
    });

    teardown(() => {
        mockFetch.reset();
    });

    test('should send correct method for GET requests', async () => {
        const client = new PineconeClient(
            mockAuthService as unknown as AuthService,
            mockFetch.fetch
        );
        mockFetch.setResponse('/test', 200, {});

        await client.request('GET', '/test');

        assert.strictEqual(mockFetch.calls[0].options.method, 'GET');
    });

    test('should send correct method for POST requests', async () => {
        const client = new PineconeClient(
            mockAuthService as unknown as AuthService,
            mockFetch.fetch
        );
        mockFetch.setResponse('/test', 200, {});

        await client.request('POST', '/test', { 
            body: { data: 'test' }
        });

        assert.strictEqual(mockFetch.calls[0].options.method, 'POST');
        assert.ok(mockFetch.calls[0].options.body);
    });

    test('should send correct method for DELETE requests', async () => {
        const client = new PineconeClient(
            mockAuthService as unknown as AuthService,
            mockFetch.fetch
        );
        mockFetch.setResponse('/test', 200, {});

        await client.request('DELETE', '/test');

        assert.strictEqual(mockFetch.calls[0].options.method, 'DELETE');
    });

    test('should send correct method for PATCH requests', async () => {
        const client = new PineconeClient(
            mockAuthService as unknown as AuthService,
            mockFetch.fetch
        );
        mockFetch.setResponse('/test', 200, {});

        await client.request('PATCH', '/test', { 
            body: { update: 'value' }
        });

        assert.strictEqual(mockFetch.calls[0].options.method, 'PATCH');
    });
});
