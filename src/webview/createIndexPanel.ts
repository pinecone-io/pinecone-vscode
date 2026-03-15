import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PineconeService } from '../services/pineconeService';
import { PineconeTreeDataProvider } from '../providers/pineconeTreeDataProvider';
import { CreateIndexForModelRequest, IndexModel, ServerlessSpec } from '../api/types';
import { CLOUD_REGIONS, EMBEDDING_MODELS, POLLING_CONFIG } from '../utils/constants';
import { refreshExplorer } from '../utils/refreshExplorer';
import { getErrorMessage } from '../utils/errorHandling';
import { ProjectContext } from '../api/client';
import { parseReadCapacityPayload } from '../utils/readCapacity';

interface CreateIndexMessage {
    command: 'ready' | 'submit';
    payload?: Record<string, unknown>;
}

export class CreateIndexPanel {
    private static readonly panelsByKey = new Map<string, CreateIndexPanel>();

    private readonly disposables: vscode.Disposable[] = [];
    private readonly panelKey: string;
    private isDisposed = false;

    static createOrShow(
        extensionUri: vscode.Uri,
        pineconeService: PineconeService,
        treeDataProvider: PineconeTreeDataProvider,
        projectContext?: ProjectContext
    ): void {
        const column = vscode.window.activeTextEditor?.viewColumn;
        const panelKey = CreateIndexPanel.getPanelKey(projectContext);
        const existing = CreateIndexPanel.panelsByKey.get(panelKey);
        if (existing) {
            existing.panel.reveal(column || vscode.ViewColumn.One);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'pineconeCreateIndex',
            'Create Index',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        new CreateIndexPanel(
            panel,
            extensionUri,
            pineconeService,
            treeDataProvider,
            projectContext,
            panelKey
        );
    }

    private constructor(
        private readonly panel: vscode.WebviewPanel,
        private readonly extensionUri: vscode.Uri,
        private readonly pineconeService: PineconeService,
        private readonly treeDataProvider: PineconeTreeDataProvider,
        private projectContext?: ProjectContext,
        panelKey?: string
    ) {
        this.panelKey = panelKey || CreateIndexPanel.getPanelKey(projectContext);
        CreateIndexPanel.panelsByKey.set(this.panelKey, this);
        this.panel.webview.html = this.getHtml(this.panel.webview);
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage((message: CreateIndexMessage) => {
            void this.handleMessage(message);
        }, null, this.disposables);
    }

    private dispose(): void {
        if (this.isDisposed) {
            return;
        }
        this.isDisposed = true;
        CreateIndexPanel.panelsByKey.delete(this.panelKey);
        this.panel.dispose();
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
    }

    private static getPanelKey(projectContext?: ProjectContext): string {
        return String(projectContext?.id || 'global').trim().toLowerCase();
    }

    private getHtml(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'createIndex.js'));
        const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'createIndex.css'));
        const nonce = this.getNonce();
        const htmlPath = path.join(this.extensionUri.fsPath, 'src', 'webview', 'html', 'createIndex.html');

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

    private async handleMessage(message: CreateIndexMessage): Promise<void> {
        switch (message.command) {
            case 'ready':
                await this.sendInit();
                return;
            case 'submit':
                await this.handleSubmit(message.payload || {});
                return;
            default:
                return;
        }
    }

    private async sendInit(): Promise<void> {
        await this.panel.webview.postMessage({
            command: 'init',
            cloudRegions: CLOUD_REGIONS,
            embeddingModels: EMBEDDING_MODELS
        });
    }

    private async handleSubmit(payload: Record<string, unknown>): Promise<void> {
        try {
            const name = String(payload.name || '').trim();
            if (!name) {
                throw new Error('Index name is required.');
            }
            if (!/^[a-z0-9-]+$/.test(name)) {
                throw new Error('Name must consist of lowercase alphanumeric characters or hyphens.');
            }
            if (name.length > 45) {
                throw new Error('Name must be 45 characters or less.');
            }

            if (this.projectContext) {
                this.pineconeService.setFullProjectContext(
                    this.projectContext.id,
                    this.projectContext.name,
                    this.projectContext.organizationId
                );
            }

            const mode = String(payload.mode || 'standard');
            if (mode === 'integrated') {
                const integrated = (payload.integrated || {}) as Record<string, unknown>;
                if (integrated.readCapacity !== undefined) {
                    const readCapacityValidation = parseReadCapacityPayload(integrated.readCapacity, {
                        allowDedicated: false
                    });
                    if (readCapacityValidation.error) {
                        throw new Error(readCapacityValidation.error);
                    }
                }
                await this.createIntegrated(name, integrated);
            } else {
                const standard = (payload.standard || {}) as Record<string, unknown>;
                await this.createStandard(name, standard);
            }

            await this.panel.webview.postMessage({ command: 'success' });
            this.panel.dispose();
        } catch (error: unknown) {
            await this.panel.webview.postMessage({
                command: 'error',
                message: getErrorMessage(error)
            });
        }
    }

    private async createStandard(name: string, payload: Record<string, unknown>): Promise<void> {
        const vectorType = String(payload.vectorType || 'dense');
        const cloud = String(payload.cloud || '');
        const region = String(payload.region || '');
        if (!cloud || !region) {
            throw new Error('Cloud and region are required.');
        }
        const readCapacity = parseReadCapacityPayload(payload.readCapacity, { allowDedicated: true });
        if (readCapacity.error || !readCapacity.value) {
            throw new Error(readCapacity.error || 'Read capacity is invalid.');
        }

        const indexConfig: Partial<IndexModel> = {
            name,
            spec: {
                serverless: {
                    cloud: cloud as 'aws' | 'gcp' | 'azure',
                    region,
                    read_capacity: readCapacity.value
                }
            }
        };

        if (vectorType === 'sparse') {
            indexConfig.vector_type = 'sparse';
            indexConfig.metric = 'dotproduct';
        } else {
            const dimension = Number(payload.dimension);
            if (!Number.isInteger(dimension) || dimension <= 0 || dimension > 20000) {
                throw new Error('Dimension must be a positive integer less than or equal to 20000.');
            }
            const metric = String(payload.metric || 'cosine');
            if (!['cosine', 'dotproduct', 'euclidean'].includes(metric)) {
                throw new Error('Metric must be cosine, dotproduct, or euclidean.');
            }
            indexConfig.dimension = dimension;
            indexConfig.metric = metric as 'cosine' | 'dotproduct' | 'euclidean';
        }

        const spec = indexConfig.spec as ServerlessSpec | undefined;
        if (!spec?.serverless?.read_capacity) {
            throw new Error('Read capacity configuration is required.');
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Creating index "${name}"...`,
            cancellable: false
        }, async (progress) => {
            await this.pineconeService.createIndex(indexConfig);
            await this.pollForReady(name, progress);
        });

        vscode.window.showInformationMessage(`Index "${name}" created successfully.`);
        void refreshExplorer({ treeDataProvider: this.treeDataProvider });
    }

    private async createIntegrated(name: string, payload: Record<string, unknown>): Promise<void> {
        const modelName = String(payload.model || '').trim();
        const textField = String(payload.textField || '').trim();
        const cloud = String(payload.cloud || '');
        const region = String(payload.region || '');

        if (!modelName) {
            throw new Error('Embedding model is required.');
        }
        if (!textField) {
            throw new Error('Text field name is required.');
        }
        if (!cloud || !region) {
            throw new Error('Cloud and region are required.');
        }

        const model = EMBEDDING_MODELS.find(entry => entry.name === modelName);
        if (!model) {
            throw new Error('Selected embedding model is not supported.');
        }

        const request: CreateIndexForModelRequest = {
            name,
            cloud: cloud as 'aws' | 'gcp' | 'azure',
            region,
            embed: {
                model: model.name,
                field_map: { text: textField }
            }
        };

        if (!model.isSparse && model.dimensions.length > 0) {
            const requestedDimension = Number(payload.dimension);
            const dimension = Number.isInteger(requestedDimension)
                ? requestedDimension
                : (model.defaultDimension ?? model.dimensions[0]);
            if (!model.dimensions.includes(dimension)) {
                throw new Error(`Dimension must be one of: ${model.dimensions.join(', ')}.`);
            }
            request.embed.dimension = dimension;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Creating index "${name}" with integrated embeddings...`,
            cancellable: false
        }, async (progress) => {
            await this.pineconeService.createIndexForModel(request);
            await this.pollForReady(name, progress);
        });

        vscode.window.showInformationMessage(`Index "${name}" created successfully.`);
        void refreshExplorer({ treeDataProvider: this.treeDataProvider });
    }

    private async pollForReady(name: string, progress: vscode.Progress<{ message?: string; increment?: number }>): Promise<void> {
        const maxWaitMs = POLLING_CONFIG.MAX_WAIT_MS;
        const pollIntervalMs = POLLING_CONFIG.POLL_INTERVAL_MS;
        const startTime = Date.now();

        progress.report({ message: 'Waiting for index to be ready...' });

        while (Date.now() - startTime < maxWaitMs) {
            await this.sleep(pollIntervalMs);
            try {
                const indexStatus = await this.pineconeService.describeIndex(name);
                const state = indexStatus.status?.state?.toLowerCase();
                if (state === 'ready') {
                    progress.report({ message: 'Index is ready.' });
                    return;
                }
                if (state === 'failed' || state === 'terminating') {
                    throw new Error(`Index creation failed with state "${indexStatus.status?.state}".`);
                }
            } catch (error: unknown) {
                const message = getErrorMessage(error);
                if (message.toLowerCase().includes('failed') || message.toLowerCase().includes('terminating')) {
                    throw error;
                }
                // Keep polling while control plane converges.
            }
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            progress.report({ message: `Waiting for index... (${elapsed}s)` });
        }
    }

    private async sleep(ms: number): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, ms));
    }
}
