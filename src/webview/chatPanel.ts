/**
 * Chat Panel
 * 
 * WebView panel for interactive chat with Pinecone Assistants.
 * Manages conversation history and displays responses with citations.
 * 
 * @module webview/chatPanel
 */

import * as vscode from 'vscode';
import { PineconeService } from '../services/pineconeService';
import { ChatMessage, StreamController } from '../api/assistantApi';
import { StreamChunk, Citation } from '../api/types';
import { ProjectContext } from '../api/client';
import { ASSISTANT_MODELS, AssistantModelConfig } from '../utils/constants';
import { classifyError } from '../utils/errorHandling';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Re-export the supported models from constants for external use.
 * The single source of truth for model configuration is in constants.ts.
 */
export const SUPPORTED_MODELS = ASSISTANT_MODELS;

/** Type for a supported model */
export type SupportedModel = AssistantModelConfig;

/**
 * Options sent from the webview for chat messages.
 */
interface ChatOptions {
    model?: string;
    temperature?: number;
    include_highlights?: boolean;
    filter?: Record<string, unknown>;
    /** Whether to use streaming mode */
    stream?: boolean;
}

/**
 * Manages the chat webview panel for assistant interactions.
 * 
 * Provides an interactive chat interface for communicating with
 * Pinecone Assistants, including message history and citation display.
 */
export class ChatPanel {
    private static readonly _panelsByKey = new Map<string, ChatPanel>();

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _assistantName: string;
    private _host: string;
    private _projectContext?: ProjectContext;
    private _messages: ChatMessage[] = [];
    /** Controller for aborting streaming requests */
    private _streamController: StreamController | null = null;
    /** Buffer for accumulated streaming content */
    private _streamingContent: string = '';
    /** Buffer for accumulated streaming citations */
    private _streamingCitations: Citation[] = [];
    /** Prevents duplicate stream finalization when both message_end and socket end fire */
    private _streamFinalized: boolean = false;
    private readonly _panelKey: string;
    private _isDisposed = false;

    /**
     * Creates or reveals the chat panel.
     * 
     * If a panel already exists, it will be revealed and optionally
     * updated with new assistant information.
     * 
     * @param extensionUri - Extension URI for loading webview resources
     * @param pineconeService - Service for API calls
     * @param assistantName - Name of the assistant to chat with
     * @param host - Assistant host URL
     * @param projectContext - Optional project context for API authentication
     */
    public static createOrShow(
        extensionUri: vscode.Uri, 
        pineconeService: PineconeService, 
        assistantName: string, 
        host: string,
        projectContext?: ProjectContext
    ): void {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        const panelKey = ChatPanel.getPanelKey(assistantName, host, projectContext);
        const existing = ChatPanel._panelsByKey.get(panelKey);
        if (existing) {
            existing._panel.reveal(column || vscode.ViewColumn.One);
            existing.setAssistant(assistantName, host, projectContext);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'pineconeChat',
            `Chat: ${assistantName}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        new ChatPanel(panel, extensionUri, pineconeService, assistantName, host, projectContext, panelKey);
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        private pineconeService: PineconeService,
        assistantName: string,
        host: string,
        projectContext?: ProjectContext,
        panelKey?: string
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._assistantName = assistantName;
        this._host = host;
        this._projectContext = projectContext;
        this._panelKey = panelKey || ChatPanel.getPanelKey(assistantName, host, projectContext);
        ChatPanel._panelsByKey.set(this._panelKey, this);

        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'ready':
                        // Webview is ready, send initial configuration
                        this.sendModels();
                        return;
                    case 'sendMessage':
                        if (message.options?.stream) {
                            await this.handleStreamingMessage(message.text, message.options);
                        } else {
                            await this.handleMessage(message.text, message.options);
                        }
                        return;
                    case 'clearChat':
                        this._messages = [];
                        return;
                    case 'abortStream':
                        this.abortStream();
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

    public setAssistant(name: string, host: string, projectContext?: ProjectContext) {
        this._assistantName = name;
        this._host = host;
        this._projectContext = projectContext;
        this._messages = []; // Clear history on switch
        this._panel.title = `Chat: ${name}`;
        this._panel.webview.postMessage({ command: 'setAssistant', name });
        this._panel.webview.postMessage({ command: 'clear' });
    }

    public dispose() {
        if (this._isDisposed) {
            return;
        }
        this._isDisposed = true;
        ChatPanel._panelsByKey.delete(this._panelKey);
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
     * 
     * The webview will request models via the 'ready' message when loaded.
     */
    private _update(): void {
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    /**
     * Sends the supported models to the webview.
     */
    private sendModels(): void {
        this._panel.webview.postMessage({ 
            command: 'setModels', 
            models: SUPPORTED_MODELS 
        });
    }

    /**
     * Generates the HTML content for the webview.
     * 
     * @param webview - The webview to generate content for
     * @returns HTML string for the webview
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptPathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'media', 'chat.js');
        const scriptUri = webview.asWebviewUri(scriptPathOnDisk);
        const stylesPathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'media', 'chat.css');
        const stylesUri = webview.asWebviewUri(stylesPathOnDisk);
        
        // Generate a nonce for CSP
        const nonce = this._getNonce();

        const htmlPath = path.join(this._extensionUri.fsPath, 'src', 'webview', 'html', 'chat.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');

        htmlContent = htmlContent.replace(/\${scriptUri}/g, scriptUri.toString());
        htmlContent = htmlContent.replace(/\${stylesUri}/g, stylesUri.toString());
        htmlContent = htmlContent.replace(/\${cspSource}/g, webview.cspSource);
        htmlContent = htmlContent.replace(/\${nonce}/g, nonce);
        htmlContent = htmlContent.replace(/\${assistantName}/g, this._assistantName);

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

    private static getPanelKey(assistantName: string, host: string, projectContext?: ProjectContext): string {
        const name = String(assistantName || '').trim().toLowerCase();
        const normalizedHost = String(host || '').trim().toLowerCase();
        const project = String(projectContext?.id || '').trim().toLowerCase();
        return `${project || 'global'}::${normalizedHost}::${name}`;
    }

    /**
     * Handles incoming chat messages from the user.
     * 
     * @param text - The user's message text
     * @param options - Chat options (model, temperature, etc.)
     */
    private async handleMessage(text: string, options: ChatOptions): Promise<void> {
        // Add user message to history
        this._messages.push({ role: 'user', content: text });

        try {
            const response = await this.pineconeService.getAssistantApi().chat(
                this._host,
                this._assistantName,
                this._messages,
                options,
                this._projectContext
            );

            // Add assistant response to history
            this._messages.push({ role: 'assistant', content: response.message.content });

            // Send back to webview
            this._panel.webview.postMessage({ command: 'receiveMessage', response });

        } catch (e: unknown) {
            const classified = classifyError(e);
            
            // Check if this is an authentication error
            if (classified.requiresLogin) {
                // Remove the failed user message from history
                this._messages.pop();
                this._panel.webview.postMessage({ command: 'authExpired' });
            } else {
                this._panel.webview.postMessage({ command: 'error', message: classified.userMessage });
            }
        }
    }

    /**
     * Handles incoming chat messages in streaming mode.
     * 
     * @param text - The user's message text
     * @param options - Chat options including streaming flag
     */
    private async handleStreamingMessage(text: string, options: ChatOptions): Promise<void> {
        // Add user message to history
        this._messages.push({ role: 'user', content: text });
        
        // Reset streaming buffers
        this._streamingContent = '';
        this._streamingCitations = [];
        this._streamFinalized = false;

        // Notify webview that streaming has started
        this._panel.webview.postMessage({ command: 'streamStart' });

        try {
            // Start streaming chat
            this._streamController = this.pineconeService.getAssistantApi().chatStream(
                this._host,
                this._assistantName,
                this._messages,
                {
                    projectContext: this._projectContext,
                    model: options.model,
                    temperature: options.temperature,
                    include_highlights: options.include_highlights,
                    filter: options.filter,
                    onChunk: (chunk: StreamChunk) => {
                        this.handleStreamChunk(chunk);
                    },
                    onError: (error: Error) => {
                        this.handleStreamError(error);
                    },
                    onComplete: () => {
                        this.handleStreamComplete();
                    }
                }
            );

        } catch (e: unknown) {
            const classified = classifyError(e);
            this._messages.pop(); // Remove failed user message
            if (classified.requiresLogin) {
                this._panel.webview.postMessage({ command: 'authExpired' });
            } else {
                this._panel.webview.postMessage({ command: 'error', message: classified.userMessage });
            }
        }
    }

    /**
     * Handles a single chunk from the streaming response.
     */
    private handleStreamChunk(chunk: StreamChunk): void {
        switch (chunk.type) {
            case 'content_chunk':
                // Append content and forward to webview
                this._streamingContent += chunk.delta.content;
                this._panel.webview.postMessage({ 
                    command: 'streamChunk', 
                    content: chunk.delta.content 
                });
                break;

            case 'citation':
                // Queue citation for display after content
                this._streamingCitations.push(chunk.citation);
                this._panel.webview.postMessage({ 
                    command: 'streamCitation', 
                    citation: chunk.citation 
                });
                break;

            case 'message_end':
                // Send usage info
                this._panel.webview.postMessage({ 
                    command: 'streamUsage', 
                    usage: chunk.usage 
                });
                // Some SSE implementations keep the socket open after message_end.
                // Finalize on message_end so the UI is not stuck waiting for socket close.
                this.handleStreamComplete();
                break;
        }
    }

    /**
     * Handles streaming errors.
     */
    private handleStreamError(error: Error): void {
        if (this._streamFinalized) {
            return;
        }

        this._streamFinalized = true;
        const classified = classifyError(error);
        
        // Clean up state
        this._streamController = null;
        
        // Check if this is an authentication error
        if (classified.requiresLogin) {
            this._messages.pop(); // Remove failed user message
            this._panel.webview.postMessage({ command: 'authExpired' });
        } else {
            this._panel.webview.postMessage({ command: 'streamError', message: classified.userMessage });
        }
    }

    /**
     * Handles streaming completion.
     */
    private handleStreamComplete(): void {
        if (this._streamFinalized) {
            return;
        }
        this._streamFinalized = true;

        // Add accumulated content to message history
        if (this._streamingContent) {
            this._messages.push({ role: 'assistant', content: this._streamingContent });
        }
        
        // Notify webview streaming is done
        this._panel.webview.postMessage({ 
            command: 'streamEnd',
            citations: this._streamingCitations
        });
        
        // Clean up
        this._streamController = null;
        this._streamingContent = '';
        this._streamingCitations = [];
    }

    /**
     * Aborts the current streaming request.
     */
    private abortStream(): void {
        if (this._streamController) {
            this._streamFinalized = true;
            this._streamController.abort();
            this._streamController = null;
            
            // Add partial content to history if any
            if (this._streamingContent) {
                this._messages.push({ 
                    role: 'assistant', 
                    content: this._streamingContent + '\n\n[Response stopped by user]' 
                });
            } else {
                // Remove user message if no response was received
                this._messages.pop();
            }
            
            // Notify webview
            this._panel.webview.postMessage({ command: 'streamAborted' });
            
            // Clean up buffers
            this._streamingContent = '';
            this._streamingCitations = [];
        }
    }
}
