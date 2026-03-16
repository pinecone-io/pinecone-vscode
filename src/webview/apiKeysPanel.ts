/**
 * API Keys Panel
 *
 * Webview panel for project API key management.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PineconeService } from '../services/pineconeService';
import { AuthService } from '../services/authService';
import { AUTH_CONTEXTS } from '../utils/constants';
import { getErrorMessage } from '../utils/errorHandling';
import { PineconeTreeItem } from '../providers/treeItems';
import { FREE_TIER_API_KEY_ROLE, isFreeTierPlan } from '../utils/organizationPlan';

interface ApiKeyPanelMessage {
    command: 'ready' | 'createKey' | 'revokeKey';
    payload?: Record<string, unknown>;
}

export class ApiKeysPanel {
    private static readonly panelsByKey = new Map<string, ApiKeysPanel>();

    private readonly panel: vscode.WebviewPanel;
    private readonly disposables: vscode.Disposable[] = [];
    private readonly panelKey: string;
    private isDisposed = false;

    public static createOrShow(
        extensionUri: vscode.Uri,
        pineconeService: PineconeService,
        authService: AuthService,
        item?: PineconeTreeItem
    ): void {
        const column = vscode.window.activeTextEditor?.viewColumn;
        const panelKey = ApiKeysPanel.getPanelKey(pineconeService, item);
        const existing = ApiKeysPanel.panelsByKey.get(panelKey);
        if (existing) {
            existing.panel.reveal(column || vscode.ViewColumn.One);
            void existing.listKeysWithErrorHandling();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'pineconeApiKeys',
            'API Keys',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );
        new ApiKeysPanel(panel, extensionUri, pineconeService, authService, item, panelKey);
    }

    private projectId: string | undefined;
    private projectName: string | undefined;
    private projectOrganizationId: string | undefined;
    private organizationPlan: string | undefined;
    private listRequestCounter = 0;

    private constructor(
        panel: vscode.WebviewPanel,
        private readonly extensionUri: vscode.Uri,
        private readonly pineconeService: PineconeService,
        private readonly authService: AuthService,
        item?: PineconeTreeItem,
        panelKey?: string
    ) {
        this.panel = panel;
        this.panelKey = panelKey || ApiKeysPanel.getPanelKey(pineconeService, item);
        ApiKeysPanel.panelsByKey.set(this.panelKey, this);
        this.setProject(item, false);
        this.panel.webview.html = this.getHtml(this.panel.webview);

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage((message: ApiKeyPanelMessage) => {
            void this.handleMessage(message);
        }, null, this.disposables);
    }

    private setProject(item?: PineconeTreeItem, refreshKeys: boolean = true): void {
        if (item?.resourceId && item.itemType === 'project') {
            this.projectId = item.resourceId;
            this.projectName = item.label;
            const project = item.metadata?.project as { organization_id?: string } | undefined;
            const organization = item.metadata?.organization as { id?: string; plan?: string } | undefined;
            this.projectOrganizationId = organization?.id || project?.organization_id || item.parentId;
            this.organizationPlan = organization?.plan;
        } else {
            const targetProject = this.pineconeService.getTargetProject();
            const targetOrganization = this.pineconeService.getTargetOrganization();
            this.projectId = targetProject?.id;
            this.projectName = targetProject?.name;
            this.projectOrganizationId = targetOrganization?.id;
            this.organizationPlan = undefined;
        }
        const name = this.projectName || 'Unknown Project';
        this.panel.title = `API Keys: ${name}`;
        void this.panel.webview.postMessage({ command: 'setProject', projectName: name });
        void this.postRolePolicy();
        if (refreshKeys) {
            void this.listKeysWithErrorHandling();
        }
    }

    private async listKeysWithErrorHandling(): Promise<void> {
        const requestId = ++this.listRequestCounter;
        try {
            await this.resolveOrganizationPlan();
            await this.listKeys(requestId);
        } catch (error: unknown) {
            if (requestId !== this.listRequestCounter) {
                return;
            }
            await this.panel.webview.postMessage({
                command: 'error',
                message: getErrorMessage(error)
            });
        }
    }

    private async ensureOrganizationScope(): Promise<void> {
        if (!this.projectOrganizationId) {
            return;
        }
        if (this.authService.getAuthContext() !== AUTH_CONTEXTS.USER_TOKEN) {
            return;
        }
        const switched = await this.authService.switchOrganization(this.projectOrganizationId);
        if (!switched) {
            throw new Error(`Could not switch authentication scope to organization "${this.projectOrganizationId}".`);
        }
    }

    private async resolveOrganizationPlan(): Promise<void> {
        if (this.organizationPlan || !this.projectOrganizationId) {
            await this.postRolePolicy();
            return;
        }

        const organizationsResult = await this.pineconeService.listOrganizations();
        if (organizationsResult.success) {
            const organizations = organizationsResult.data || [];
            const organization = organizations.find((org) => org.id === this.projectOrganizationId);
            this.organizationPlan = organization?.plan;
        }

        await this.postRolePolicy();
    }

    private async postRolePolicy(): Promise<void> {
        await this.panel.webview.postMessage({
            command: 'rolePolicy',
            enforceProjectEditorOnly: isFreeTierPlan(this.organizationPlan),
            role: FREE_TIER_API_KEY_ROLE
        });
    }

    private dispose(): void {
        if (this.isDisposed) {
            return;
        }
        this.isDisposed = true;
        ApiKeysPanel.panelsByKey.delete(this.panelKey);
        this.panel.dispose();
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
    }

    private static getPanelKey(pineconeService: PineconeService, item?: PineconeTreeItem): string {
        if (item?.resourceId && item.itemType === 'project') {
            return String(item.resourceId).trim().toLowerCase();
        }
        return String(pineconeService.getTargetProject()?.id || 'global').trim().toLowerCase();
    }

    private getHtml(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'apiKeys.js'));
        const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'apiKeys.css'));
        const nonce = this.getNonce();
        const htmlPath = path.join(this.extensionUri.fsPath, 'src', 'webview', 'html', 'apiKeys.html');
        let html = fs.readFileSync(htmlPath, 'utf8');
        html = html.replace(/\${scriptUri}/g, scriptUri.toString());
        html = html.replace(/\${stylesUri}/g, stylesUri.toString());
        html = html.replace(/\${cspSource}/g, webview.cspSource);
        html = html.replace(/\${nonce}/g, nonce);
        html = html.replace(/\${projectName}/g, this.projectName || 'Unknown Project');
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

    private async getAdminToken(): Promise<string> {
        const authContext = this.authService.getAuthContext();
        if (authContext === AUTH_CONTEXTS.API_KEY) {
            throw new Error('API key management requires OAuth or service account authentication.');
        }
        if (authContext === AUTH_CONTEXTS.SERVICE_ACCOUNT) {
            const secrets = this.authService.getConfigService().getSecrets();
            if (!secrets.client_id || !secrets.client_secret) {
                throw new Error('Service account credentials not found.');
            }
            return this.pineconeService.getAdminApi().getAccessToken(secrets.client_id, secrets.client_secret);
        }
        return this.authService.getAccessToken();
    }

    private async listKeys(requestId: number = ++this.listRequestCounter): Promise<void> {
        if (!this.projectId) {
            throw new Error('No target project selected.');
        }
        await this.ensureOrganizationScope();
        const token = await this.getAdminToken();
        const keys = await this.pineconeService.getAdminApi().listAPIKeys(
            token,
            this.projectId,
            this.projectOrganizationId
        );
        if (requestId !== this.listRequestCounter) {
            return;
        }
        await this.panel.webview.postMessage({ command: 'keys', keys });
    }

    private async handleMessage(message: ApiKeyPanelMessage): Promise<void> {
        try {
            switch (message.command) {
                case 'ready':
                    await this.listKeysWithErrorHandling();
                    return;
                case 'createKey': {
                    if (!this.projectId) {
                        throw new Error('No target project selected.');
                    }
                    const name = String(message.payload?.name || '').trim();
                    const rawRoles = message.payload?.roles;
                    const rolesFromPayload = Array.isArray(rawRoles)
                        ? rawRoles
                            .map(role => String(role).trim())
                            .filter(Boolean)
                        : String(rawRoles || '')
                            .split(',')
                            .map(v => v.trim())
                            .filter(Boolean);
                    const roles = isFreeTierPlan(this.organizationPlan)
                        ? [FREE_TIER_API_KEY_ROLE]
                        : rolesFromPayload;
                    if (!name) {
                        throw new Error('Key name is required.');
                    }

                    await this.ensureOrganizationScope();
                    const token = await this.getAdminToken();
                    const result = await this.pineconeService.getAdminApi().createAPIKey(token, this.projectId, {
                        name,
                        roles: roles.length > 0 ? roles : undefined
                    }, this.projectOrganizationId);

                    const action = await vscode.window.showInformationMessage(
                        `API key "${result.key.name}" created.\nSecret (shown once): ${result.value}`,
                        { modal: true },
                        'Copy Secret'
                    );
                    if (action === 'Copy Secret') {
                        await vscode.env.clipboard.writeText(result.value);
                        vscode.window.showInformationMessage('API key secret copied to clipboard.');
                    }
                    await this.listKeys();
                    return;
                }
                case 'revokeKey': {
                    const keyId = String(message.payload?.keyId || '').trim();
                    const keyName = String(message.payload?.keyName || '').trim();
                    if (!keyId) {
                        throw new Error('Key ID is required.');
                    }
                    const confirmation = await vscode.window.showWarningMessage(
                        `Revoke API key "${keyName || keyId}"?`,
                        { modal: true },
                        'Revoke'
                    );
                    if (confirmation !== 'Revoke') {
                        return;
                    }
                    await this.ensureOrganizationScope();
                    const token = await this.getAdminToken();
                    await this.pineconeService.getAdminApi().deleteAPIKey(token, keyId);
                    await this.listKeys();
                    return;
                }
                default:
                    return;
            }
        } catch (error: unknown) {
            await this.panel.webview.postMessage({
                command: 'error',
                message: getErrorMessage(error)
            });
        }
    }
}
