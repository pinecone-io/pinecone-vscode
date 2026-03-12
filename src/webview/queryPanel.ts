/**
 * Query Panel
 * 
 * WebView panel for querying Pinecone vector indexes.
 * Provides an interactive interface for both:
 * - Text-based search (for indexes with integrated embeddings)
 * - Vector-based search (for standard indexes)
 * 
 * @module webview/queryPanel
 */

import * as vscode from 'vscode';
import { PineconeService } from '../services/pineconeService';
import { QueryParams, SearchParams } from '../api/dataPlane';
import { IndexEmbedConfig } from '../api/types';
import { ProjectContext } from '../api/client';
import { classifyError } from '../utils/errorHandling';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Parameters received from the query webview form.
 * Supports both text (integrated embeddings) and vector (standard) queries.
 */
interface QueryFormParams {
    /** Text query for integrated embedding indexes */
    textQuery?: string;
    /** Vector array for standard indexes */
    vectorStr?: string;
    /** Query by existing vector ID */
    id?: string;
    namespace?: string;
    topK?: string;
    filterStr?: string;
    includeValues?: boolean;
    includeMetadata?: boolean;
}

/**
 * Manages the query webview panel for index searches.
 * 
 * Provides an interactive interface for querying Pinecone indexes
 * with support for:
 * - Text-based search (for indexes with integrated embeddings)
 * - Vector-based search (for standard indexes)
 * - ID lookup, filtering, and namespaces
 */
export class QueryPanel {
    public static currentPanel: QueryPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _indexName: string = '';
    private _indexHost: string = '';
    /** Integrated embedding config (if the index uses hosted embeddings) */
    private _embedConfig: IndexEmbedConfig | undefined;
    /** Project context for API authentication (required for JWT auth) */
    private _projectContext?: ProjectContext;

    /**
     * Creates or reveals the query panel.
     * 
     * If a panel already exists, it will be revealed and optionally
     * updated with new index information.
     * 
     * @param extensionUri - Extension URI for loading webview resources
     * @param pineconeService - Service for API calls
     * @param indexName - Name of the index to query
     * @param indexHost - Index host URL
     * @param embedConfig - Optional embedding config (if index has integrated embeddings)
     * @param projectContext - Optional project context for API authentication
     */
    public static createOrShow(
        extensionUri: vscode.Uri, 
        pineconeService: PineconeService, 
        indexName: string, 
        indexHost: string,
        embedConfig?: IndexEmbedConfig,
        projectContext?: ProjectContext
    ): void {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // Reuse existing panel if available
        if (QueryPanel.currentPanel) {
            QueryPanel.currentPanel._panel.reveal(column);
            QueryPanel.currentPanel.setIndex(indexName, indexHost, embedConfig, projectContext);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'pineconeQuery',
            `Query: ${indexName}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        QueryPanel.currentPanel = new QueryPanel(panel, extensionUri, pineconeService, indexName, indexHost, embedConfig, projectContext);
    }

    /**
     * Private constructor - use createOrShow() instead.
     */
    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        private pineconeService: PineconeService,
        indexName: string,
        indexHost: string,
        embedConfig?: IndexEmbedConfig,
        projectContext?: ProjectContext
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._indexName = indexName;
        this._indexHost = indexHost;
        this._embedConfig = embedConfig;
        this._projectContext = projectContext;

        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message: { command: string; params?: QueryFormParams }) => {
                switch (message.command) {
                    case 'ready':
                        // Send index configuration to webview
                        this._panel.webview.postMessage({ 
                            command: 'init', 
                            hasIntegratedEmbeddings: !!this._embedConfig,
                            embedModel: this._embedConfig?.model
                        });
                        return;
                    case 'query':
                        if (message.params) {
                            await this.handleQuery(message.params);
                        }
                        return;
                    case 'requestLogin':
                        vscode.commands.executeCommand('pinecone.login');
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    /**
     * Updates the panel to use a different index.
     * 
     * @param name - New index name
     * @param host - New index host URL
     * @param embedConfig - Optional embedding config
     * @param projectContext - Optional project context for API authentication
     */
    public setIndex(name: string, host: string, embedConfig?: IndexEmbedConfig, projectContext?: ProjectContext): void {
        this._indexName = name;
        this._indexHost = host;
        this._embedConfig = embedConfig;
        this._projectContext = projectContext;
        this._panel.title = `Query: ${name}`;
        this._panel.webview.postMessage({ 
            command: 'setIndex', 
            name,
            hasIntegratedEmbeddings: !!embedConfig,
            embedModel: embedConfig?.model
        });
    }

    /**
     * Disposes of the panel and cleans up resources.
     */
    public dispose(): void {
        QueryPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    /**
     * Updates the webview content.
     */
    private _update(): void {
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    /**
     * Generates the HTML content for the webview.
     * 
     * @param webview - The webview to generate content for
     * @returns HTML string for the webview
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptPathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'media', 'query.js');
        const scriptUri = webview.asWebviewUri(scriptPathOnDisk);
        const stylesPathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'media', 'query.css');
        const stylesUri = webview.asWebviewUri(stylesPathOnDisk);

        // Generate a nonce for CSP
        const nonce = this._getNonce();

        const htmlPath = path.join(this._extensionUri.fsPath, 'src', 'webview', 'html', 'query.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');

        // Replace placeholders
        htmlContent = htmlContent.replace(/\${scriptUri}/g, scriptUri.toString());
        htmlContent = htmlContent.replace(/\${stylesUri}/g, stylesUri.toString());
        htmlContent = htmlContent.replace(/\${cspSource}/g, webview.cspSource);
        htmlContent = htmlContent.replace(/\${nonce}/g, nonce);
        htmlContent = htmlContent.replace(/\${indexName}/g, this._indexName);

        return htmlContent;
    }

    /**
     * Generates a random nonce for Content Security Policy.
     */
    private _getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    /**
     * Handles query requests from the webview.
     * 
     * Routes to either text-based search (for integrated embeddings)
     * or vector-based query (for standard indexes) based on the input.
     * 
     * @param params - Query parameters from the form
     */
    private async handleQuery(params: QueryFormParams): Promise<void> {
        try {
            // Parse filter JSON (used by both query types)
            let filter: Record<string, unknown> | undefined;
            if (params.filterStr && params.filterStr.trim()) {
                try {
                    filter = JSON.parse(params.filterStr);
                } catch (e: unknown) {
                    this._panel.webview.postMessage({ 
                        command: 'error', 
                        message: 'Invalid filter JSON. Please check the syntax.' 
                    });
                    return;
                }
            }

            const topK = parseInt(params.topK || '10', 10) || 10;

            // Check if this is a text-based search (integrated embeddings)
            // Note: includeValues is NOT passed to text search - the /records/search
            // endpoint doesn't support it (only the /query endpoint does)
            if (params.textQuery && params.textQuery.trim() && this._embedConfig) {
                await this.handleTextSearch(params.textQuery.trim(), topK, params.namespace, filter);
            } else {
                // Standard vector-based query
                await this.handleVectorQuery(params, topK, filter);
            }
            
        } catch (e: unknown) {
            const classified = classifyError(e);
            
            // Check if this is an authentication error
            if (classified.requiresLogin) {
                this._panel.webview.postMessage({ command: 'authExpired' });
            } else {
                this._panel.webview.postMessage({ command: 'error', message: classified.userMessage });
            }
        }
    }

    /**
     * Handles text-based search for indexes with integrated embeddings.
     * Uses the /records/namespaces/{namespace}/search endpoint which auto-embeds the text query.
     * 
     * IMPORTANT: The search endpoint has different parameters than /query:
     * - filter goes INSIDE the query object (not at top level)
     * - NO include_values or include_metadata parameters
     * - Document fields are returned directly in result.hits[].fields
     * 
     * @see https://docs.pinecone.io/reference/api/2025-10/data-plane/search_records
     */
    private async handleTextSearch(
        text: string, 
        topK: number, 
        namespace?: string, 
        filter?: Record<string, unknown>
    ): Promise<void> {
        // Build search params following the SearchRecordsRequest schema:
        // - query.inputs.text for text search
        // - query.top_k for result count
        // - query.filter for metadata filtering (inside query, not at top level!)
        // - Note: include_values is NOT supported by this endpoint
        const searchParams: SearchParams = {
            query: {
                inputs: { text },
                top_k: topK,
                filter  // Filter is inside query object per API spec
            },
            namespace: namespace || ''  // Default namespace is empty string
        };

        const result = await this.pineconeService.getDataPlane().search(this._indexHost, searchParams, this._projectContext);
        
        // Convert search response to a format compatible with the UI
        // The search endpoint returns data in a different structure than /query:
        // - /query returns: { matches: [{ id, score, values?, metadata? }], namespace }
        // - /search returns: { result: { hits: [{ _id, _score, fields }] }, usage }
        // We normalize to the /query format for consistent UI rendering
        const formattedResult = {
            matches: result.result.hits.map(hit => ({
                id: hit._id,
                score: hit._score,
                // Map document fields to metadata for display consistency
                metadata: hit.fields
            })),
            namespace: namespace || ''
        };
        
        this._panel.webview.postMessage({ command: 'result', data: formattedResult });
    }

    /**
     * Handles standard vector-based query for indexes without integrated embeddings.
     */
    private async handleVectorQuery(
        params: QueryFormParams, 
        topK: number, 
        filter?: Record<string, unknown>
    ): Promise<void> {
        // Parse and validate vector input
        let vector: number[] | undefined;
        if (params.vectorStr && params.vectorStr.trim()) {
            try {
                vector = JSON.parse(params.vectorStr);
                if (!Array.isArray(vector) || !vector.every(n => typeof n === 'number')) {
                    throw new Error('Vector must be an array of numbers');
                }
            } catch (e) {
                this._panel.webview.postMessage({ 
                    command: 'error', 
                    message: 'Invalid vector format. Must be a JSON array of numbers (e.g., [0.1, 0.2, 0.3]).' 
                });
                return;
            }
        }

        // Build query parameters
        const queryParams: QueryParams = {
            top_k: topK,
            vector,
            id: params.id || undefined,
            namespace: params.namespace || undefined,
            include_values: params.includeValues,
            include_metadata: params.includeMetadata,
            filter
        };

        // Execute query
        const result = await this.pineconeService.getDataPlane().query(this._indexHost, queryParams, this._projectContext);
        this._panel.webview.postMessage({ command: 'result', data: result });
    }
}
