/**
 * API Key Commands
 *
 * Opens project API key management panel.
 */

import * as vscode from 'vscode';
import { PineconeService } from '../services/pineconeService';
import { AuthService } from '../services/authService';
import { PineconeTreeItem } from '../providers/treeItems';

export class ApiKeysCommands {
    constructor(
        private readonly pineconeService: PineconeService,
        private readonly authService: AuthService,
        private readonly extensionUri: vscode.Uri
    ) {}

    async openApiKeys(item?: PineconeTreeItem): Promise<void> {
        const { ApiKeysPanel } = await import('../webview/apiKeysPanel.js');
        ApiKeysPanel.createOrShow(
            this.extensionUri,
            this.pineconeService,
            this.authService,
            item
        );
    }
}
