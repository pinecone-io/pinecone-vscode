import * as assert from 'assert';
import * as net from 'net';
import * as vscode from 'vscode';
import { AuthService } from '../../services/authService';
import { OAUTH_CALLBACK_PORT } from '../../utils/constants';

class MockSecretStorage implements vscode.SecretStorage {
    private readonly secrets = new Map<string, string>();

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

    keys(): Thenable<string[]> {
        return Promise.resolve(Array.from(this.secrets.keys()));
    }

    onDidChange = (() => ({ dispose: () => undefined })) as vscode.SecretStorage['onDidChange'];
}

function listenOnCallbackPort(server: net.Server): Promise<void> {
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(OAUTH_CALLBACK_PORT, () => resolve());
    });
}

function closeServer(server: net.Server): Promise<void> {
    return new Promise((resolve) => {
        if (!server.listening) {
            resolve();
            return;
        }
        server.close(() => resolve());
    });
}

suite('AuthService OAuth Callback Lifecycle', () => {
    let originalOpenExternal: typeof vscode.env.openExternal;
    let originalExecuteCommand: typeof vscode.commands.executeCommand;
    let originalShowInformationMessage: typeof vscode.window.showInformationMessage;

    let openExternalCalls = 0;

    setup(() => {
        openExternalCalls = 0;

        originalOpenExternal = vscode.env.openExternal;
        originalExecuteCommand = vscode.commands.executeCommand;
        originalShowInformationMessage = vscode.window.showInformationMessage;

        (vscode.env as unknown as {
            openExternal: (target: vscode.Uri) => Thenable<boolean>;
        }).openExternal = async (_target: vscode.Uri): Promise<boolean> => {
            openExternalCalls += 1;
            return true;
        };

        (vscode.commands as unknown as {
            executeCommand: (command: string, ...args: unknown[]) => Thenable<unknown>;
        }).executeCommand = async (): Promise<void> => undefined;

        (vscode.window as unknown as {
            showInformationMessage: <T extends string>(message: string, ...items: T[]) => Thenable<T | undefined>;
        }).showInformationMessage = async (): Promise<undefined> => undefined;
    });

    teardown(() => {
        (vscode.env as unknown as { openExternal: typeof vscode.env.openExternal }).openExternal = originalOpenExternal;
        (vscode.commands as unknown as { executeCommand: typeof vscode.commands.executeCommand }).executeCommand = originalExecuteCommand;
        (vscode.window as unknown as { showInformationMessage: typeof vscode.window.showInformationMessage }).showInformationMessage = originalShowInformationMessage;
    });

    test('login fails gracefully with EADDRINUSE when callback port is occupied', async () => {
        const blocker = net.createServer();
        await listenOnCallbackPort(blocker);

        try {
            const authService = new AuthService(new MockSecretStorage());
            await assert.rejects(
                async () => authService.login(200),
                /EADDRINUSE/
            );

            assert.strictEqual(openExternalCalls, 0);
        } finally {
            await closeServer(blocker);
        }
    });

    test('login timeout closes callback listener and frees the callback port', async () => {
        const authService = new AuthService(new MockSecretStorage());

        await assert.rejects(
            async () => authService.login(40),
            /timed out/i
        );

        assert.strictEqual(openExternalCalls, 1);

        const probe = net.createServer();
        try {
            await listenOnCallbackPort(probe);
            assert.ok(true, 'callback port should be available after timeout');
        } finally {
            await closeServer(probe);
        }
    });
});
