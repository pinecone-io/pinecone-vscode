/**
 * Assistant Tools Commands
 *
 * Opens assistant advanced tooling panel.
 */

import * as vscode from 'vscode';
import { PineconeService } from '../services/pineconeService';
import { PineconeTreeItem } from '../providers/treeItems';
import { AssistantModel } from '../api/types';
import { buildProjectContextFromItem } from '../utils/treeItemHelpers';
import type { AssistantToolMode } from '../webview/assistantToolsPanel';

export class AssistantToolsCommands {
    constructor(
        private readonly pineconeService: PineconeService,
        private readonly extensionUri: vscode.Uri
    ) {}

    private async openPanel(item: PineconeTreeItem, mode: AssistantToolMode): Promise<void> {
        if (!item?.resourceId || !item?.metadata?.assistant) {
            vscode.window.showErrorMessage('Unable to open Assistant Tools: assistant information not available.');
            return;
        }
        const assistant = item.metadata.assistant as AssistantModel;

        const { AssistantToolsPanel } = await import('../webview/assistantToolsPanel.js');
        AssistantToolsPanel.createOrShow(
            this.extensionUri,
            this.pineconeService,
            item.resourceId,
            assistant.host,
            mode,
            buildProjectContextFromItem(item)
        );
    }

    async openUpdateAssistant(item: PineconeTreeItem): Promise<void> {
        await this.openPanel(item, 'update');
    }

    async openRetrieveContext(item: PineconeTreeItem): Promise<void> {
        await this.openPanel(item, 'context');
    }

    async openEvaluateAnswer(item: PineconeTreeItem): Promise<void> {
        await this.openPanel(item, 'evaluate');
    }
}
