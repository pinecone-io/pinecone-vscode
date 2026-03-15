import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PineconeService } from '../services/pineconeService';
import { PineconeTreeDataProvider } from '../providers/pineconeTreeDataProvider';
import { ProjectContext } from '../api/client';
import { Metadata } from '../api/types';
import { getErrorMessage } from '../utils/errorHandling';
import { parseOptionalJsonObject } from '../utils/inputValidation';
import { refreshExplorer } from '../utils/refreshExplorer';
import { FREE_TIER_ASSISTANT_REGION, isFreeTierPlan } from '../utils/organizationPlan';

interface CreateAssistantMessage {
    command: 'ready' | 'submit';
    payload?: {
        name?: string;
        region?: string;
        instructions?: string;
        metadata?: string;
    };
}

export class CreateAssistantPanel {
    private static readonly panelsByKey = new Map<string, CreateAssistantPanel>();

    private readonly disposables: vscode.Disposable[] = [];
    private readonly panelKey: string;
    private isDisposed = false;

    static createOrShow(
        extensionUri: vscode.Uri,
        pineconeService: PineconeService,
        treeDataProvider: PineconeTreeDataProvider | undefined,
        projectContext?: ProjectContext,
        organizationPlan?: string
    ): void {
        const column = vscode.window.activeTextEditor?.viewColumn;
        const panelKey = CreateAssistantPanel.getPanelKey(projectContext);
        const existing = CreateAssistantPanel.panelsByKey.get(panelKey);
        if (existing) {
            existing.panel.reveal(column || vscode.ViewColumn.One);
            existing.organizationPlan = organizationPlan;
            void existing.sendInit();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'pineconeCreateAssistant',
            'Create Assistant',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        new CreateAssistantPanel(
            panel,
            extensionUri,
            pineconeService,
            treeDataProvider,
            projectContext,
            organizationPlan,
            panelKey
        );
    }

    private constructor(
        private readonly panel: vscode.WebviewPanel,
        private readonly extensionUri: vscode.Uri,
        private readonly pineconeService: PineconeService,
        private readonly treeDataProvider: PineconeTreeDataProvider | undefined,
        private projectContext?: ProjectContext,
        private organizationPlan?: string,
        panelKey?: string
    ) {
        this.panelKey = panelKey || CreateAssistantPanel.getPanelKey(projectContext);
        CreateAssistantPanel.panelsByKey.set(this.panelKey, this);
        this.panel.webview.html = this.getHtml(this.panel.webview);
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage((message: CreateAssistantMessage) => {
            void this.handleMessage(message);
        }, null, this.disposables);
    }

    private dispose(): void {
        if (this.isDisposed) {
            return;
        }
        this.isDisposed = true;
        CreateAssistantPanel.panelsByKey.delete(this.panelKey);
        this.panel.dispose();
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
    }

    private static getPanelKey(projectContext?: ProjectContext): string {
        return String(projectContext?.id || 'global').trim().toLowerCase();
    }

    private getHtml(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'createAssistant.js'));
        const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'createAssistant.css'));
        const nonce = this.getNonce();
        const htmlPath = path.join(this.extensionUri.fsPath, 'src', 'webview', 'html', 'createAssistant.html');

        let html = fs.readFileSync(htmlPath, 'utf8');
        html = html.replace(/\${scriptUri}/g, scriptUri.toString());
        html = html.replace(/\${stylesUri}/g, stylesUri.toString());
        html = html.replace(/\${cspSource}/g, webview.cspSource);
        html = html.replace(/\${nonce}/g, nonce);
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

    private async handleMessage(message: CreateAssistantMessage): Promise<void> {
        switch (message.command) {
            case 'ready':
                await this.sendInit();
                return;
            case 'submit':
                await this.handleSubmit(message.payload);
                return;
            default:
                return;
        }
    }

    private async sendInit(): Promise<void> {
        const isFreeTier = isFreeTierPlan(this.organizationPlan);
        const config = vscode.workspace.getConfiguration('pinecone');
        const defaultRegion = config.get<string>('defaultRegion', 'us');
        await this.panel.webview.postMessage({
            command: 'init',
            defaultRegion: isFreeTier
                ? FREE_TIER_ASSISTANT_REGION
                : (defaultRegion === 'eu' ? 'eu' : 'us'),
            isFreeTier,
            freeTierRegion: FREE_TIER_ASSISTANT_REGION
        });
    }

    private applyProjectContext(): void {
        if (!this.projectContext) {
            return;
        }
        this.pineconeService.setFullProjectContext(
            this.projectContext.id,
            this.projectContext.name,
            this.projectContext.organizationId
        );
    }

    private async handleSubmit(payload?: CreateAssistantMessage['payload']): Promise<void> {
        try {
            const isFreeTier = isFreeTierPlan(this.organizationPlan);
            const name = String(payload?.name || '').trim();
            if (!name) {
                throw new Error('Name is required.');
            }
            if (!/^[a-z0-9-]+$/.test(name)) {
                throw new Error('Name must consist of lowercase alphanumeric characters or hyphens.');
            }
            if (name.length > 45) {
                throw new Error('Name must be 45 characters or less.');
            }

            const region = String(payload?.region || 'us').trim();
            if (!['us', 'eu'].includes(region)) {
                throw new Error('Region must be "us" or "eu".');
            }
            if (isFreeTier && region !== FREE_TIER_ASSISTANT_REGION) {
                throw new Error(`Free tier assistants must use region "${FREE_TIER_ASSISTANT_REGION}".`);
            }

            const metadataResult = parseOptionalJsonObject(
                String(payload?.metadata || ''),
                'Metadata must be valid JSON.'
            );
            if (metadataResult.error) {
                throw new Error(metadataResult.error);
            }

            const instructions = String(payload?.instructions || '').trim();

            this.applyProjectContext();

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Creating assistant "${name}"...`,
                cancellable: false
            }, async () => {
                await this.pineconeService.createAssistant(
                    name,
                    region,
                    instructions || undefined,
                    metadataResult.value as Metadata | undefined,
                    this.projectContext
                );
            });

            await this.panel.webview.postMessage({
                command: 'success',
                message: `Assistant "${name}" created successfully.`
            });

            void refreshExplorer({
                treeDataProvider: this.treeDataProvider,
                delayMs: 0,
                focusExplorer: false
            });
        } catch (error: unknown) {
            await this.panel.webview.postMessage({
                command: 'error',
                message: getErrorMessage(error)
            });
        }
    }
}
