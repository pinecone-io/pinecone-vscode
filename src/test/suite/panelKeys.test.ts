import * as assert from 'assert';
import { ApiKeysPanel } from '../../webview/apiKeysPanel';
import { AssistantToolsPanel } from '../../webview/assistantToolsPanel';
import { BackupRestoreJobsPanel } from '../../webview/backupRestoreJobsPanel';
import { ChatPanel } from '../../webview/chatPanel';
import { ConfigureIndexPanel } from '../../webview/configureIndexPanel';
import { CreateAssistantPanel } from '../../webview/createAssistantPanel';
import { CreateIndexPanel } from '../../webview/createIndexPanel';
import { DataOpsPanel } from '../../webview/dataOpsPanel';
import { FileDetailsPanel } from '../../webview/fileDetailsPanel';
import { QueryPanel } from '../../webview/queryPanel';

suite('Webview panel key scoping', () => {
    test('query/data ops keys are project+host scoped and case-insensitive', () => {
        const queryClass = QueryPanel as unknown as {
            getPanelKey: (indexHost: string, projectContext?: { id?: string }) => string;
        };
        const dataOpsClass = DataOpsPanel as unknown as {
            getPanelKey: (indexHost: string, projectContext?: { id?: string }) => string;
        };

        const keyA = queryClass.getPanelKey('  IDX-HOST ', { id: 'Project-1' });
        const keyB = queryClass.getPanelKey('idx-host', { id: 'project-1' });
        const keyC = dataOpsClass.getPanelKey('idx-host', { id: 'project-2' });

        assert.strictEqual(keyA, 'project-1::idx-host');
        assert.strictEqual(keyA, keyB);
        assert.notStrictEqual(keyA, keyC);
    });

    test('chat keys are project+assistant host+assistant name scoped', () => {
        const panelClass = ChatPanel as unknown as {
            getPanelKey: (
                assistantName: string,
                host: string,
                projectContext?: { id?: string }
            ) => string;
        };

        const keyA = panelClass.getPanelKey('Support-Assistant', 'assistant-host', { id: 'proj-1' });
        const keyB = panelClass.getPanelKey('support-assistant', 'ASSISTANT-HOST', { id: 'PROJ-1' });
        const keyC = panelClass.getPanelKey('docs-assistant', 'assistant-host', { id: 'proj-1' });

        assert.strictEqual(keyA, keyB);
        assert.notStrictEqual(keyA, keyC);
    });

    test('assistant tools keys include mode in scope', () => {
        const panelClass = AssistantToolsPanel as unknown as {
            getPanelKey: (
                assistantName: string,
                host: string,
                mode: 'update' | 'context' | 'evaluate',
                projectContext?: { id?: string }
            ) => string;
        };

        const updateKey = panelClass.getPanelKey('assistant-a', 'host-a', 'update', { id: 'proj-1' });
        const contextKey = panelClass.getPanelKey('assistant-a', 'host-a', 'context', { id: 'proj-1' });
        const evalKey = panelClass.getPanelKey('assistant-a', 'host-a', 'evaluate', { id: 'proj-1' });

        assert.notStrictEqual(updateKey, contextKey);
        assert.notStrictEqual(contextKey, evalKey);
        assert.notStrictEqual(updateKey, evalKey);
    });

    test('file details keys include file id', () => {
        const panelClass = FileDetailsPanel as unknown as {
            getPanelKey: (
                fileId: string,
                assistantName: string,
                assistantHost: string,
                projectContext?: { id?: string }
            ) => string;
        };

        const keyA = panelClass.getPanelKey('file-1', 'assistant-a', 'host-a', { id: 'proj-1' });
        const keyB = panelClass.getPanelKey('file-2', 'assistant-a', 'host-a', { id: 'proj-1' });
        assert.notStrictEqual(keyA, keyB);
    });

    test('create/configure panel keys are project-scoped and resource-scoped where needed', () => {
        const createIndexClass = CreateIndexPanel as unknown as {
            getPanelKey: (projectContext?: { id?: string }) => string;
        };
        const createAssistantClass = CreateAssistantPanel as unknown as {
            getPanelKey: (projectContext?: { id?: string }) => string;
        };
        const configureClass = ConfigureIndexPanel as unknown as {
            getPanelKey: (indexName: string, projectContext?: { id?: string }) => string;
        };

        assert.strictEqual(createIndexClass.getPanelKey({ id: 'Project-A' }), 'project-a');
        assert.strictEqual(createAssistantClass.getPanelKey({ id: 'Project-A' }), 'project-a');
        assert.strictEqual(createIndexClass.getPanelKey(undefined), 'global');
        assert.strictEqual(configureClass.getPanelKey('Index-A', { id: 'Project-A' }), 'project-a::index-a');
        assert.notStrictEqual(
            configureClass.getPanelKey('Index-A', { id: 'Project-A' }),
            configureClass.getPanelKey('Index-B', { id: 'Project-A' })
        );
    });

    test('backup/restore jobs panel key is project+index scoped', () => {
        const panelClass = BackupRestoreJobsPanel as unknown as {
            getPanelKey: (indexName: string, projectContext?: { id?: string }) => string;
        };

        const keyA = panelClass.getPanelKey('Index-A', { id: 'Project-A' });
        const keyB = panelClass.getPanelKey('index-a', { id: 'project-a' });
        const keyC = panelClass.getPanelKey('index-a', { id: 'project-b' });

        assert.strictEqual(keyA, 'project-a::index-a');
        assert.strictEqual(keyA, keyB);
        assert.notStrictEqual(keyA, keyC);
    });

    test('api keys panel key prefers explicit project item id over target project', () => {
        const panelClass = ApiKeysPanel as unknown as {
            getPanelKey: (
                service: { getTargetProject: () => { id: string } | undefined },
                item?: { itemType?: string; resourceId?: string }
            ) => string;
        };

        const mockService = {
            getTargetProject: () => ({ id: 'target-project' })
        };

        const fromProjectItem = panelClass.getPanelKey(mockService, {
            itemType: 'project',
            resourceId: 'Project-From-Item'
        });
        const fromTargetProject = panelClass.getPanelKey(mockService, {
            itemType: 'organization',
            resourceId: 'org-1'
        });
        const globalFallback = panelClass.getPanelKey(
            { getTargetProject: () => undefined },
            undefined
        );

        assert.strictEqual(fromProjectItem, 'project-from-item');
        assert.strictEqual(fromTargetProject, 'target-project');
        assert.strictEqual(globalFallback, 'global');
    });
});
