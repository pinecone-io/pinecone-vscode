import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PineconeService } from '../services/pineconeService';
import { PineconeTreeDataProvider } from '../providers/pineconeTreeDataProvider';
import { ProjectContext } from '../api/client';
import { ServerlessSpec } from '../api/types';
import { getErrorMessage } from '../utils/errorHandling';
import { refreshExplorer } from '../utils/refreshExplorer';
import { normalizeServerlessReadCapacity, parseReadCapacityPayload } from '../utils/readCapacity';
import { isFreeTierPlan } from '../utils/organizationPlan';

interface ConfigureIndexMessage {
    command: 'ready' | 'submit';
    payload?: {
        deletionProtection?: string;
        tags?: Array<{ key: string; value: string }>;
        readCapacity?: {
            mode?: string;
            nodeType?: string;
            replicas?: string;
            shards?: string;
        };
    };
}

export class ConfigureIndexPanel {
    private static readonly panelsByKey = new Map<string, ConfigureIndexPanel>();

    private readonly disposables: vscode.Disposable[] = [];
    private readonly panelKey: string;
    private isDisposed = false;
    private originalTags: Record<string, string> = {};
    private hasIntegratedEmbeddings = false;
    private initialReadCapacityMode: 'OnDemand' | 'Dedicated' = 'OnDemand';

    static createOrShow(
        extensionUri: vscode.Uri,
        pineconeService: PineconeService,
        treeDataProvider: PineconeTreeDataProvider,
        indexName: string,
        projectContext?: ProjectContext,
        organizationPlan?: string
    ): void {
        const column = vscode.window.activeTextEditor?.viewColumn;
        const panelKey = ConfigureIndexPanel.getPanelKey(indexName, projectContext);
        const existing = ConfigureIndexPanel.panelsByKey.get(panelKey);
        if (existing) {
            existing.panel.reveal(column || vscode.ViewColumn.One);
            existing.organizationPlan = organizationPlan;
            void existing.sendCurrentConfig();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'pineconeConfigureIndex',
            `Configure Index: ${indexName}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        new ConfigureIndexPanel(
            panel,
            extensionUri,
            pineconeService,
            treeDataProvider,
            indexName,
            projectContext,
            organizationPlan,
            panelKey
        );
    }

    private constructor(
        private readonly panel: vscode.WebviewPanel,
        private readonly extensionUri: vscode.Uri,
        private readonly pineconeService: PineconeService,
        private readonly treeDataProvider: PineconeTreeDataProvider,
        private indexName: string,
        private projectContext?: ProjectContext,
        private organizationPlan?: string,
        panelKey?: string
    ) {
        this.panelKey = panelKey || ConfigureIndexPanel.getPanelKey(indexName, projectContext);
        ConfigureIndexPanel.panelsByKey.set(this.panelKey, this);
        this.panel.webview.html = this.getHtml(this.panel.webview);
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage((message: ConfigureIndexMessage) => {
            void this.handleMessage(message);
        }, null, this.disposables);
    }

    private dispose(): void {
        if (this.isDisposed) {
            return;
        }
        this.isDisposed = true;
        ConfigureIndexPanel.panelsByKey.delete(this.panelKey);
        this.panel.dispose();
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
    }

    private static getPanelKey(indexName: string, projectContext?: ProjectContext): string {
        const project = String(projectContext?.id || 'global').trim().toLowerCase();
        const index = String(indexName || '').trim().toLowerCase();
        return `${project}::${index}`;
    }

    private getHtml(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'configureIndex.js'));
        const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'configureIndex.css'));
        const nonce = this.getNonce();
        const htmlPath = path.join(this.extensionUri.fsPath, 'src', 'webview', 'html', 'configureIndex.html');

        let html = fs.readFileSync(htmlPath, 'utf8');
        html = html.replace(/\${scriptUri}/g, scriptUri.toString());
        html = html.replace(/\${stylesUri}/g, stylesUri.toString());
        html = html.replace(/\${cspSource}/g, webview.cspSource);
        html = html.replace(/\${nonce}/g, nonce);
        html = html.replace(/\${indexName}/g, this.indexName);
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

    private async handleMessage(message: ConfigureIndexMessage): Promise<void> {
        switch (message.command) {
            case 'ready':
                await this.sendCurrentConfig();
                return;
            case 'submit':
                await this.handleSubmit(message.payload);
                return;
            default:
                return;
        }
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

    private async sendCurrentConfig(): Promise<void> {
        try {
            const isFreeTier = isFreeTierPlan(this.organizationPlan);
            this.applyProjectContext();
            const index = await this.pineconeService.describeIndex(this.indexName);
            this.originalTags = { ...(index.tags || {}) };
            this.hasIntegratedEmbeddings = !!index.embed;
            const currentReadCapacity = ('serverless' in index.spec)
                ? normalizeServerlessReadCapacity(index.spec as ServerlessSpec)
                : { mode: 'OnDemand' as const };
            this.initialReadCapacityMode = currentReadCapacity.mode;
            await this.panel.webview.postMessage({
                command: 'init',
                indexName: this.indexName,
                deletionProtection: index.deletion_protection || 'disabled',
                tags: this.originalTags,
                hasIntegratedEmbeddings: this.hasIntegratedEmbeddings,
                isFreeTier,
                canSwitchToOnDemand: currentReadCapacity.mode !== 'Dedicated',
                readCapacity: {
                    mode: currentReadCapacity.mode,
                    nodeType: currentReadCapacity.dedicated?.node_type || 'b1',
                    replicas: String(currentReadCapacity.dedicated?.manual.replicas || 1),
                    shards: String(currentReadCapacity.dedicated?.manual.shards || 1)
                }
            });
        } catch (error: unknown) {
            await this.panel.webview.postMessage({
                command: 'error',
                message: getErrorMessage(error)
            });
        }
    }

    private async handleSubmit(payload?: ConfigureIndexMessage['payload']): Promise<void> {
        try {
            const isFreeTier = isFreeTierPlan(this.organizationPlan);
            const deletionProtection = String(payload?.deletionProtection || 'disabled');
            if (!['enabled', 'disabled'].includes(deletionProtection)) {
                throw new Error('Deletion protection must be enabled or disabled.');
            }

            const tagsArray = Array.isArray(payload?.tags) ? payload?.tags : [];
            const nextTags: Record<string, string> = {};
            for (const entry of tagsArray) {
                const key = String(entry?.key || '').trim();
                const value = String(entry?.value || '');
                if (!key) {
                    continue;
                }
                if (key in nextTags) {
                    throw new Error(`Duplicate tag key "${key}" is not allowed.`);
                }
                nextTags[key] = value;
            }

            // Pinecone removes tags when omitted keys are sent with empty-string values.
            // Preserve that behavior so deleting a tag in the UI persists on save.
            const tags: Record<string, string> = { ...nextTags };
            for (const existingKey of Object.keys(this.originalTags)) {
                if (!(existingKey in nextTags)) {
                    tags[existingKey] = '';
                }
            }
            const readCapacity = parseReadCapacityPayload(payload?.readCapacity, {
                allowDedicated: !this.hasIntegratedEmbeddings && !isFreeTier
            });
            if (readCapacity.error || !readCapacity.value) {
                throw new Error(readCapacity.error || 'Read capacity is invalid.');
            }
            const readCapacityValue = readCapacity.value;
            if (!isFreeTier && this.initialReadCapacityMode === 'Dedicated' && readCapacityValue.mode === 'OnDemand') {
                throw new Error('Switching a Dedicated Read Nodes index back to OnDemand is not supported in this extension.');
            }

            this.applyProjectContext();

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Saving configuration for "${this.indexName}"...`,
                cancellable: false
            }, async () => {
                const config: {
                    deletion_protection: 'enabled' | 'disabled';
                    tags: Record<string, string>;
                    spec?: {
                        serverless?: {
                            read_capacity: ReturnType<typeof normalizeServerlessReadCapacity>;
                        };
                    };
                } = {
                    deletion_protection: deletionProtection as 'enabled' | 'disabled',
                    tags
                };
                if (!this.hasIntegratedEmbeddings && !isFreeTier) {
                    config.spec = {
                        serverless: {
                            read_capacity: readCapacityValue
                        }
                    };
                }
                await this.pineconeService.configureIndex(this.indexName, {
                    ...config
                });
            });

            await this.panel.webview.postMessage({
                command: 'success',
                message: `Configuration updated for "${this.indexName}".`
            });
            this.originalTags = { ...nextTags };

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
