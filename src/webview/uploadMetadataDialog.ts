import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { parseOptionalJsonObject } from '../utils/inputValidation';

interface UploadMetadataMessage {
    command: 'submit' | 'cancel';
    payload?: {
        batchMetadata?: string;
        batchMultimodal?: boolean;
        multimodal?: boolean;
        files?: Array<{
            filePath: string;
            metadata?: string;
            multimodal?: boolean;
        }>;
    };
}

export interface UploadMetadataPayload {
    batchMetadata?: string;
    batchMultimodal?: boolean;
    multimodal?: boolean;
    files?: Array<{
        filePath: string;
        metadata?: string;
        multimodal?: boolean;
    }>;
}

export interface UploadFileMetadata {
    filePath: string;
    metadata?: Record<string, unknown>;
    multimodal: boolean;
}

export function resolveUploadMetadataPayload(payload: UploadMetadataPayload): {
    value?: UploadFileMetadata[];
    error?: string;
} {
    const filesPayload = Array.isArray(payload.files) ? payload.files : [];
    const batchInput = String(payload.batchMetadata || '');
    const hasBatchMultimodal = payload.batchMultimodal === true || payload.multimodal === true;
    const batchMetadata = parseOptionalJsonObject(
        batchInput,
        'Batch metadata must be a valid JSON object.'
    );
    if (batchMetadata.error) {
        return { error: batchMetadata.error };
    }

    const hasBatchMetadata = !!batchInput.trim();
    const result: UploadFileMetadata[] = [];
    for (const file of filesPayload) {
        const filePath = String(file.filePath || '');
        if (!filePath) {
            continue;
        }

        if (hasBatchMetadata) {
            result.push({
                filePath,
                metadata: batchMetadata.value,
                multimodal: hasBatchMultimodal
            });
            continue;
        }

        const perFileMetadata = parseOptionalJsonObject(
            String(file.metadata || ''),
            `Metadata for "${path.basename(filePath)}" must be valid JSON object.`
        );
        if (perFileMetadata.error) {
            return { error: perFileMetadata.error };
        }

        result.push({
            filePath,
            metadata: perFileMetadata.value,
            multimodal: hasBatchMultimodal || file.multimodal === true
        });
    }

    return { value: result };
}

export class UploadMetadataDialog {
    static async show(
        extensionUri: vscode.Uri,
        files: vscode.Uri[]
    ): Promise<UploadFileMetadata[] | undefined> {
        const panel = vscode.window.createWebviewPanel(
            'pineconeUploadMetadata',
            'Assistant File Metadata',
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: false,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        const dialog = new UploadMetadataDialog(panel, extensionUri, files);
        return dialog.waitForResult();
    }

    private readonly disposables: vscode.Disposable[] = [];
    private resolver?: (value: UploadFileMetadata[] | undefined) => void;
    private resolved = false;

    private constructor(
        private readonly panel: vscode.WebviewPanel,
        private readonly extensionUri: vscode.Uri,
        private readonly files: vscode.Uri[]
    ) {
        this.panel.webview.html = this.getHtml();
        this.panel.onDidDispose(() => this.resolve(undefined), null, this.disposables);
        this.panel.webview.onDidReceiveMessage((message: UploadMetadataMessage) => {
            void this.handleMessage(message);
        }, null, this.disposables);
    }

    private waitForResult(): Promise<UploadFileMetadata[] | undefined> {
        return new Promise<UploadFileMetadata[] | undefined>((resolve) => {
            this.resolver = resolve;
        });
    }

    private resolve(value: UploadFileMetadata[] | undefined): void {
        if (this.resolved) {
            return;
        }
        this.resolved = true;
        this.resolver?.(value);
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
        this.panel.dispose();
    }

    private async handleMessage(message: UploadMetadataMessage): Promise<void> {
        switch (message.command) {
            case 'cancel':
                this.resolve(undefined);
                return;
            case 'submit': {
                const parsed = resolveUploadMetadataPayload(message.payload || {});
                if (parsed.error) {
                    await this.panel.webview.postMessage({ command: 'error', message: parsed.error });
                    return;
                }
                this.resolve(parsed.value || []);
                return;
            }
            default:
                return;
        }
    }

    private getHtml(): string {
        const webview = this.panel.webview;
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'uploadMetadata.js'));
        const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'uploadMetadata.css'));
        const nonce = this.getNonce();
        const htmlPath = path.join(this.extensionUri.fsPath, 'src', 'webview', 'html', 'uploadMetadata.html');
        const filesPayload = JSON.stringify(this.files.map(file => ({
            filePath: file.fsPath,
            fileName: path.basename(file.fsPath)
        })));

        let html = fs.readFileSync(htmlPath, 'utf8');
        html = html.replace(/\${scriptUri}/g, scriptUri.toString());
        html = html.replace(/\${stylesUri}/g, stylesUri.toString());
        html = html.replace(/\${cspSource}/g, webview.cspSource);
        html = html.replace(/\${nonce}/g, nonce);
        html = html.replace(/\${filesPayload}/g, filesPayload.replace(/</g, '\\u003c'));
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
}
