/**
 * Inference Commands
 *
 * Opens inference toolbox panel.
 */

import * as vscode from 'vscode';
import { PineconeService } from '../services/pineconeService';

export class InferenceCommands {
    constructor(
        private readonly pineconeService: PineconeService,
        private readonly extensionUri: vscode.Uri
    ) {}

    async openInferencePanel(): Promise<void> {
        const { InferencePanel } = await import('../webview/inferencePanel.js');
        InferencePanel.createOrShow(this.extensionUri, this.pineconeService);
    }
}
