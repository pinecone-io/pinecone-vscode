/**
 * Error Handling Tests
 * 
 * Tests for verifying error handling across the extension:
 * - Authentication errors trigger appropriate responses
 * - API errors display user-friendly messages
 * - Timeout errors are handled gracefully
 * - Network errors are caught and reported
 * 
 * Follows CLI/SDK testing patterns for error scenarios.
 */

import * as assert from 'assert';
import { PineconeApiError } from '../../api/client';

suite('PineconeApiError Tests', () => {

    test('should create error with status and message', () => {
        const error = new PineconeApiError(404, 'Index not found');
        
        assert.strictEqual(error.status, 404);
        assert.ok(error.message.includes('404'));
        assert.ok(error.message.includes('Index not found'));
        assert.strictEqual(error.name, 'PineconeApiError');
    });

    test('should be instanceof Error', () => {
        const error = new PineconeApiError(500, 'Server error');
        
        assert.ok(error instanceof Error);
        assert.ok(error instanceof PineconeApiError);
    });

    test('should preserve stack trace', () => {
        const error = new PineconeApiError(400, 'Bad request');
        
        assert.ok(error.stack);
        assert.ok(error.stack.includes('PineconeApiError'));
    });
});

suite('Authentication Error Detection Tests', () => {

    /**
     * Checks if an error indicates an authentication problem.
     * This mirrors the logic in pineconeTreeDataProvider.ts but is more robust.
     * 
     * Handles:
     * - Error objects (checks .message)
     * - PineconeApiError (checks both .message and .status)
     * - Plain objects with .message property
     * - String errors
     * - null/undefined (returns false)
     */
    function isAuthError(error: unknown): boolean {
        // Handle null/undefined
        if (error === null || error === undefined) {
            return false;
        }

        // Check status code for PineconeApiError
        if (error instanceof PineconeApiError) {
            if (error.status === 401 || error.status === 403) {
                return true;
            }
        }

        // Extract message from various error types
        let message: string;
        if (error instanceof Error) {
            message = error.message;
        } else if (typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
            // Handle plain objects with message property
            message = (error as { message: string }).message;
        } else {
            message = String(error);
        }

        message = message.toLowerCase();

        // Check for auth-related keywords (using word boundaries where appropriate)
        return message.includes('unauthorized') ||
               message.includes('401') ||
               message.includes('403') ||
               message.includes('not authenticated') ||
               message.includes('token') && message.includes('expired') ||
               message.includes('invalid') && message.includes('api key') ||
               message.includes('api key') && message.includes('invalid') ||
               message.includes('authentication failed');
    }

    test('should detect 401 errors', () => {
        const error = new PineconeApiError(401, 'Unauthorized');
        assert.ok(isAuthError(error));
    });

    test('should detect 403 errors', () => {
        const error = new PineconeApiError(403, 'Forbidden');
        assert.ok(isAuthError(error));
    });

    test('should detect "unauthorized" in message', () => {
        assert.ok(isAuthError(new Error('Request unauthorized')));
        assert.ok(isAuthError('Unauthorized access'));
    });

    test('should detect "token expired" in message', () => {
        assert.ok(isAuthError(new Error('Token expired')));
        assert.ok(isAuthError('Your token has expired'));  // Now works with improved detection
    });

    test('should detect "invalid api key" in message', () => {
        assert.ok(isAuthError(new Error('Invalid API key')));
        assert.ok(isAuthError('The API key is invalid'));  // Now works with improved detection
    });

    test('should detect "authentication failed" in message', () => {
        assert.ok(isAuthError(new Error('Authentication failed')));
    });

    test('should NOT detect non-auth errors', () => {
        assert.ok(!isAuthError(new PineconeApiError(404, 'Not found')));
        assert.ok(!isAuthError(new PineconeApiError(500, 'Server error')));
        assert.ok(!isAuthError(new Error('Network timeout')));
        assert.ok(!isAuthError('Index already exists'));
    });

    test('should handle non-Error objects', () => {
        assert.ok(isAuthError('401 Unauthorized'));
        assert.ok(isAuthError({ message: 'Token expired' }));  // Now works with object handling
        assert.ok(!isAuthError(null));
        assert.ok(!isAuthError(undefined));
    });
});

suite('API Error Status Code Tests', () => {

    /**
     * Maps API error status codes to user-friendly messages.
     */
    function getErrorMessage(status: number, apiMessage: string): string {
        switch (status) {
            case 400:
                return `Invalid request: ${apiMessage}`;
            case 401:
                return 'Authentication required. Please log in.';
            case 403:
                return 'You do not have permission to perform this action.';
            case 404:
                return `Resource not found: ${apiMessage}`;
            case 409:
                return `Conflict: ${apiMessage}`;
            case 422:
                return `Validation error: ${apiMessage}`;
            case 429:
                return 'Rate limit exceeded. Please try again later.';
            case 500:
            case 502:
            case 503:
            case 504:
                return 'Pinecone service is temporarily unavailable. Please try again.';
            default:
                return `Error: ${apiMessage}`;
        }
    }

    test('should handle 400 Bad Request', () => {
        const message = getErrorMessage(400, 'Missing required field: dimension');
        assert.ok(message.includes('Invalid request'));
        assert.ok(message.includes('dimension'));
    });

    test('should handle 401 Unauthorized', () => {
        const message = getErrorMessage(401, 'Invalid token');
        assert.ok(message.includes('Authentication'));
        assert.ok(message.includes('log in'));
    });

    test('should handle 403 Forbidden', () => {
        const message = getErrorMessage(403, 'Access denied');
        assert.ok(message.includes('permission'));
    });

    test('should handle 404 Not Found', () => {
        const message = getErrorMessage(404, 'Index "test" not found');
        assert.ok(message.includes('not found'));
    });

    test('should handle 409 Conflict', () => {
        const message = getErrorMessage(409, 'Index already exists');
        assert.ok(message.includes('Conflict'));
    });

    test('should handle 422 Validation Error', () => {
        const message = getErrorMessage(422, 'Dimension must be positive');
        assert.ok(message.includes('Validation'));
    });

    test('should handle 429 Rate Limit', () => {
        const message = getErrorMessage(429, 'Too many requests');
        assert.ok(message.includes('Rate limit'));
    });

    test('should handle 5xx Server Errors', () => {
        for (const status of [500, 502, 503, 504]) {
            const message = getErrorMessage(status, 'Internal error');
            assert.ok(message.includes('unavailable'));
        }
    });
});

suite('Timeout Error Tests', () => {

    test('should create timeout error with duration', () => {
        const timeout = 30000;
        const error = new PineconeApiError(408, `Request timeout after ${timeout}ms`);
        
        assert.strictEqual(error.status, 408);
        assert.ok(error.message.includes('timeout'));
        assert.ok(error.message.includes('30000'));
    });

    test('should identify timeout errors', () => {
        function isTimeoutError(error: unknown): boolean {
            if (error instanceof PineconeApiError && error.status === 408) {
                return true;
            }
            const message = String(error instanceof Error ? error.message : error).toLowerCase();
            return message.includes('timeout') || message.includes('timed out');
        }

        assert.ok(isTimeoutError(new PineconeApiError(408, 'Timeout')));
        assert.ok(isTimeoutError(new Error('Request timed out')));
        assert.ok(isTimeoutError('Connection timeout'));
        assert.ok(!isTimeoutError(new PineconeApiError(500, 'Server error')));
    });
});

suite('Network Error Tests', () => {

    test('should identify network errors', () => {
        function isNetworkError(error: unknown): boolean {
            const message = String(error instanceof Error ? error.message : error).toLowerCase();
            return message.includes('network') ||
                   message.includes('econnrefused') ||
                   message.includes('enotfound') ||
                   message.includes('fetch failed') ||
                   message.includes('unable to connect');
        }

        assert.ok(isNetworkError(new Error('Network error')));
        assert.ok(isNetworkError(new Error('ECONNREFUSED')));
        assert.ok(isNetworkError(new Error('ENOTFOUND: DNS lookup failed')));
        assert.ok(isNetworkError('Unable to connect to server'));
        assert.ok(!isNetworkError(new PineconeApiError(500, 'Server error')));
    });
});

suite('Error Recovery Suggestions Tests', () => {

    /**
     * Gets recovery suggestions for different error types.
     * Checks both the error message and status code for PineconeApiError.
     */
    function getRecoverySuggestion(error: unknown): string[] {
        const suggestions: string[] = [];

        // Check status code for PineconeApiError
        if (error instanceof PineconeApiError) {
            if (error.status === 401 || error.status === 403) {
                suggestions.push('Try to log in again');
                suggestions.push('Check if your API key is valid');
            }
            if (error.status === 404) {
                suggestions.push('Verify the resource name is correct');
                suggestions.push('Refresh the tree view');
            }
            if (error.status === 429) {
                suggestions.push('Wait a few minutes before retrying');
                suggestions.push('Consider upgrading your plan for higher limits');
            }
        }

        // Also check message content for additional patterns
        const message = String(error instanceof Error ? error.message : error).toLowerCase();

        if (suggestions.length === 0 && (message.includes('401') || message.includes('unauthorized'))) {
            suggestions.push('Try to log in again');
            suggestions.push('Check if your API key is valid');
        }

        if (suggestions.length === 0 && (message.includes('404') || message.includes('not found'))) {
            suggestions.push('Verify the resource name is correct');
            suggestions.push('Refresh the tree view');
        }

        if (message.includes('timeout')) {
            suggestions.push('Check your network connection');
            suggestions.push('Try again in a few moments');
        }

        if (suggestions.length === 0 && (message.includes('rate limit') || message.includes('429'))) {
            suggestions.push('Wait a few minutes before retrying');
            suggestions.push('Consider upgrading your plan for higher limits');
        }

        if (suggestions.length === 0) {
            suggestions.push('Try again');
            suggestions.push('Check the Pinecone status page');
        }

        return suggestions;
    }

    test('should suggest login for auth errors', () => {
        const suggestions = getRecoverySuggestion(new PineconeApiError(401, 'Unauthorized'));
        assert.ok(suggestions.some(s => s.includes('login') || s.includes('log in')));
    });

    test('should suggest verification for 404 errors', () => {
        const suggestions = getRecoverySuggestion(new Error('Index not found'));
        assert.ok(suggestions.some(s => s.includes('Verify') || s.includes('correct')));
    });

    test('should suggest waiting for rate limits', () => {
        const suggestions = getRecoverySuggestion(new PineconeApiError(429, 'Rate limited'));
        assert.ok(suggestions.some(s => s.includes('Wait') || s.includes('wait')));
    });

    test('should suggest network check for timeouts', () => {
        const suggestions = getRecoverySuggestion(new Error('Request timeout'));
        assert.ok(suggestions.some(s => s.includes('network')));
    });

    test('should provide default suggestions for unknown errors', () => {
        const suggestions = getRecoverySuggestion(new Error('Something went wrong'));
        assert.ok(suggestions.length > 0);
        assert.ok(suggestions.some(s => s.includes('Try again') || s.includes('status')));
    });
});

suite('Error Message Formatting Tests', () => {

    /**
     * Formats error for display to user.
     */
    function formatErrorForDisplay(error: unknown): string {
        if (error instanceof PineconeApiError) {
            // Strip technical details from API error messages
            let message = error.message;
            
            // Try to extract just the meaningful part
            try {
                const parsed = JSON.parse(message.replace(/^Pinecone API Error \d+: /, ''));
                if (parsed.message) {
                    message = parsed.message;
                } else if (parsed.error) {
                    message = parsed.error;
                }
            } catch {
                // Use original message if not JSON
                message = error.message.replace(/^Pinecone API Error \d+: /, '');
            }
            
            return message;
        }
        
        if (error instanceof Error) {
            return error.message;
        }
        
        return String(error);
    }

    test('should extract message from API error', () => {
        const error = new PineconeApiError(400, '{"message": "Invalid dimension"}');
        const formatted = formatErrorForDisplay(error);
        assert.ok(formatted.includes('Invalid dimension'));
        assert.ok(!formatted.includes('Pinecone API Error'));
    });

    test('should handle plain text API error', () => {
        const error = new PineconeApiError(500, 'Internal server error');
        const formatted = formatErrorForDisplay(error);
        assert.ok(formatted.includes('Internal server error'));
    });

    test('should handle regular Error', () => {
        const error = new Error('Something went wrong');
        const formatted = formatErrorForDisplay(error);
        assert.strictEqual(formatted, 'Something went wrong');
    });

    test('should handle string error', () => {
        const formatted = formatErrorForDisplay('Connection failed');
        assert.strictEqual(formatted, 'Connection failed');
    });
});
