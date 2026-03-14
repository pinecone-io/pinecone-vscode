import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { refreshExplorer } from '../../utils/refreshExplorer';

suite('refreshExplorer Utility (Production Function)', () => {
    let originalExecuteCommand: typeof vscode.commands.executeCommand;
    const executedCommands: string[] = [];

    setup(() => {
        executedCommands.length = 0;
        originalExecuteCommand = vscode.commands.executeCommand;

        (vscode.commands as unknown as {
            executeCommand: (command: string, ...args: unknown[]) => Thenable<unknown>;
        }).executeCommand = async (command: string): Promise<void> => {
            executedCommands.push(command);
        };
    });

    teardown(() => {
        (vscode.commands as unknown as { executeCommand: typeof vscode.commands.executeCommand }).executeCommand = originalExecuteCommand;
    });

    test('runs provider refresh then explorer refresh + focus sequence', async () => {
        const events: string[] = [];
        const provider = {
            refresh: (): void => {
                events.push('provider.refresh');
            }
        };

        await refreshExplorer({
            treeDataProvider: provider,
            delayMs: 0,
            focusExplorer: true
        });

        events.push(...executedCommands);
        assert.deepStrictEqual(events, [
            'provider.refresh',
            'pinecone.refresh',
            'pineconeExplorer.focus'
        ]);
    });

    test('supports no-focus refresh mode', async () => {
        await refreshExplorer({ delayMs: 0, focusExplorer: false });

        assert.deepStrictEqual(executedCommands, ['pinecone.refresh']);
    });

    test('debounces burst calls into one refresh execution', async () => {
        let providerRefreshCount = 0;
        const provider = {
            refresh: (): void => {
                providerRefreshCount += 1;
            }
        };

        const p1 = refreshExplorer({ treeDataProvider: provider, delayMs: 20, focusExplorer: true });
        const p2 = refreshExplorer({ treeDataProvider: provider, delayMs: 20, focusExplorer: true });
        const p3 = refreshExplorer({ treeDataProvider: provider, delayMs: 20, focusExplorer: true });

        await Promise.all([p1, p2, p3]);

        assert.strictEqual(providerRefreshCount, 1);
        assert.deepStrictEqual(executedCommands, ['pinecone.refresh', 'pineconeExplorer.focus']);
    });

    test('continues command refresh even when provider refresh throws', async () => {
        const provider = {
            refresh: (): void => {
                throw new Error('provider refresh failure');
            }
        };

        await refreshExplorer({ treeDataProvider: provider, delayMs: 0, focusExplorer: true });

        assert.deepStrictEqual(executedCommands, ['pinecone.refresh', 'pineconeExplorer.focus']);
    });

    test('command handlers route explorer refreshes through refreshExplorer helper', () => {
        const repoRoot = path.resolve(__dirname, '..', '..', '..');
        const commandFiles = [
            'src/commands/index.commands.ts',
            'src/commands/assistant.commands.ts',
            'src/commands/file.commands.ts',
            'src/commands/namespace.commands.ts',
            'src/commands/project.commands.ts'
        ];

        for (const relativeFile of commandFiles) {
            const fullPath = path.join(repoRoot, relativeFile);
            const source = fs.readFileSync(fullPath, 'utf8');
            assert.ok(source.includes('refreshExplorer('), `${relativeFile} should use refreshExplorer()`);
            assert.ok(
                !source.includes("executeCommand('pinecone.refresh'"),
                `${relativeFile} should not invoke pinecone.refresh directly`
            );
        }
    });
});
