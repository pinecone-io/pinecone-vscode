import * as assert from 'assert';
import * as vscode from 'vscode';
import { PineconeApiError } from '../../api/client';
import {
    classifyError,
    handleError,
    isAuthenticationError,
    isNetworkError
} from '../../utils/errorHandling';

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

suite('Error Handling Utilities (Production Functions)', () => {
    let originalShowWarningMessage: typeof vscode.window.showWarningMessage;
    let originalShowErrorMessage: typeof vscode.window.showErrorMessage;
    let originalExecuteCommand: typeof vscode.commands.executeCommand;

    const executedCommands: string[] = [];

    setup(() => {
        executedCommands.length = 0;

        originalShowWarningMessage = vscode.window.showWarningMessage;
        originalShowErrorMessage = vscode.window.showErrorMessage;
        originalExecuteCommand = vscode.commands.executeCommand;

        (vscode.commands as unknown as {
            executeCommand: (command: string, ...args: unknown[]) => Thenable<unknown>;
        }).executeCommand = async (command: string): Promise<void> => {
            executedCommands.push(command);
        };

        (vscode.window as unknown as {
            showWarningMessage: <T extends string>(message: string, ...items: T[]) => Thenable<T | undefined>;
            showErrorMessage: <T extends string>(message: string, ...items: T[]) => Thenable<T | undefined>;
        }).showWarningMessage = async <T extends string>(_message: string, ...items: T[]): Promise<T | undefined> => {
            if (items.includes('Login' as T)) {
                return 'Login' as T;
            }
            return undefined;
        };

        (vscode.window as unknown as {
            showErrorMessage: <T extends string>(message: string, ...items: T[]) => Thenable<T | undefined>;
        }).showErrorMessage = async <T extends string>(_message: string, ...items: T[]): Promise<T | undefined> => {
            if (items.includes('Refresh' as T)) {
                return 'Refresh' as T;
            }
            return undefined;
        };
    });

    teardown(() => {
        (vscode.window as unknown as { showWarningMessage: typeof vscode.window.showWarningMessage }).showWarningMessage = originalShowWarningMessage;
        (vscode.window as unknown as { showErrorMessage: typeof vscode.window.showErrorMessage }).showErrorMessage = originalShowErrorMessage;
        (vscode.commands as unknown as { executeCommand: typeof vscode.commands.executeCommand }).executeCommand = originalExecuteCommand;
    });

    test('classifyError marks 401/403 as authentication errors requiring login', () => {
        const classified = classifyError(new PineconeApiError(401, 'Unauthorized'));

        assert.strictEqual(classified.category, 'authentication');
        assert.strictEqual(classified.requiresLogin, true);
        assert.strictEqual(classified.isRetryable, false);
    });

    test('classifyError marks 404 as not_found with refresh suggestion', () => {
        const classified = classifyError(new PineconeApiError(404, 'Index not found'));

        assert.strictEqual(classified.category, 'not_found');
        assert.strictEqual(classified.suggestRefresh, true);
        assert.strictEqual(classified.requiresLogin, false);
    });

    test('isAuthenticationError does not treat missing project-context as expired login', () => {
        const contextError = new Error('x-project-id header is required');
        const authError = new Error('Unauthorized');

        assert.strictEqual(isAuthenticationError(contextError), false);
        assert.strictEqual(isAuthenticationError(authError), true);
    });

    test('isNetworkError detects common connectivity failures', () => {
        assert.strictEqual(isNetworkError(new Error('ECONNREFUSED: failed to connect')), true);
        assert.strictEqual(isNetworkError(new Error('ENOTFOUND dns lookup failed')), true);
        assert.strictEqual(isNetworkError(new Error('validation failed')), false);
    });

    test('handleError triggers Login action for authentication errors', async () => {
        handleError(new PineconeApiError(401, 'Unauthorized'), { operation: 'list indexes' });
        await sleep(10);

        assert.ok(executedCommands.includes('pinecone.login'));
    });

    test('handleError triggers shared refresh flow for refreshable errors', async () => {
        handleError(new PineconeApiError(404, 'resource not found'), { operation: 'load resource' });
        await sleep(25);

        assert.ok(executedCommands.includes('pinecone.refresh'));
    });
});
