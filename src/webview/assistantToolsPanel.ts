/**
 * Assistant Tools Panel
 *
 * Mode-scoped webview panel for:
 * - update assistant
 * - retrieve context
 * - evaluate answer
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PineconeService } from '../services/pineconeService';
import { ProjectContext } from '../api/client';
import { Metadata } from '../api/types';
import { classifyError } from '../utils/errorHandling';
import { parseOptionalJsonObject } from '../utils/inputValidation';

export type AssistantToolMode = 'update' | 'context' | 'evaluate';

interface AssistantToolsMessage {
    command: string;
    payload?: Record<string, unknown>;
}

const MODE_TITLES: Record<AssistantToolMode, string> = {
    update: 'Update Assistant',
    context: 'Retrieve Context',
    evaluate: 'Evaluate Answer'
};

export class AssistantToolsPanel {
    private static readonly panelsByKey = new Map<string, AssistantToolsPanel>();

    private readonly panel: vscode.WebviewPanel;
    private readonly disposables: vscode.Disposable[] = [];
    private readonly panelKey: string;
    private isDisposed = false;

    public static createOrShow(
        extensionUri: vscode.Uri,
        pineconeService: PineconeService,
        assistantName: string,
        host: string,
        mode: AssistantToolMode,
        projectContext?: ProjectContext
    ): void {
        const column = vscode.window.activeTextEditor?.viewColumn;
        const panelKey = AssistantToolsPanel.getPanelKey(assistantName, host, mode, projectContext);
        const existing = AssistantToolsPanel.panelsByKey.get(panelKey);
        if (existing) {
            existing.panel.reveal(column || vscode.ViewColumn.One);
            existing.setAssistant(assistantName, host, projectContext);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            `pineconeAssistantTools.${mode}`,
            `${MODE_TITLES[mode]}: ${assistantName}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );
        new AssistantToolsPanel(
            panel,
            extensionUri,
            pineconeService,
            assistantName,
            host,
            mode,
            projectContext,
            panelKey
        );
    }

    private constructor(
        panel: vscode.WebviewPanel,
        private readonly extensionUri: vscode.Uri,
        private readonly pineconeService: PineconeService,
        private assistantName: string,
        private host: string,
        private readonly mode: AssistantToolMode,
        private projectContext?: ProjectContext,
        panelKey?: string
    ) {
        this.panel = panel;
        this.panelKey = panelKey || AssistantToolsPanel.getPanelKey(assistantName, host, mode, projectContext);
        AssistantToolsPanel.panelsByKey.set(this.panelKey, this);
        this.panel.webview.html = this.getHtml(this.panel.webview);

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage((message: AssistantToolsMessage) => {
            void this.handleMessage(message);
        }, null, this.disposables);
    }

    private setAssistant(assistantName: string, host: string, projectContext?: ProjectContext): void {
        this.assistantName = assistantName;
        this.host = host;
        this.projectContext = projectContext;
        this.panel.title = `${MODE_TITLES[this.mode]}: ${assistantName}`;
        void this.panel.webview.postMessage({
            command: 'setAssistant',
            assistantName,
            mode: this.mode
        });
        if (this.mode === 'update') {
            void this.sendUpdateDefaults();
        }
    }

    private dispose(): void {
        if (this.isDisposed) {
            return;
        }
        this.isDisposed = true;
        AssistantToolsPanel.panelsByKey.delete(this.panelKey);
        this.panel.dispose();
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
    }

    private static getPanelKey(
        assistantName: string,
        host: string,
        mode: AssistantToolMode,
        projectContext?: ProjectContext
    ): string {
        const project = String(projectContext?.id || '').trim().toLowerCase();
        const normalizedHost = String(host || '').trim().toLowerCase();
        const assistant = String(assistantName || '').trim().toLowerCase();
        return `${project || 'global'}::${normalizedHost}::${assistant}::${mode}`;
    }

    private getHtml(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'assistantTools.js'));
        const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'assistantTools.css'));
        const nonce = this.getNonce();
        const htmlPath = path.join(this.extensionUri.fsPath, 'src', 'webview', 'html', 'assistantTools.html');
        let html = fs.readFileSync(htmlPath, 'utf8');
        html = html.replace(/\${scriptUri}/g, scriptUri.toString());
        html = html.replace(/\${stylesUri}/g, stylesUri.toString());
        html = html.replace(/\${cspSource}/g, webview.cspSource);
        html = html.replace(/\${nonce}/g, nonce);
        html = html.replace(/\${assistantName}/g, this.assistantName);
        html = html.replace(/\${mode}/g, this.mode);
        html = html.replace(/\${modeTitle}/g, MODE_TITLES[this.mode]);
        return html;
    }

    private getNonce(): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let text = '';
        for (let i = 0; i < 32; i++) {
            text += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return text;
    }

    private async handleMessage(message: AssistantToolsMessage): Promise<void> {
        const assistantApi = this.pineconeService.getAssistantApi();
        const payload = message.payload || {};

        try {
            switch (message.command) {
                case 'ready':
                    await this.panel.webview.postMessage({
                        command: 'setAssistant',
                        assistantName: this.assistantName,
                        mode: this.mode
                    });
                    if (this.mode === 'update') {
                        await this.sendUpdateDefaults();
                    }
                    return;
                case 'updateAssistant': {
                    if (this.mode !== 'update') {
                        return;
                    }
                    const metadata = parseOptionalJsonObject(
                        String(payload.metadata ?? ''),
                        'Assistant metadata must be a JSON object.'
                    );
                    if (metadata.error) {
                        throw new Error(metadata.error);
                    }
                    const response = await assistantApi.updateAssistant(
                        this.assistantName,
                        {
                            instructions: String(payload.instructions || '') || undefined,
                            metadata: metadata.value as Metadata | undefined
                        },
                        this.projectContext
                    );
                    await this.sendResult(message.command, response);
                    return;
                }
                case 'retrieveContext': {
                    if (this.mode !== 'context') {
                        return;
                    }
                    const filter = parseOptionalJsonObject(
                        String(payload.filter ?? ''),
                        'Context filter must be valid JSON.'
                    );
                    if (filter.error) {
                        throw new Error(filter.error);
                    }
                    const response = await assistantApi.retrieveContext(
                        this.host,
                        this.assistantName,
                        {
                            query: String(payload.query || '').trim(),
                            top_k: Number(payload.topK) || undefined,
                            filter: filter.value
                        },
                        this.projectContext
                    );
                    await this.sendResult(message.command, response);
                    return;
                }
                case 'evaluateAnswer': {
                    if (this.mode !== 'evaluate') {
                        return;
                    }
                    const groundTruth = String(payload.groundTruth || '').trim();
                    if (!groundTruth) {
                        throw new Error('Ground truth answer is required for evaluation.');
                    }
                    const response = await assistantApi.evaluateAnswer(
                        this.host,
                        this.assistantName,
                        {
                            question: String(payload.question || '').trim(),
                            answer: String(payload.answer || '').trim(),
                            ground_truth_answer: groundTruth
                        },
                        this.projectContext
                    );
                    await this.sendResult(message.command, response);
                    return;
                }
                default:
                    return;
            }
        } catch (e: unknown) {
            const classified = classifyError(e);
            if (classified.requiresLogin) {
                await this.panel.webview.postMessage({ command: 'authExpired' });
            } else {
                await this.panel.webview.postMessage({
                    command: 'error',
                    message: classified.userMessage,
                    action: message.command
                });
            }
        }
    }

    private async sendResult(action: string, result: unknown): Promise<void> {
        await this.panel.webview.postMessage({
            command: 'result',
            action,
            result
        });
    }

    private async sendUpdateDefaults(): Promise<void> {
        try {
            const assistant = await this.pineconeService.getAssistantApi().describeAssistant(
                this.assistantName,
                this.projectContext
            );
            await this.panel.webview.postMessage({
                command: 'updateDefaults',
                instructions: assistant.instructions || '',
                metadata: assistant.metadata ? JSON.stringify(assistant.metadata, null, 2) : ''
            });
        } catch (e: unknown) {
            const classified = classifyError(e);
            if (classified.requiresLogin) {
                await this.panel.webview.postMessage({ command: 'authExpired' });
            } else {
                await this.panel.webview.postMessage({ command: 'error', message: classified.userMessage });
            }
        }
    }
}
