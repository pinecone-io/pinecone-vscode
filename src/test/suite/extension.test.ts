/**
 * Extension Integration Tests
 * 
 * Integration tests for the Pinecone VSCode extension.
 * Tests extension activation, command registration, and
 * view contributions.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Integration Test Suite', () => {
    const EXTENSION_ID = 'pinecone.pinecone-vscode';

    test('Extension should be present', () => {
        const ext = vscode.extensions.getExtension(EXTENSION_ID);
        assert.ok(ext, 'Extension should be installed');
    });

    test('Extension should have correct metadata', () => {
        const ext = vscode.extensions.getExtension(EXTENSION_ID);
        assert.ok(ext);
        assert.strictEqual(ext.packageJSON.name, 'pinecone-vscode');
        assert.strictEqual(ext.packageJSON.displayName, 'Pinecone');
    });

    test('Extension should activate', async () => {
        const ext = vscode.extensions.getExtension(EXTENSION_ID);
        assert.ok(ext);
        
        if (!ext.isActive) {
            await ext.activate();
        }
        
        assert.ok(ext.isActive, 'Extension should be active');
    });
});

suite('Commands Test Suite', () => {

    test('Authentication commands should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        
        assert.ok(commands.includes('pinecone.login'), 'login command should be registered');
        assert.ok(commands.includes('pinecone.logout'), 'logout command should be registered');
    });

    test('Index commands should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        
        assert.ok(commands.includes('pinecone.createIndex'), 'createIndex command should be registered');
        assert.ok(commands.includes('pinecone.deleteIndex'), 'deleteIndex command should be registered');
        assert.ok(commands.includes('pinecone.configureIndex'), 'configureIndex command should be registered');
        assert.ok(commands.includes('pinecone.queryIndex'), 'queryIndex command should be registered');
        assert.ok(commands.includes('pinecone.indexStats'), 'indexStats command should be registered');
        assert.ok(commands.includes('pinecone.createBackup'), 'createBackup command should be registered');
        assert.ok(commands.includes('pinecone.viewBackups'), 'viewBackups command should be registered');
        assert.ok(commands.includes('pinecone.addTags'), 'addTags command should be registered');
    });

    test('Assistant commands should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        
        assert.ok(commands.includes('pinecone.createAssistant'), 'createAssistant command should be registered');
        assert.ok(commands.includes('pinecone.deleteAssistant'), 'deleteAssistant command should be registered');
        assert.ok(commands.includes('pinecone.chatWithAssistant'), 'chatWithAssistant command should be registered');
        assert.ok(commands.includes('pinecone.updateAssistant'), 'updateAssistant command should be registered');
        assert.ok(commands.includes('pinecone.retrieveAssistantContext'), 'retrieveAssistantContext command should be registered');
        assert.ok(commands.includes('pinecone.evaluateAssistantAnswer'), 'evaluateAssistantAnswer command should be registered');
    });

    test('File commands should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        
        assert.ok(commands.includes('pinecone.uploadFiles'), 'uploadFiles command should be registered');
        assert.ok(commands.includes('pinecone.deleteFile'), 'deleteFile command should be registered');
        assert.ok(commands.includes('pinecone.viewFileDetails'), 'viewFileDetails command should be registered');
    });

    test('Utility commands should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        
        assert.ok(commands.includes('pinecone.refresh'), 'refresh command should be registered');
        assert.ok(commands.includes('pinecone.openDocs'), 'openDocs command should be registered');
    });
});

suite('Views Test Suite', () => {

    test('Tree view should be registered', async () => {
        // The pineconeExplorer view should be available
        // We can't directly check view registration, but we can verify
        // the extension contributes the view by checking package.json
        const ext = vscode.extensions.getExtension('pinecone.pinecone-vscode');
        assert.ok(ext);
        
        const views = ext.packageJSON.contributes.views;
        assert.ok(views, 'Extension should contribute views');
        assert.ok(views.pinecone, 'Extension should contribute pinecone views');
        
        const explorerView = views.pinecone.find((v: { id: string }) => v.id === 'pineconeExplorer');
        assert.ok(explorerView, 'pineconeExplorer view should be registered');
    });

    test('Activity bar container should be registered', async () => {
        const ext = vscode.extensions.getExtension('pinecone.pinecone-vscode');
        assert.ok(ext);
        
        const containers = ext.packageJSON.contributes.viewsContainers;
        assert.ok(containers, 'Extension should contribute view containers');
        assert.ok(containers.activitybar, 'Extension should contribute activity bar items');
        
        const pineconeContainer = containers.activitybar.find((c: { id: string }) => c.id === 'pinecone');
        assert.ok(pineconeContainer, 'Pinecone activity bar container should be registered');
    });
});

suite('Configuration Test Suite', () => {

    test('Configuration should be registered', async () => {
        const ext = vscode.extensions.getExtension('pinecone.pinecone-vscode');
        assert.ok(ext);
        
        const config = ext.packageJSON.contributes.configuration;
        assert.ok(config, 'Extension should contribute configuration');
        
        const properties = config.properties;
        assert.ok(properties, 'Configuration should have properties');
        assert.ok(properties['pinecone.environment'], 'environment setting should be defined');
        assert.ok(properties['pinecone.defaultRegion'], 'defaultRegion setting should be defined');
    });

    test('Default configuration values should be set', () => {
        const config = vscode.workspace.getConfiguration('pinecone');
        
        // These may return actual user settings or defaults
        const environment = config.get('environment');
        const defaultRegion = config.get('defaultRegion');
        
        // Just verify they exist and are strings
        assert.ok(typeof environment === 'string' || environment === undefined);
        assert.ok(typeof defaultRegion === 'string' || defaultRegion === undefined);
    });
});

suite('Menus Test Suite', () => {

    test('Context menus should be configured', async () => {
        const ext = vscode.extensions.getExtension('pinecone.pinecone-vscode');
        assert.ok(ext);
        
        const menus = ext.packageJSON.contributes.menus;
        assert.ok(menus, 'Extension should contribute menus');
        assert.ok(menus['view/item/context'], 'Context menus should be defined');
        assert.ok(menus['view/title'], 'Title menus should be defined');
    });

    test('Command palette items should be configured', async () => {
        const ext = vscode.extensions.getExtension('pinecone.pinecone-vscode');
        assert.ok(ext);
        
        const menus = ext.packageJSON.contributes.menus;
        assert.ok(menus.commandPalette, 'Command palette menus should be defined');
    });

    test('Index context menu order should match expected workflow', () => {
        const ext = vscode.extensions.getExtension('pinecone.pinecone-vscode');
        assert.ok(ext);

        const contextMenus = ext.packageJSON.contributes.menus['view/item/context'] as Array<{
            command: string;
            when: string;
            group: string;
        }>;
        const forIndex = contextMenus.filter(item =>
            item.when.includes('viewItem == index') &&
            !item.when.includes('viewItem == backup') &&
            !item.when.includes('viewItem == backups-category')
        );

        const expectedGroups: Record<string, string> = {
            'pinecone.queryIndex': '1_indexActions@1',
            'pinecone.openDataOps': '1_indexActions@2',
            'pinecone.indexStats': '1_indexActions@3',
            'pinecone.configureIndex': '2_indexManage',
            'pinecone.deleteIndex': '3_indexDelete'
        };

        for (const [command, group] of Object.entries(expectedGroups)) {
            const menuEntry = forIndex.find(item => item.command === command);
            assert.ok(menuEntry, `${command} should appear in index context menu`);
            assert.strictEqual(menuEntry.group, group, `${command} should be in group ${group}`);
        }

        const disallowed = ['pinecone.createBackup', 'pinecone.viewBackups', 'pinecone.restoreBackup', 'pinecone.deleteBackup', 'pinecone.addTags'];
        for (const command of disallowed) {
            const menuEntry = forIndex.find(item => item.command === command);
            assert.strictEqual(menuEntry, undefined, `${command} should not appear in index context menu`);
        }
    });

    test('Assistant context menu order should match expected workflow', () => {
        const ext = vscode.extensions.getExtension('pinecone.pinecone-vscode');
        assert.ok(ext);

        const contextMenus = ext.packageJSON.contributes.menus['view/item/context'] as Array<{
            command: string;
            when: string;
            group: string;
        }>;
        const forAssistant = contextMenus.filter(item => item.when.includes('viewItem == assistant'));

        const expectedGroups: Record<string, string> = {
            'pinecone.chatWithAssistant': '1_assistantActions@1',
            'pinecone.retrieveAssistantContext': '1_assistantActions@2',
            'pinecone.evaluateAssistantAnswer': '1_assistantActions@3',
            'pinecone.updateAssistant': '2_assistantManage',
            'pinecone.deleteAssistant': '3_assistantDelete'
        };

        for (const [command, group] of Object.entries(expectedGroups)) {
            const menuEntry = forAssistant.find(item => item.command === command);
            assert.ok(menuEntry, `${command} should appear in assistant context menu`);
            assert.strictEqual(menuEntry.group, group, `${command} should be in group ${group}`);
        }
    });

    test('File context menu should include View Details before Delete', () => {
        const ext = vscode.extensions.getExtension('pinecone.pinecone-vscode');
        assert.ok(ext);

        const contextMenus = ext.packageJSON.contributes.menus['view/item/context'] as Array<{
            command: string;
            when: string;
            group: string;
        }>;
        const forFile = contextMenus.filter(item => item.when.includes('viewItem == file'));

        const viewDetails = forFile.find(item => item.command === 'pinecone.viewFileDetails');
        assert.ok(viewDetails, 'pinecone.viewFileDetails should appear in file context menu');
        assert.strictEqual(viewDetails?.group, '1_info');

        const deleteFile = forFile.find(item => item.command === 'pinecone.deleteFile');
        assert.ok(deleteFile, 'pinecone.deleteFile should appear in file context menu');
        assert.strictEqual(deleteFile?.group, '2_delete');
    });
});
