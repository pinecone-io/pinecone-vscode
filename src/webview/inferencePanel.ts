/**
 * Inference Panel
 *
 * Webview panel for embeddings, reranking, and model discovery.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PineconeService } from '../services/pineconeService';
import { ProjectContext } from '../api/client';
import { classifyError } from '../utils/errorHandling';
import { AUTH_CONTEXTS } from '../utils/constants';

interface InferenceMessage {
    command: string;
    payload?: Record<string, unknown>;
}

interface InferenceModelInfo {
    name?: string;
    model?: string;
    id?: string;
    type?: string;
    [key: string]: unknown;
}

export class InferencePanel {
    private static readonly panelsByKey = new Map<string, InferencePanel>();

    private readonly panel: vscode.WebviewPanel;
    private readonly disposables: vscode.Disposable[] = [];
    private readonly panelKey: string;
    private isDisposed = false;
    private readonly modelsByName = new Map<string, InferenceModelInfo>();

    private getProjectContext(): ProjectContext | undefined {
        const activeContext = this.pineconeService.getCurrentProjectContext();
        if (activeContext) {
            return activeContext;
        }

        const targetProject = this.pineconeService.getTargetProject();
        const targetOrganization = this.pineconeService.getTargetOrganization();
        if (!targetProject || !targetOrganization) {
            return undefined;
        }
        return {
            id: targetProject.id,
            name: targetProject.name,
            organizationId: targetOrganization.id
        };
    }

    private async loadModelOptions(): Promise<void> {
        const inference = this.pineconeService.getInferenceApi();
        const authContext = this.pineconeService.getAuthContext();
        const projectContext = this.getProjectContext();
        if (this.requiresProjectContext(authContext) && !projectContext) {
            await this.panel.webview.postMessage({
                command: 'error',
                message: 'Select a project in the Pinecone explorer, then reopen the Inference Toolbox.'
            });
            return;
        }

        const allModels = await inference.listModels(undefined, projectContext);
        this.modelsByName.clear();
        allModels.forEach(model => {
            const normalized = this.normalizeModelName(model).toLowerCase();
            if (normalized) {
                this.modelsByName.set(normalized, model);
            }
        });
        const embedModels = this.filterModelsByType(allModels, 'embed');
        const rerankModels = this.filterModelsByType(allModels, 'rerank');
        await this.panel.webview.postMessage({
            command: 'models',
            embedModels: embedModels.map(model => this.normalizeModelName(model)).filter(Boolean).sort(),
            rerankModels: rerankModels.map(model => this.normalizeModelName(model)).filter(Boolean).sort()
        });
    }

    public static createOrShow(extensionUri: vscode.Uri, pineconeService: PineconeService): void {
        const column = vscode.window.activeTextEditor?.viewColumn;
        const panelKey = InferencePanel.getPanelKey(pineconeService);
        const existing = InferencePanel.panelsByKey.get(panelKey);
        if (existing) {
            existing.panel.reveal(column || vscode.ViewColumn.One);
            void existing.reloadModels();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'pineconeInference',
            'Inference Toolbox',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        new InferencePanel(panel, extensionUri, pineconeService, panelKey);
    }

    private constructor(
        panel: vscode.WebviewPanel,
        private readonly extensionUri: vscode.Uri,
        private readonly pineconeService: PineconeService,
        panelKey?: string
    ) {
        this.panel = panel;
        this.panelKey = panelKey || InferencePanel.getPanelKey(pineconeService);
        InferencePanel.panelsByKey.set(this.panelKey, this);
        this.panel.webview.html = this.getHtml(this.panel.webview);

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage((message: InferenceMessage) => {
            void this.handleMessage(message);
        }, null, this.disposables);
    }

    private dispose(): void {
        if (this.isDisposed) {
            return;
        }
        this.isDisposed = true;
        InferencePanel.panelsByKey.delete(this.panelKey);
        this.panel.dispose();
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
    }

    private getHtml(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'inference.js'));
        const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'inference.css'));
        const nonce = this.getNonce();
        const htmlPath = path.join(this.extensionUri.fsPath, 'src', 'webview', 'html', 'inference.html');
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

    private async handleMessage(message: InferenceMessage): Promise<void> {
        const inference = this.pineconeService.getInferenceApi();
        const payload = message.payload || {};
        const authContext = this.pineconeService.getAuthContext();
        const projectContext = this.getProjectContext();
        if (this.requiresProjectContext(authContext) && !projectContext) {
            await this.panel.webview.postMessage({
                command: 'error',
                message: 'Select a project in the Pinecone explorer before using Inference Toolbox actions.'
            });
            return;
        }

        try {
            switch (message.command) {
                case 'ready':
                    await this.reloadModels();
                    return;
                case 'embed': {
                    const model = String(payload.model || '').trim();
                    if (!model) {
                        throw new Error('Select an embedding model.');
                    }
                    const inputs = this.parseEmbedInputs(String(payload.inputs || ''));
                    const inputTexts = inputs.map(input => this.extractEmbedInputText(input));
                    const embedParameters = this.buildEmbedParameters(
                        model,
                        String(payload.inputType || '').trim()
                    );
                    const response = await inference.embed({
                        model,
                        inputs,
                        parameters: embedParameters
                    }, projectContext);
                    await this.sendResult('embed', response, { inputTexts });
                    return;
                }
                case 'rerank': {
                    const model = String(payload.model || '').trim();
                    if (!model) {
                        throw new Error('Select a rerank model.');
                    }
                    const query = String(payload.query || '').trim();
                    if (!query) {
                        throw new Error('Query is required for rerank.');
                    }
                    const documents = this.parseRerankDocuments(payload.documents);
                    let truncation = this.applyRerankTokenBudget(model, query, documents);
                    let response;
                    try {
                        response = await inference.rerank({
                            model,
                            query,
                            documents: truncation.documents,
                            top_n: Number(payload.topN) || undefined
                        }, projectContext);
                    } catch (rerankError: unknown) {
                        const strictLimit = this.extractTokenLimitFromError(rerankError);
                        if (!strictLimit || strictLimit >= truncation.tokenLimit) {
                            throw rerankError;
                        }
                        truncation = this.applyRerankTokenBudget(model, query, documents, strictLimit);
                        response = await inference.rerank({
                            model,
                            query,
                            documents: truncation.documents,
                            top_n: Number(payload.topN) || undefined
                        }, projectContext);
                    }
                    await this.sendResult('rerank', response, {
                        truncatedDocuments: truncation.truncatedDocuments,
                        tokenLimit: truncation.tokenLimit
                    });
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
                    message: classified.category === 'not_found' ? classified.message : classified.userMessage
                });
            }
        }
    }

    private async sendResult(action: 'embed' | 'rerank', result: unknown, meta?: Record<string, unknown>): Promise<void> {
        await this.panel.webview.postMessage({ command: 'result', action, result, meta });
    }

    private async reloadModels(): Promise<void> {
        try {
            await this.loadModelOptions();
        } catch (e: unknown) {
            const classified = classifyError(e);
            if (classified.requiresLogin) {
                await this.panel.webview.postMessage({ command: 'authExpired' });
            } else {
                await this.panel.webview.postMessage({
                    command: 'error',
                    message: classified.category === 'not_found' ? classified.message : classified.userMessage
                });
            }
        }
    }

    private requiresProjectContext(authContext: string): boolean {
        return authContext === AUTH_CONTEXTS.USER_TOKEN || authContext === AUTH_CONTEXTS.SERVICE_ACCOUNT;
    }

    private filterModelsByType(models: InferenceModelInfo[], type: 'embed' | 'rerank'): InferenceModelInfo[] {
        const typed = models.filter(model => String(model.type || '').toLowerCase() === type);
        if (typed.length > 0) {
            return typed;
        }

        // Fallback if model type is missing in response payload.
        const keyword = type === 'embed' ? 'embed' : 'rerank';
        const byName = models.filter(model => {
            const name = String(model.model || model.name || model.id || '').toLowerCase();
            return name.includes(keyword);
        });
        return byName.length > 0 ? byName : models;
    }

    private parseEmbedInputs(rawInputs: string): Array<Record<string, unknown>> {
        const trimmed = rawInputs.trim();
        if (!trimmed) {
            throw new Error('Embed inputs are required.');
        }

        if (trimmed.startsWith('[')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    return this.normalizeInputObjects(parsed, 'Embed inputs array entries must be strings or objects.');
                }
            } catch {
                throw new Error('Embed inputs JSON must be a valid array of strings or objects.');
            }
        }

        const lines = trimmed.split('\n').map(v => v.trim()).filter(Boolean);
        if (!lines.length) {
            throw new Error('Embed inputs are required.');
        }
        return lines.map(text => ({ text }));
    }

    private parseRerankDocuments(rawDocuments: unknown): Array<Record<string, unknown>> {
        if (Array.isArray(rawDocuments)) {
            const docs = this.normalizeInputObjects(
                rawDocuments,
                'Rerank documents must be strings or objects.'
            );
            if (!docs.length) {
                throw new Error('At least one document is required for rerank.');
            }
            return docs;
        }

        const raw = String(rawDocuments || '').trim();
        if (!raw) {
            throw new Error('At least one document is required for rerank.');
        }

        if (raw.startsWith('[')) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    const docs = this.normalizeInputObjects(parsed, 'Rerank documents must be strings or objects.');
                    if (!docs.length) {
                        throw new Error('At least one document is required for rerank.');
                    }
                    return docs;
                }
            } catch {
                throw new Error('Documents JSON must be a valid array of strings or objects.');
            }
        }

        // Backward compatibility for old single-textarea payloads.
        return [{ text: raw }];
    }

    private normalizeInputObjects(values: unknown[], invalidMessage: string): Array<Record<string, unknown>> {
        const normalized: Array<Record<string, unknown>> = [];
        for (const entry of values) {
            if (typeof entry === 'string') {
                const text = entry.trim();
                if (text) {
                    normalized.push({ text });
                }
                continue;
            }
            if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
                normalized.push(entry as Record<string, unknown>);
                continue;
            }
            throw new Error(invalidMessage);
        }
        return normalized;
    }

    private applyRerankTokenBudget(
        model: string,
        query: string,
        documents: Array<Record<string, unknown>>,
        tokenLimitOverride?: number
    ): { documents: Array<Record<string, unknown>>; truncatedDocuments: number; tokenLimit: number } {
        const tokenLimit = tokenLimitOverride || this.resolveRerankPairTokenLimit(model);
        const queryTokens = this.estimateTokenCount(query);
        const maxDocumentTokens = Math.max(32, tokenLimit - queryTokens - 8);

        let truncatedDocuments = 0;
        const budgeted = documents.map(document => {
            const textKey = this.getDocumentTextField(document);
            if (!textKey) {
                return document;
            }

            const originalText = String(document[textKey] || '');
            const truncatedText = this.truncateTextByTokenBudget(originalText, maxDocumentTokens);
            if (truncatedText === originalText) {
                return document;
            }

            truncatedDocuments += 1;
            return {
                ...document,
                [textKey]: truncatedText
            };
        });

        return {
            documents: budgeted,
            truncatedDocuments,
            tokenLimit
        };
    }

    private resolveRerankPairTokenLimit(model: string): number {
        const normalizedModel = model.trim().toLowerCase();
        const modelInfo = this.modelsByName.get(normalizedModel);

        const limits = [
            modelInfo?.max_tokens_per_query_document_pair,
            modelInfo?.max_query_document_tokens,
            modelInfo?.max_input_tokens,
            modelInfo?.max_tokens,
            modelInfo?.context_length,
            modelInfo?.token_limit,
            modelInfo?.pair_token_limit
        ];

        for (const candidate of limits) {
            const parsed = Number(candidate);
            if (Number.isInteger(parsed) && parsed > 0) {
                return parsed;
            }
        }

        if (normalizedModel.includes('pinecone-rerank')) {
            return 512;
        }
        if (normalizedModel.includes('cohere-rerank-3.5')) {
            return 4096;
        }

        return 1024;
    }

    private estimateTokenCount(text: string): number {
        const normalized = text.trim();
        if (!normalized) {
            return 0;
        }

        const wordEstimate = normalized.split(/\s+/u).filter(Boolean).length;
        const pieceEstimate = (normalized.match(/\w+|[^\s\w]/gu) || []).length;
        const charEstimate = Math.ceil(normalized.length / 2);
        return Math.max(wordEstimate, pieceEstimate, charEstimate);
    }

    private truncateTextByTokenBudget(text: string, maxTokens: number): string {
        let candidate = text.trim();
        if (!candidate) {
            return candidate;
        }
        if (this.estimateTokenCount(candidate) <= maxTokens) {
            return candidate;
        }

        const maxChars = Math.max(128, maxTokens * 2);
        candidate = candidate.slice(0, Math.min(candidate.length, maxChars));
        candidate = this.trimToWordBoundary(candidate);

        while (candidate.length > 0 && this.estimateTokenCount(candidate) > maxTokens) {
            const nextLength = Math.max(1, Math.floor(candidate.length * 0.9));
            candidate = this.trimToWordBoundary(candidate.slice(0, nextLength));
        }

        return candidate || text.slice(0, Math.max(1, Math.min(text.length, maxChars))).trim();
    }

    private trimToWordBoundary(text: string): string {
        const trimmed = text.trimEnd();
        const lastWhitespace = trimmed.lastIndexOf(' ');
        if (lastWhitespace > Math.floor(trimmed.length * 0.6)) {
            return trimmed.slice(0, lastWhitespace).trimEnd();
        }
        return trimmed;
    }

    private getDocumentTextField(document: Record<string, unknown>): string | undefined {
        const preferredKeys = ['text', 'document', 'content', 'chunk_text'];
        for (const key of preferredKeys) {
            if (typeof document[key] === 'string') {
                return key;
            }
        }
        const fallback = Object.entries(document).find(([, value]) => typeof value === 'string');
        return fallback?.[0];
    }

    private normalizeModelName(model: InferenceModelInfo): string {
        return String(model.model || model.name || model.id || '').trim();
    }

    private buildEmbedParameters(model: string, inputType: string): Record<string, unknown> | undefined {
        const parameters: Record<string, unknown> = {};
        if (this.isSparseEmbedModel(model)) {
            parameters.input_type = 'passage';
        } else {
            parameters.input_type = inputType === 'passage' || inputType === 'query'
                ? inputType
                : 'query';
        }

        return Object.keys(parameters).length > 0 ? parameters : undefined;
    }

    private isSparseEmbedModel(model: string): boolean {
        return model.trim().toLowerCase().includes('sparse');
    }

    private extractEmbedInputText(input: Record<string, unknown>): string {
        const directText = input.text;
        if (typeof directText === 'string') {
            return directText;
        }

        const fallback = Object.values(input).find(value => typeof value === 'string');
        if (typeof fallback === 'string') {
            return fallback;
        }

        try {
            return JSON.stringify(input);
        } catch {
            return '';
        }
    }

    private extractTokenLimitFromError(error: unknown): number | undefined {
        const message = this.getErrorText(error);
        const match = message.match(/maximum token limit of\s+(\d+)/i)
            || message.match(/limit of\s+(\d+)\s+for each query\+document pair/i);
        if (!match) {
            return undefined;
        }
        const parsed = Number(match[1]);
        return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
    }

    private getErrorText(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        if (typeof error === 'string') {
            return error;
        }
        try {
            return JSON.stringify(error);
        } catch {
            return String(error || '');
        }
    }

    private static getPanelKey(pineconeService: PineconeService): string {
        const activeProject = pineconeService.getCurrentProjectContext();
        if (activeProject?.id) {
            return String(activeProject.id).trim().toLowerCase();
        }

        const targetProject = pineconeService.getTargetProject();
        if (targetProject?.id) {
            return String(targetProject.id).trim().toLowerCase();
        }

        return 'global';
    }
}
