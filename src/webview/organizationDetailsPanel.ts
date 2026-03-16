import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PineconeService } from '../services/pineconeService';
import { Organization } from '../api/types';

interface OrganizationDetailsMessage {
    command: 'ready' | 'refresh';
}

interface OrganizationDetailsViewModel {
    id: string;
    name: string;
    createdAt?: string;
    paymentStatus?: string;
    plan?: string;
    supportTier?: string;
}

export class OrganizationDetailsPanel {
    private static readonly panelsByKey = new Map<string, OrganizationDetailsPanel>();

    private readonly panel: vscode.WebviewPanel;
    private readonly disposables: vscode.Disposable[] = [];
    private readonly panelKey: string;
    private isDisposed = false;

    public static createOrShow(
        extensionUri: vscode.Uri,
        pineconeService: PineconeService,
        organizationId: string,
        organizationName: string,
        organization?: Organization
    ): void {
        const column = vscode.window.activeTextEditor?.viewColumn;
        const panelKey = OrganizationDetailsPanel.getPanelKey(organizationId, organizationName);
        const existing = OrganizationDetailsPanel.panelsByKey.get(panelKey);
        if (existing) {
            existing.panel.reveal(column || vscode.ViewColumn.One);
            existing.setOrganization(organizationId, organizationName, organization);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'pineconeOrganizationDetails',
            `Organization Details: ${organizationName}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        new OrganizationDetailsPanel(
            panel,
            extensionUri,
            pineconeService,
            organizationId,
            organizationName,
            organization,
            panelKey
        );
    }

    private constructor(
        panel: vscode.WebviewPanel,
        private readonly extensionUri: vscode.Uri,
        private readonly pineconeService: PineconeService,
        private organizationId: string,
        private organizationName: string,
        private organization?: Organization,
        panelKey?: string
    ) {
        this.panel = panel;
        this.panelKey = panelKey || OrganizationDetailsPanel.getPanelKey(organizationId, organizationName);
        OrganizationDetailsPanel.panelsByKey.set(this.panelKey, this);
        this.panel.webview.html = this.getHtml(this.panel.webview);

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage((message: OrganizationDetailsMessage) => {
            void this.handleMessage(message);
        }, null, this.disposables);
    }

    private static getPanelKey(organizationId: string, organizationName: string): string {
        const id = String(organizationId || '').trim().toLowerCase();
        const name = String(organizationName || '').trim().toLowerCase();
        return id || name || 'organization';
    }

    private setOrganization(
        organizationId: string,
        organizationName: string,
        organization?: Organization
    ): void {
        this.organizationId = organizationId;
        this.organizationName = organizationName;
        this.organization = organization;
        this.panel.title = `Organization Details: ${organizationName}`;
        void this.loadDetails();
    }

    private dispose(): void {
        if (this.isDisposed) {
            return;
        }
        this.isDisposed = true;
        OrganizationDetailsPanel.panelsByKey.delete(this.panelKey);
        this.panel.dispose();
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
    }

    private getHtml(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'organizationDetails.js'));
        const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'organizationDetails.css'));
        const nonce = this.getNonce();
        const htmlPath = path.join(this.extensionUri.fsPath, 'src', 'webview', 'html', 'organizationDetails.html');

        let html = fs.readFileSync(htmlPath, 'utf8');
        html = html.replace(/\${scriptUri}/g, scriptUri.toString());
        html = html.replace(/\${stylesUri}/g, stylesUri.toString());
        html = html.replace(/\${cspSource}/g, webview.cspSource);
        html = html.replace(/\${nonce}/g, nonce);
        html = html.replace(/\${organizationName}/g, this.organizationName);
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

    private async handleMessage(message: OrganizationDetailsMessage): Promise<void> {
        switch (message.command) {
            case 'ready':
            case 'refresh':
                await this.loadDetails();
                return;
            default:
                return;
        }
    }

    private toViewModel(org: Organization): OrganizationDetailsViewModel {
        return {
            id: org.id,
            name: org.name,
            createdAt: org.created_at,
            paymentStatus: org.payment_status,
            plan: org.plan,
            supportTier: org.support_tier
        };
    }

    private async loadDetails(): Promise<void> {
        try {
            const result = await this.pineconeService.listOrganizations();
            if (!result.success) {
                throw new Error(result.error || 'Failed to load organizations');
            }

            const organizations = result.data || [];
            const found = organizations.find((org) => org.id === this.organizationId);
            const details = found || this.organization;
            if (!details) {
                throw new Error('Organization details were not found for this account.');
            }

            await this.panel.webview.postMessage({
                command: 'details',
                organizationName: details.name,
                details: this.toViewModel(details)
            });
        } catch (error: unknown) {
            await this.panel.webview.postMessage({
                command: 'error',
                message: error instanceof Error ? error.message : String(error)
            });
        }
    }
}
