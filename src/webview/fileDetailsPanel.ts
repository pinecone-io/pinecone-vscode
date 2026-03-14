import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import fetch from 'node-fetch';
import { PineconeService } from '../services/pineconeService';
import { ProjectContext } from '../api/client';
import { classifyError, getErrorMessage } from '../utils/errorHandling';

interface FileDetailsMessage {
    command: 'ready' | 'refresh';
}

interface FileDetailsViewModel {
    name: string;
    metadata: Record<string, unknown>;
    signedUrl: string;
    createdOn: string;
    updatedOn: string;
    status: string;
    errorMessage: string;
    multimodal: boolean;
    indexedSizeBytes: number;
    signedUrlSizeBytes?: number;
    contentType?: string;
    previewMode: 'text' | 'pdf' | 'none';
    previewUrl?: string;
    previewText?: string;
    previewError?: string;
}

export class FileDetailsPanel {
    private static readonly panelsByKey = new Map<string, FileDetailsPanel>();

    private readonly panel: vscode.WebviewPanel;
    private readonly disposables: vscode.Disposable[] = [];
    private readonly maxPreviewBytes = 128 * 1024;
    private readonly maxPdfPreviewBytes = 12 * 1024 * 1024;
    private readonly panelKey: string;
    private isDisposed = false;

    public static createOrShow(
        extensionUri: vscode.Uri,
        pineconeService: PineconeService,
        fileId: string,
        fileLabel: string,
        assistantName: string,
        assistantHost: string,
        projectContext?: ProjectContext
    ): void {
        const column = vscode.window.activeTextEditor?.viewColumn;
        const panelKey = FileDetailsPanel.getPanelKey(fileId, assistantName, assistantHost, projectContext);
        const existing = FileDetailsPanel.panelsByKey.get(panelKey);
        if (existing) {
            existing.panel.reveal(column || vscode.ViewColumn.One);
            existing.setFile(fileId, fileLabel, assistantName, assistantHost, projectContext);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'pineconeFileDetails',
            `File Details: ${fileLabel}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        new FileDetailsPanel(
            panel,
            extensionUri,
            pineconeService,
            fileId,
            fileLabel,
            assistantName,
            assistantHost,
            projectContext,
            panelKey
        );
    }

    private constructor(
        panel: vscode.WebviewPanel,
        private readonly extensionUri: vscode.Uri,
        private readonly pineconeService: PineconeService,
        private fileId: string,
        private fileLabel: string,
        private assistantName: string,
        private assistantHost: string,
        private projectContext?: ProjectContext,
        panelKey?: string
    ) {
        this.panel = panel;
        this.panelKey = panelKey || FileDetailsPanel.getPanelKey(fileId, assistantName, assistantHost, projectContext);
        FileDetailsPanel.panelsByKey.set(this.panelKey, this);
        this.panel.webview.html = this.getHtml(this.panel.webview);

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage((message: FileDetailsMessage) => {
            void this.handleMessage(message);
        }, null, this.disposables);
    }

    private setFile(
        fileId: string,
        fileLabel: string,
        assistantName: string,
        assistantHost: string,
        projectContext?: ProjectContext
    ): void {
        this.fileId = fileId;
        this.fileLabel = fileLabel;
        this.assistantName = assistantName;
        this.assistantHost = assistantHost;
        this.projectContext = projectContext;
        this.panel.title = `File Details: ${fileLabel}`;
        void this.loadDetails();
    }

    private dispose(): void {
        if (this.isDisposed) {
            return;
        }
        this.isDisposed = true;
        FileDetailsPanel.panelsByKey.delete(this.panelKey);
        this.panel.dispose();
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
    }

    private static getPanelKey(
        fileId: string,
        assistantName: string,
        assistantHost: string,
        projectContext?: ProjectContext
    ): string {
        const project = String(projectContext?.id || '').trim().toLowerCase();
        const host = String(assistantHost || '').trim().toLowerCase();
        const assistant = String(assistantName || '').trim().toLowerCase();
        const file = String(fileId || '').trim().toLowerCase();
        return `${project || 'global'}::${host}::${assistant}::${file}`;
    }

    private getHtml(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'fileDetails.js'));
        const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'fileDetails.css'));
        const nonce = this.getNonce();
        const htmlPath = path.join(this.extensionUri.fsPath, 'src', 'webview', 'html', 'fileDetails.html');

        let html = fs.readFileSync(htmlPath, 'utf8');
        html = html.replace(/\${scriptUri}/g, scriptUri.toString());
        html = html.replace(/\${stylesUri}/g, stylesUri.toString());
        html = html.replace(/\${cspSource}/g, webview.cspSource);
        html = html.replace(/\${nonce}/g, nonce);
        html = html.replace(/\${fileLabel}/g, this.fileLabel);
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

    private async handleMessage(message: FileDetailsMessage): Promise<void> {
        switch (message.command) {
            case 'ready':
            case 'refresh':
                await this.loadDetails();
                return;
            default:
                return;
        }
    }

    private async loadDetails(): Promise<void> {
        try {
            const file = await this.pineconeService.getAssistantApi().describeFile(
                this.assistantHost,
                this.assistantName,
                this.fileId,
                this.projectContext,
                true
            );

            const preview = await this.loadSignedUrlPreview(file.signed_url, file.name);
            const details: FileDetailsViewModel = {
                name: file.name,
                metadata: (file.metadata || {}) as Record<string, unknown>,
                signedUrl: file.signed_url || '',
                createdOn: file.created_on,
                updatedOn: file.updated_on,
                status: file.status,
                errorMessage: file.error_message || '',
                multimodal: file.multimodal,
                indexedSizeBytes: file.size,
                signedUrlSizeBytes: preview.sizeBytes,
                contentType: preview.contentType,
                previewMode: preview.previewMode,
                previewUrl: preview.previewUrl,
                previewText: preview.previewText,
                previewError: preview.previewError
            };

            await this.panel.webview.postMessage({
                command: 'details',
                fileLabel: this.fileLabel,
                details
            });
        } catch (error: unknown) {
            const classified = classifyError(error);
            if (classified.requiresLogin) {
                await this.panel.webview.postMessage({ command: 'authExpired' });
            } else {
                await this.panel.webview.postMessage({
                    command: 'error',
                    message: getErrorMessage(error)
                });
            }
        }
    }

    private async loadSignedUrlPreview(url?: string, fileName?: string): Promise<{
        sizeBytes?: number;
        contentType?: string;
        previewMode: 'text' | 'pdf' | 'none';
        previewUrl?: string;
        previewText?: string;
        previewError?: string;
    }> {
        if (!url) {
            return {
                previewMode: 'none',
                previewError: 'Signed URL was not returned for this file.'
            };
        }

        let sizeBytes: number | undefined;
        let contentType: string | undefined;

        try {
            const headResponse = await fetch(url, { method: 'HEAD' });
            if (headResponse.ok) {
                const contentLength = headResponse.headers.get('content-length');
                sizeBytes = contentLength ? Number(contentLength) || undefined : undefined;
                contentType = headResponse.headers.get('content-type') || undefined;
            }
        } catch {
            // Best effort only; continue with GET for preview.
        }

        const isPdfByName = String(fileName || '').toLowerCase().endsWith('.pdf');
        const isPdfByType = String(contentType || '').toLowerCase().includes('pdf');
        if (isPdfByName || isPdfByType) {
            const inlinePdf = await this.buildInlinePdfPreview(url, sizeBytes);
            return {
                sizeBytes,
                contentType,
                previewMode: 'pdf',
                previewUrl: inlinePdf.previewUrl,
                previewError: inlinePdf.previewError
            };
        }

        try {
            const response = await fetch(url, {
                headers: {
                    Range: `bytes=0-${this.maxPreviewBytes - 1}`
                }
            });

            if (!response.ok) {
                return {
                    sizeBytes,
                    contentType,
                    previewMode: 'none',
                    previewError: `Signed URL preview request failed (${response.status}).`
                };
            }

            if (!contentType) {
                contentType = response.headers.get('content-type') || undefined;
            }
            if (!sizeBytes) {
                const contentLength = response.headers.get('content-length');
                sizeBytes = contentLength ? Number(contentLength) || undefined : undefined;
            }

            const buffer = Buffer.from(await response.arrayBuffer());
            if (!sizeBytes) {
                sizeBytes = buffer.byteLength;
            }

            const isPdf = String(contentType || '').toLowerCase().includes('pdf');
            if (isPdf) {
                const inlinePdf = await this.buildInlinePdfPreview(url, sizeBytes);
                return {
                    sizeBytes,
                    contentType,
                    previewMode: 'pdf',
                    previewUrl: inlinePdf.previewUrl,
                    previewError: inlinePdf.previewError
                };
            }

            const previewText = this.extractPreviewText(buffer, contentType);
            if (!previewText) {
                return {
                    sizeBytes,
                    contentType,
                    previewMode: 'none',
                    previewError: 'Preview is not available for this file format.'
                };
            }

            return {
                sizeBytes,
                contentType,
                previewMode: 'text',
                previewText
            };
        } catch (error: unknown) {
            return {
                sizeBytes,
                contentType,
                previewMode: 'none',
                previewError: getErrorMessage(error)
            };
        }
    }

    private async buildInlinePdfPreview(url: string, knownSizeBytes?: number): Promise<{
        previewUrl?: string;
        previewError?: string;
    }> {
        if (knownSizeBytes && knownSizeBytes > this.maxPdfPreviewBytes) {
            return {
                previewError: `PDF preview is limited to ${Math.round(this.maxPdfPreviewBytes / (1024 * 1024))}MB.`
            };
        }

        try {
            const response = await fetch(url);
            if (!response.ok) {
                return {
                    previewError: `Signed URL preview request failed (${response.status}).`
                };
            }

            const bytes = Buffer.from(await response.arrayBuffer());
            if (bytes.byteLength > this.maxPdfPreviewBytes) {
                return {
                    previewError: `PDF preview is limited to ${Math.round(this.maxPdfPreviewBytes / (1024 * 1024))}MB.`
                };
            }

            const base64 = bytes.toString('base64');
            return {
                previewUrl: `data:application/pdf;base64,${base64}`
            };
        } catch (error: unknown) {
            return {
                previewError: getErrorMessage(error)
            };
        }
    }

    private extractPreviewText(buffer: Buffer, contentType?: string): string | undefined {
        const normalizedType = (contentType || '').toLowerCase();
        const directTextType = normalizedType.startsWith('text/')
            || normalizedType.includes('json')
            || normalizedType.includes('xml')
            || normalizedType.includes('csv')
            || normalizedType.includes('markdown');

        if (directTextType) {
            return this.truncatePreview(buffer.toString('utf8'));
        }

        if (normalizedType.includes('pdf')) {
            return this.truncatePreview(this.extractPdfLikeText(buffer));
        }

        // Fallback for unknown content types: show preview only if mostly printable.
        const utf8 = buffer.toString('utf8');
        const printableChars = utf8.replace(/[\x20-\x7E\s]/g, '').length;
        const ratio = utf8.length > 0 ? printableChars / utf8.length : 1;
        if (ratio < 0.2) {
            return this.truncatePreview(utf8);
        }

        return undefined;
    }

    private extractPdfLikeText(buffer: Buffer): string {
        const content = buffer.toString('latin1');
        const chunks = content.match(/[A-Za-z0-9][A-Za-z0-9 ,.'":;!?()\-_/]{24,}/g) || [];
        return chunks.slice(0, 24).join('\n');
    }

    private truncatePreview(text: string): string {
        const normalized = text.split('\u0000').join('').trim();
        if (!normalized) {
            return '';
        }
        const maxLength = 8000;
        if (normalized.length <= maxLength) {
            return normalized;
        }
        return `${normalized.slice(0, maxLength)}\n\n[Preview truncated]`;
    }
}
