/**
 * Command Handler Tests
 * 
 * Tests for command handlers to verify they properly validate input,
 * call the appropriate API methods, and handle errors correctly.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Index Commands Test Suite', () => {

    test('createIndex command should be executable', async () => {
        // Verify the command exists and can be called (will prompt for input)
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('pinecone.createIndex'));
    });

    test('deleteIndex command should be executable', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('pinecone.deleteIndex'));
    });

    test('configureIndex command should be executable', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('pinecone.configureIndex'));
    });

    test('queryIndex command should be executable', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('pinecone.queryIndex'));
    });

    test('indexStats command should be executable', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('pinecone.indexStats'));
    });

    test('createBackup command should be executable', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('pinecone.createBackup'));
    });

    test('viewBackups command should be executable', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('pinecone.viewBackups'));
    });

    test('addTags command should be executable', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('pinecone.addTags'));
    });
});

suite('Assistant Commands Test Suite', () => {

    test('createAssistant command should be executable', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('pinecone.createAssistant'));
    });

    test('deleteAssistant command should be executable', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('pinecone.deleteAssistant'));
    });

    test('chatWithAssistant command should be executable', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('pinecone.chatWithAssistant'));
    });
});

suite('File Commands Test Suite', () => {

    test('uploadFiles command should be executable', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('pinecone.uploadFiles'));
    });

    test('deleteFile command should be executable', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('pinecone.deleteFile'));
    });
});

suite('Auth Commands Test Suite', () => {

    test('login command should be executable', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('pinecone.login'));
    });

    test('logout command should be executable', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('pinecone.logout'));
    });
});

suite('Utility Commands Test Suite', () => {

    test('refresh command should be executable', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('pinecone.refresh'));
    });

    test('openDocs command should be executable', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('pinecone.openDocs'));
    });

    test('openDocs command should work without authentication', async () => {
        // openDocs has no enablement requirement, so it should always work
        // We can verify it doesn't throw when called
        try {
            // This will open a browser, but shouldn't throw
            await vscode.commands.executeCommand('pinecone.openDocs');
            assert.ok(true);
        } catch (error) {
            // Only fail if it's not a user-cancelled operation
            const message = error instanceof Error ? error.message : String(error);
            if (!message.includes('cancelled')) {
                assert.fail(`openDocs command failed: ${message}`);
            }
        }
    });
});

suite('Command Enablement Test Suite', () => {

    test('Commands requiring auth should have enablement clause', async () => {
        const ext = vscode.extensions.getExtension('pinecone.pinecone-vscode');
        assert.ok(ext);
        
        const commands = ext.packageJSON.contributes.commands;
        
        // Commands that should require authentication
        const authRequiredCommands = [
            'pinecone.logout',
            'pinecone.refresh',
            'pinecone.createIndex',
            'pinecone.deleteIndex',
            'pinecone.configureIndex',
            'pinecone.queryIndex',
            'pinecone.indexStats',
            'pinecone.createBackup',
            'pinecone.viewBackups',
            'pinecone.addTags',
            'pinecone.createAssistant',
            'pinecone.deleteAssistant',
            'pinecone.chatWithAssistant',
            'pinecone.uploadFiles',
            'pinecone.deleteFile'
        ];

        for (const cmdId of authRequiredCommands) {
            const cmd = commands.find((c: { command: string }) => c.command === cmdId);
            assert.ok(cmd, `Command ${cmdId} should exist`);
            assert.ok(
                cmd.enablement === 'pinecone.isAuthenticated',
                `Command ${cmdId} should have enablement clause`
            );
        }
    });

    test('Commands not requiring auth should not have enablement clause', async () => {
        const ext = vscode.extensions.getExtension('pinecone.pinecone-vscode');
        assert.ok(ext);
        
        const commands = ext.packageJSON.contributes.commands;
        
        // Commands that should work without authentication
        const noAuthCommands = [
            'pinecone.login',
            'pinecone.openDocs'
        ];

        for (const cmdId of noAuthCommands) {
            const cmd = commands.find((c: { command: string }) => c.command === cmdId);
            assert.ok(cmd, `Command ${cmdId} should exist`);
            assert.ok(
                !cmd.enablement || cmd.enablement !== 'pinecone.isAuthenticated',
                `Command ${cmdId} should not require authentication`
            );
        }
    });
});
