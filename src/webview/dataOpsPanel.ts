/**
 * Data Operations Panel
 *
 * Webview panel for vector CRUD and import operations.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PineconeService } from '../services/pineconeService';
import { ProjectContext } from '../api/client';
import { ImportJob, Metadata } from '../api/types';
import { classifyError } from '../utils/errorHandling';
import { parseOptionalJsonObject, parseOptionalNumberArray } from '../utils/inputValidation';
import { collectPaginatedData, getActiveImports } from '../utils/jobStatus';
import { isFreeTierPlan } from '../utils/organizationPlan';

interface DataOpsMessage {
    command: string;
    payload?: Record<string, unknown>;
    text?: string;
    copyId?: string;
}

export class DataOpsPanel {
    private static readonly panelsByKey = new Map<string, DataOpsPanel>();

    private readonly panel: vscode.WebviewPanel;
    private readonly disposables: vscode.Disposable[] = [];
    private readonly panelKey: string;
    private isDisposed = false;

    public static createOrShow(
        extensionUri: vscode.Uri,
        pineconeService: PineconeService,
        indexName: string,
        indexHost: string,
        hasIntegratedEmbeddings: boolean,
        projectContext?: ProjectContext,
        organizationPlan?: string
    ): void {
        const column = vscode.window.activeTextEditor?.viewColumn;
        const panelKey = DataOpsPanel.getPanelKey(indexHost, projectContext);
        const existing = DataOpsPanel.panelsByKey.get(panelKey);
        if (existing) {
            existing.panel.reveal(column || vscode.ViewColumn.One);
            existing.setIndex(indexName, indexHost, hasIntegratedEmbeddings, projectContext, organizationPlan);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'pineconeDataOps',
            `Data Ops: ${indexName}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        new DataOpsPanel(
            panel,
            extensionUri,
            pineconeService,
            indexName,
            indexHost,
            hasIntegratedEmbeddings,
            projectContext,
            organizationPlan,
            panelKey
        );
    }

    private constructor(
        panel: vscode.WebviewPanel,
        private readonly extensionUri: vscode.Uri,
        private readonly pineconeService: PineconeService,
        private indexName: string,
        private indexHost: string,
        private hasIntegratedEmbeddings: boolean,
        private projectContext?: ProjectContext,
        private organizationPlan?: string,
        panelKey?: string
    ) {
        this.panel = panel;
        this.panelKey = panelKey || DataOpsPanel.getPanelKey(indexHost, projectContext);
        DataOpsPanel.panelsByKey.set(this.panelKey, this);
        this.panel.webview.html = this.getHtml(this.panel.webview);

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage((message: DataOpsMessage) => {
            void this.handleMessage(message);
        }, null, this.disposables);
    }

    private setIndex(
        indexName: string,
        indexHost: string,
        hasIntegratedEmbeddings: boolean,
        projectContext?: ProjectContext,
        organizationPlan?: string
    ): void {
        this.indexName = indexName;
        this.indexHost = indexHost;
        this.hasIntegratedEmbeddings = hasIntegratedEmbeddings;
        this.projectContext = projectContext;
        this.organizationPlan = organizationPlan;
        this.panel.title = `Data Ops: ${indexName}`;
        void this.panel.webview.postMessage({
            command: 'setIndex',
            indexName,
            hasIntegratedEmbeddings,
            importsDisabled: this.isImportsDisabled()
        });
        if (this.isImportsDisabled()) {
            void this.panel.webview.postMessage({
                command: 'activeImports',
                imports: []
            });
        } else {
            void this.sendActiveImports();
        }
    }

    private dispose(): void {
        if (this.isDisposed) {
            return;
        }
        this.isDisposed = true;
        DataOpsPanel.panelsByKey.delete(this.panelKey);
        this.panel.dispose();
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
    }

    private static getPanelKey(indexHost: string, projectContext?: ProjectContext): string {
        const host = String(indexHost || '').trim().toLowerCase();
        const project = String(projectContext?.id || '').trim().toLowerCase();
        return `${project || 'global'}::${host}`;
    }

    private getHtml(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'dataOps.js'));
        const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'dataOps.css'));
        const nonce = this.getNonce();

        const htmlPath = path.join(this.extensionUri.fsPath, 'src', 'webview', 'html', 'dataOps.html');
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

    private async handleMessage(message: DataOpsMessage): Promise<void> {
        const dataPlane = this.pineconeService.getDataPlane();
        const payload = message.payload || {};

        try {
            switch (message.command) {
                case 'ready':
                    await this.panel.webview.postMessage({
                        command: 'setIndex',
                        indexName: this.indexName,
                        hasIntegratedEmbeddings: this.hasIntegratedEmbeddings,
                        importsDisabled: this.isImportsDisabled()
                    });
                    if (this.isImportsDisabled()) {
                        await this.panel.webview.postMessage({
                            command: 'activeImports',
                            imports: []
                        });
                    } else {
                        await this.sendActiveImports();
                    }
                    return;
                case 'copyToClipboard':
                    await this.copyTextToClipboard(message.text, message.copyId);
                    return;
                case 'upsertVectors': {
                    if (this.hasIntegratedEmbeddings) {
                        throw new Error('This index uses integrated embeddings. Use "Upsert Records" instead.');
                    }
                    const values = parseOptionalNumberArray(
                        String(payload.values ?? ''),
                        'Vector values must be a JSON array of numbers.'
                    );
                    if (values.error || !values.value) {
                        throw new Error(values.error || 'Vector values are required.');
                    }
                    const metadata = parseOptionalJsonObject(
                        String(payload.metadata ?? ''),
                        'Vector metadata must be a JSON object.'
                    );
                    if (metadata.error) {
                        throw new Error(metadata.error);
                    }

                    const response = await dataPlane.upsertVectors(
                        this.indexHost,
                        {
                            namespace: String(payload.namespace || '') || undefined,
                            vectors: [{
                                id: String(payload.id || '').trim(),
                                values: values.value,
                                metadata: metadata.value as Metadata | undefined
                            }]
                        },
                        this.projectContext
                    );
                    await this.sendResult(message.command, response);
                    return;
                }
                case 'upsertRecords': {
                    if (!this.hasIntegratedEmbeddings) {
                        throw new Error('This index does not use integrated embeddings. Use "Upsert Vector" instead.');
                    }
                    const records = parseOptionalJsonObject(
                        String(payload.records ?? ''),
                        'Records must be a JSON object with a "records" array.'
                    );
                    if (records.error || !records.value || !Array.isArray(records.value.records)) {
                        throw new Error(records.error || 'Records must be a JSON object with a "records" array.');
                    }
                    const response = await dataPlane.upsertRecords(
                        this.indexHost,
                        String(payload.namespace || ''),
                        { records: records.value.records as Array<Record<string, unknown>> },
                        this.projectContext
                    );
                    await this.sendResult(message.command, response);
                    return;
                }
                case 'fetchVectors': {
                    const ids = String(payload.ids || '')
                        .split(',')
                        .map(v => v.trim())
                        .filter(Boolean);
                    if (ids.length === 0) {
                        throw new Error('At least one vector ID is required.');
                    }
                    const response = await dataPlane.fetchVectors(
                        this.indexHost,
                        ids,
                        String(payload.namespace || '') || undefined,
                        this.projectContext
                    );
                    await this.sendResult(message.command, response);
                    return;
                }
                case 'fetchByMetadata': {
                    const filter = parseOptionalJsonObject(
                        String(payload.filter ?? ''),
                        'Filter must be valid JSON.'
                    );
                    if (filter.error || !filter.value) {
                        throw new Error(filter.error || 'Filter is required.');
                    }
                    const response = await dataPlane.fetchVectorsByMetadata(
                        this.indexHost,
                        {
                            namespace: String(payload.namespace || '') || undefined,
                            filter: filter.value,
                            limit: Number(payload.limit) || undefined
                        },
                        this.projectContext
                    );
                    await this.sendResult(message.command, response);
                    return;
                }
                case 'updateVector': {
                    const values = parseOptionalNumberArray(
                        String(payload.values ?? ''),
                        'Vector values must be a JSON array of numbers.'
                    );
                    if (values.error) {
                        throw new Error(values.error);
                    }
                    const setMetadata = parseOptionalJsonObject(
                        String(payload.setMetadata ?? ''),
                        'Set metadata must be a JSON object.'
                    );
                    if (setMetadata.error) {
                        throw new Error(setMetadata.error);
                    }

                    await dataPlane.updateVector(
                        this.indexHost,
                        {
                            namespace: String(payload.namespace || '') || undefined,
                            id: String(payload.id || '').trim(),
                            values: values.value,
                            set_metadata: setMetadata.value
                        },
                        this.projectContext
                    );
                    await this.sendResult(message.command, { success: true });
                    return;
                }
                case 'updateByMetadata': {
                    const filter = parseOptionalJsonObject(
                        String(payload.filter ?? ''),
                        'Filter must be valid JSON.'
                    );
                    const setMetadata = parseOptionalJsonObject(
                        String(payload.setMetadata ?? ''),
                        'Set metadata must be a JSON object.'
                    );
                    if (filter.error || !filter.value) {
                        throw new Error(filter.error || 'Filter is required.');
                    }
                    if (setMetadata.error || !setMetadata.value) {
                        throw new Error(setMetadata.error || 'Set metadata is required.');
                    }
                    const response = await dataPlane.updateVectorsByMetadata(
                        this.indexHost,
                        {
                            namespace: String(payload.namespace || '') || undefined,
                            filter: filter.value,
                            set_metadata: setMetadata.value,
                            dry_run: Boolean(payload.dryRun)
                        },
                        this.projectContext
                    );
                    await this.sendResult(message.command, response);
                    return;
                }
                case 'deleteVectors': {
                    const ids = String(payload.ids || '')
                        .split(',')
                        .map(v => v.trim())
                        .filter(Boolean);
                    const filter = parseOptionalJsonObject(
                        String(payload.filter ?? ''),
                        'Filter must be valid JSON.'
                    );
                    if (filter.error) {
                        throw new Error(filter.error);
                    }
                    await dataPlane.deleteVectors(
                        this.indexHost,
                        {
                            namespace: String(payload.namespace || '') || undefined,
                            ids: ids.length > 0 ? ids : undefined,
                            filter: filter.value,
                            delete_all: Boolean(payload.deleteAll)
                        },
                        this.projectContext
                    );
                    await this.sendResult(message.command, { success: true });
                    return;
                }
                case 'listVectorIds': {
                    const response = await dataPlane.listVectorIds(
                        this.indexHost,
                        String(payload.namespace || '') || undefined,
                        String(payload.prefix || '') || undefined,
                        Number(payload.limit) || undefined,
                        String(payload.paginationToken || '') || undefined,
                        this.projectContext
                    );
                    await this.sendResult(message.command, response);
                    return;
                }
                case 'startImport': {
                    if (this.isImportsDisabled()) {
                        throw new Error('Imports are not available on the Free plan.');
                    }
                    const response = await dataPlane.startImport(
                        this.indexHost,
                        {
                            uri: String(payload.uri || '').trim(),
                            integration_id: String(payload.integrationId || '') || undefined,
                            mode: (String(payload.mode || '') || undefined) as 'continue' | 'overwrite' | undefined,
                            error_mode: (String(payload.errorMode || '') || undefined) as 'continue' | 'abort' | undefined,
                            namespace: String(payload.namespace || '') || undefined
                        },
                        this.projectContext
                    );
                    await this.sendResult(message.command, response);
                    await this.sendActiveImports();
                    return;
                }
                case 'refreshActiveImports': {
                    if (this.isImportsDisabled()) {
                        throw new Error('Imports are not available on the Free plan.');
                    }
                    await this.sendActiveImports();
                    return;
                }
                case 'cancelImport': {
                    if (this.isImportsDisabled()) {
                        throw new Error('Imports are not available on the Free plan.');
                    }
                    const importId = String(payload.importId || '').trim();
                    if (!importId) {
                        throw new Error('Select an active import job to cancel.');
                    }

                    await dataPlane.cancelImport(
                        this.indexHost,
                        importId,
                        this.projectContext
                    );
                    await this.sendResult(message.command, {
                        id: importId,
                        canceled: true
                    });
                    await this.sendActiveImports();
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

    private async copyTextToClipboard(text: string | undefined, copyId: string | undefined): Promise<void> {
        if (!copyId) {
            return;
        }
        try {
            await vscode.env.clipboard.writeText(String(text || ''));
            await this.panel.webview.postMessage({ command: 'copied', copyId });
        } catch {
            await this.panel.webview.postMessage({
                command: 'copyError',
                copyId,
                message: 'Failed to copy text to clipboard.'
            });
        }
    }

    private async sendActiveImports(): Promise<void> {
        try {
            const dataPlane = this.pineconeService.getDataPlane();
            const imports = await collectPaginatedData<ImportJob>(
                (paginationToken) => dataPlane.listImports(
                    this.indexHost,
                    100,
                    paginationToken,
                    this.projectContext
                )
            );
            const activeImports = getActiveImports(imports);
            await this.panel.webview.postMessage({
                command: 'activeImports',
                imports: activeImports
            });
        } catch (error: unknown) {
            const classified = classifyError(error);
            if (classified.category === 'not_found') {
                await this.panel.webview.postMessage({
                    command: 'activeImports',
                    imports: []
                });
                return;
            }
            throw error;
        }
    }

    private isImportsDisabled(): boolean {
        return isFreeTierPlan(this.organizationPlan);
    }
}
