/**
 * Error Handling Utilities
 * 
 * Centralized error detection and handling for the Pinecone VSCode extension.
 * Provides consistent error classification and user-friendly error messages.
 * 
 * ## Error Handling Strategy
 * 
 * The extension uses a tiered error handling approach:
 * 
 * 1. **Service Layer** (API clients, PineconeService):
 *    - Throws errors for API failures
 *    - Does NOT handle errors (lets them propagate)
 *    - Logs errors for debugging
 * 
 * 2. **Command Layer** (commands/*.ts):
 *    - Catches all errors at the command boundary
 *    - Classifies errors (auth, validation, API, network)
 *    - Shows appropriate user messages with actions
 *    - Never lets errors propagate to VSCode
 * 
 * 3. **Provider Layer** (tree data provider):
 *    - Catches errors when fetching tree data
 *    - Returns empty arrays on error (graceful degradation)
 *    - Shows warning for auth errors, error for others
 * 
 * ## Error Types
 * 
 * - **Authentication errors**: 401, 403, token expired, invalid credentials
 * - **Not Found errors**: 404, resource doesn't exist
 * - **Conflict errors**: 409, resource already exists
 * - **Rate Limit errors**: 429, too many requests
 * - **Server errors**: 5xx, internal server issues
 * - **Network errors**: Connection failed, timeout
 * - **Validation errors**: Invalid input, missing required fields
 * 
 * @module utils/errorHandling
 */

import * as vscode from 'vscode';
import { PineconeApiError } from '../api/client';
import { createComponentLogger } from './logger';
import { refreshExplorer } from './refreshExplorer';

/** Logger for error handling */
const log = createComponentLogger('ErrorHandler');

// ============================================================================
// Error Classification
// ============================================================================

/**
 * Categorizes an error into a specific type for appropriate handling.
 */
export type ErrorCategory = 
    | 'authentication'
    | 'not_found'
    | 'conflict'
    | 'rate_limit'
    | 'server_error'
    | 'network'
    | 'validation'
    | 'unknown';

/**
 * Result of error classification with category and details.
 */
export interface ClassifiedError {
    /** Error category for handling logic */
    category: ErrorCategory;
    /** HTTP status code if available */
    status?: number;
    /** Original error message */
    message: string;
    /** User-friendly message for display */
    userMessage: string;
    /** Whether the user should be prompted to log in */
    requiresLogin: boolean;
    /** Whether a refresh might help */
    suggestRefresh: boolean;
    /** Whether retrying might succeed */
    isRetryable: boolean;
}

/**
 * Classifies an error into a category with appropriate handling info.
 * 
 * @param error - The error to classify
 * @returns Classified error with handling information
 * 
 * @example
 * ```typescript
 * try {
 *   await api.deleteIndex(name);
 * } catch (e) {
 *   const classified = classifyError(e);
 *   if (classified.requiresLogin) {
 *     promptLogin();
 *   } else {
 *     showError(classified.userMessage);
 *   }
 * }
 * ```
 */
export function classifyError(error: unknown): ClassifiedError {
    const message = getErrorMessage(error);
    const lowerMessage = message.toLowerCase();
    const status = error instanceof PineconeApiError ? error.status : undefined;

    // Authentication errors (401, 403)
    if (isAuthenticationError(error)) {
        return {
            category: 'authentication',
            status,
            message,
            userMessage: 'Your session has expired. Please log in again.',
            requiresLogin: true,
            suggestRefresh: false,
            isRetryable: false
        };
    }

    // Not found errors (404)
    if (status === 404 || lowerMessage.includes('not found')) {
        return {
            category: 'not_found',
            status: 404,
            message,
            userMessage: 'The resource was not found. It may have been deleted.',
            requiresLogin: false,
            suggestRefresh: true,
            isRetryable: false
        };
    }

    // Conflict errors (409)
    if (status === 409 || lowerMessage.includes('already exists') || lowerMessage.includes('conflict')) {
        return {
            category: 'conflict',
            status: 409,
            message,
            userMessage: 'A resource with this name already exists.',
            requiresLogin: false,
            suggestRefresh: false,
            isRetryable: false
        };
    }

    // Rate limit errors (429)
    if (status === 429 || lowerMessage.includes('rate limit') || lowerMessage.includes('too many requests')) {
        return {
            category: 'rate_limit',
            status: 429,
            message,
            userMessage: 'Too many requests. Please wait a moment and try again.',
            requiresLogin: false,
            suggestRefresh: false,
            isRetryable: true
        };
    }

    // Server errors (5xx)
    if (status && status >= 500) {
        return {
            category: 'server_error',
            status,
            message,
            userMessage: 'The Pinecone service is experiencing issues. Please try again later.',
            requiresLogin: false,
            suggestRefresh: false,
            isRetryable: true
        };
    }

    // Network errors
    if (isNetworkError(error)) {
        return {
            category: 'network',
            status: undefined,
            message,
            userMessage: 'Network connection failed. Please check your internet connection.',
            requiresLogin: false,
            suggestRefresh: false,
            isRetryable: true
        };
    }

    // Validation errors (400)
    if (status === 400 || lowerMessage.includes('invalid') || lowerMessage.includes('validation')) {
        return {
            category: 'validation',
            status: 400,
            message,
            userMessage: message, // Use original message for validation errors
            requiresLogin: false,
            suggestRefresh: false,
            isRetryable: false
        };
    }

    // Unknown errors
    return {
        category: 'unknown',
        status,
        message,
        userMessage: message,
        requiresLogin: false,
        suggestRefresh: false,
        isRetryable: false
    };
}

/**
 * Checks if an error is an authentication error.
 * 
 * Authentication errors require the user to log in again.
 * 
 * @param error - The error to check
 * @returns true if the error is authentication-related
 */
export function isAuthenticationError(error: unknown): boolean {
    const message = getErrorMessage(error).toLowerCase();
    const status = error instanceof PineconeApiError ? error.status : undefined;

    return status === 401 ||
           status === 403 ||
           message.includes('unauthorized') ||
           message.includes('authentication') ||
           message.includes('token expired') ||
           message.includes('invalid api key') ||
           message.includes('not authenticated');
}

/**
 * Checks if an error is a network error.
 * 
 * Network errors are typically retryable after connectivity is restored.
 * 
 * @param error - The error to check
 * @returns true if the error is network-related
 */
export function isNetworkError(error: unknown): boolean {
    const message = getErrorMessage(error).toLowerCase();
    
    return message.includes('network') ||
           message.includes('econnrefused') ||
           message.includes('enotfound') ||
           message.includes('etimedout') ||
           message.includes('fetch failed') ||
           message.includes('connection') ||
           message.includes('dns');
}

/**
 * Checks if an error is retryable.
 * 
 * @param error - The error to check
 * @returns true if retrying the operation might succeed
 */
export function isRetryableError(error: unknown): boolean {
    const classified = classifyError(error);
    return classified.isRetryable;
}

// ============================================================================
// Error Message Extraction
// ============================================================================

/**
 * Extracts a human-readable error message from an unknown error value.
 * 
 * @param error - The error value (can be Error, string, PineconeApiError, or anything)
 * @returns A string message suitable for display
 */
export function getErrorMessage(error: unknown): string {
    if (error instanceof PineconeApiError) {
        return error.apiMessage || error.message;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

// ============================================================================
// Error Handling Actions
// ============================================================================

/**
 * Options for error handling.
 */
export interface ErrorHandlerOptions {
    /** Operation name for context (e.g., "delete index") */
    operation: string;
    /** Whether to log the error */
    logError?: boolean;
    /** Additional actions to show */
    additionalActions?: string[];
    /** Callback for additional action selection */
    onAction?: (action: string) => void;
}

/**
 * Handles an error by showing appropriate UI feedback and logging.
 * 
 * This is the primary error handling function that should be called
 * at command boundaries.
 * 
 * @param error - The error that occurred
 * @param options - Handling options
 * 
 * @example
 * ```typescript
 * async deleteIndex(item: PineconeTreeItem): Promise<void> {
 *   try {
 *     await this.pineconeService.deleteIndex(name);
 *   } catch (e) {
 *     handleError(e, { operation: 'delete index' });
 *   }
 * }
 * ```
 */
export function handleError(error: unknown, options: ErrorHandlerOptions): void {
    const { operation, logError = true, additionalActions = [], onAction } = options;
    const classified = classifyError(error);

    // Log the error for debugging
    if (logError) {
        log.error(`Failed to ${operation}:`, error);
    }

    // Build actions based on error type
    const actions: string[] = [];
    
    if (classified.requiresLogin) {
        actions.push('Login');
    }
    
    if (classified.suggestRefresh) {
        actions.push('Refresh');
    }
    
    if (classified.isRetryable) {
        actions.push('Retry');
    }
    
    actions.push(...additionalActions);

    // Show appropriate message type
    const fullMessage = `Failed to ${operation}: ${classified.userMessage}`;
    
    if (classified.requiresLogin) {
        // Warning for auth errors (less alarming)
        vscode.window.showWarningMessage(fullMessage, ...actions).then(selection => {
            handleErrorAction(selection, onAction);
        });
    } else if (classified.category === 'server_error' || classified.category === 'network') {
        // Warning for transient errors (might resolve)
        vscode.window.showWarningMessage(fullMessage, ...actions).then(selection => {
            handleErrorAction(selection, onAction);
        });
    } else {
        // Error for permanent errors
        vscode.window.showErrorMessage(fullMessage, ...actions).then(selection => {
            handleErrorAction(selection, onAction);
        });
    }
}

/**
 * Handles user selection of an error action button.
 */
function handleErrorAction(selection: string | undefined, onAction?: (action: string) => void): void {
    if (!selection) {
        return;
    }

    switch (selection) {
        case 'Login':
            vscode.commands.executeCommand('pinecone.login');
            break;
        case 'Refresh':
            void refreshExplorer({ delayMs: 0, focusExplorer: false });
            break;
        case 'Retry':
            // Retry is handled by the caller via onAction
            break;
    }

    if (onAction) {
        onAction(selection);
    }
}

/**
 * Handles an error in a tree data provider context.
 * 
 * Tree providers should continue to work even when errors occur,
 * so this function shows messages but doesn't throw.
 * 
 * @param error - The error that occurred
 * @param operation - What operation failed
 */
export function handleTreeProviderError(error: unknown, operation: string): void {
    const classified = classifyError(error);

    log.warn(`Tree provider error during ${operation}:`, error);

    if (classified.requiresLogin) {
        vscode.window.showWarningMessage(
            `Authentication error: ${classified.userMessage}`,
            'Login'
        ).then(selection => {
            if (selection === 'Login') {
                vscode.commands.executeCommand('pinecone.login');
            }
        });
    } else {
        vscode.window.showErrorMessage(`Failed to ${operation}: ${classified.userMessage}`);
    }
}

// ============================================================================
// Error Wrapping Utilities
// ============================================================================

/**
 * Result type for operations that can fail.
 * Use this to explicitly handle errors without exceptions.
 */
export type OperationResult<T> = 
    | { success: true; data: T }
    | { success: false; error: ClassifiedError };

/**
 * Wraps an async operation in error handling.
 * 
 * @param operation - The async operation to wrap
 * @returns OperationResult with either success data or classified error
 * 
 * @example
 * ```typescript
 * const result = await wrapOperation(async () => {
 *   return await api.createIndex(config);
 * });
 * 
 * if (result.success) {
 *   console.log('Created:', result.data);
 * } else {
 *   console.log('Failed:', result.error.userMessage);
 * }
 * ```
 */
export async function wrapOperation<T>(operation: () => Promise<T>): Promise<OperationResult<T>> {
    try {
        const data = await operation();
        return { success: true, data };
    } catch (e: unknown) {
        return { success: false, error: classifyError(e) };
    }
}
