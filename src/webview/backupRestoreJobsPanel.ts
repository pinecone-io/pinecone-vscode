import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PineconeService } from '../services/pineconeService';
import { ProjectContext } from '../api/client';
import { RestoreJob } from '../api/types';
import { PineconeTreeDataProvider } from '../providers/pineconeTreeDataProvider';
import {
    collectPaginatedData,
    getActiveBackups,
    getActiveRestoreJobs,
    sortByCreatedAtDesc
} from '../utils/jobStatus';
import { getErrorMessage } from '../utils/errorHandling';
import { refreshExplorer } from '../utils/refreshExplorer';

interface BackupRestoreJobsMessage {
    command: 'ready' | 'refresh' | 'cancelBackup' | 'createBackup' | 'restoreBackup' | 'deleteBackup';
    payload?: {
        backupId?: string;
        backupName?: string;
        sourceIndexName?: string;
        status?: string;
        name?: string;
    };
}

export class BackupRestoreJobsPanel {
    private static readonly panelsByKey = new Map<string, BackupRestoreJobsPanel>();

    private readonly panel: vscode.WebviewPanel;
    private readonly panelKey: string;
    private readonly disposables: vscode.Disposable[] = [];
    private isDisposed = false;

    static createOrShow(
        extensionUri: vscode.Uri,
        pineconeService: PineconeService,
        indexName: string,
        projectContext?: ProjectContext,
        treeDataProvider?: PineconeTreeDataProvider
    ): void {
        const column = vscode.window.activeTextEditor?.viewColumn;
        const panelKey = BackupRestoreJobsPanel.getPanelKey(indexName, projectContext);
        const existing = BackupRestoreJobsPanel.panelsByKey.get(panelKey);
        if (existing) {
            existing.panel.reveal(column || vscode.ViewColumn.One);
            existing.setContext(indexName, projectContext);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'pineconeBackupRestoreJobs',
            `Backup/Restore Jobs: ${indexName}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        new BackupRestoreJobsPanel(
            panel,
            extensionUri,
            pineconeService,
            indexName,
            projectContext,
            treeDataProvider,
            panelKey
        );
    }

    private constructor(
        panel: vscode.WebviewPanel,
        private readonly extensionUri: vscode.Uri,
        private readonly pineconeService: PineconeService,
        private indexName: string,
        private projectContext?: ProjectContext,
        private readonly treeDataProvider?: PineconeTreeDataProvider,
        panelKey?: string
    ) {
        this.panel = panel;
        this.panelKey = panelKey || BackupRestoreJobsPanel.getPanelKey(indexName, projectContext);
        BackupRestoreJobsPanel.panelsByKey.set(this.panelKey, this);
        this.panel.webview.html = this.getHtml(this.panel.webview);

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage((message: BackupRestoreJobsMessage) => {
            void this.handleMessage(message);
        }, null, this.disposables);
    }

    static getPanelKey(indexName: string, projectContext?: ProjectContext): string {
        const project = String(projectContext?.id || 'global').trim().toLowerCase();
        const index = String(indexName || '').trim().toLowerCase();
        return `${project}::${index}`;
    }

    private setContext(indexName: string, projectContext?: ProjectContext): void {
        this.indexName = indexName;
        this.projectContext = projectContext;
        this.panel.title = `Backup/Restore Jobs: ${indexName}`;
        void this.panel.webview.postMessage({
            command: 'setIndex',
            indexName
        });
        void this.refreshJobs();
    }

    private dispose(): void {
        if (this.isDisposed) {
            return;
        }

        this.isDisposed = true;
        BackupRestoreJobsPanel.panelsByKey.delete(this.panelKey);
        this.panel.dispose();
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
    }

    private getHtml(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'backupRestoreJobs.js'));
        const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'backupRestoreJobs.css'));
        const nonce = this.getNonce();
        const htmlPath = path.join(this.extensionUri.fsPath, 'src', 'webview', 'html', 'backupRestoreJobs.html');

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

    private async handleMessage(message: BackupRestoreJobsMessage): Promise<void> {
        try {
            switch (message.command) {
                case 'ready':
                    await this.panel.webview.postMessage({
                        command: 'setIndex',
                        indexName: this.indexName
                    });
                    await this.refreshJobs();
                    return;
                case 'refresh':
                    await this.refreshJobs();
                    return;
                case 'cancelBackup':
                    await this.cancelBackup(message.payload?.backupId, message.payload?.backupName);
                    return;
                case 'createBackup':
                    await this.createBackup(message.payload?.name);
                    return;
                case 'restoreBackup':
                    await this.restoreBackup(
                        message.payload?.backupId,
                        message.payload?.backupName,
                        message.payload?.sourceIndexName,
                        message.payload?.status
                    );
                    return;
                case 'deleteBackup':
                    await this.deleteBackup(message.payload?.backupId, message.payload?.backupName);
                    return;
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

    private async refreshJobs(): Promise<void> {
        const controlPlane = this.pineconeService.getControlPlane();
        const backups = await controlPlane.listBackups(this.indexName, this.projectContext);
        const activeBackups = getActiveBackups(backups);
        const allBackups = sortByCreatedAtDesc(backups);

        const backupIds = new Set(backups.map((backup) => backup.backup_id));
        const allRestoreJobs = await collectPaginatedData<RestoreJob>(
            (paginationToken) => controlPlane.listRestoreJobs(
                {
                    limit: 50,
                    pagination_token: paginationToken
                },
                this.projectContext
            )
        );

        const activeRestoreJobs = getActiveRestoreJobs(allRestoreJobs, backupIds);

        await this.panel.webview.postMessage({
            command: 'jobsData',
            backups: activeBackups,
            allBackups,
            restoreJobs: activeRestoreJobs,
            refreshedAt: new Date().toISOString()
        });
    }

    private async createBackup(backupName?: string): Promise<void> {
        const trimmedName = String(backupName || '').trim();
        if (!trimmedName) {
            throw new Error('Backup name is required.');
        }
        if (!/^[a-z0-9-]+$/.test(trimmedName)) {
            throw new Error('Backup name must consist of lowercase alphanumeric characters or hyphens.');
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Creating backup "${trimmedName}"...`,
            cancellable: false
        }, async () => {
            await this.pineconeService.getControlPlane().createBackup(
                this.indexName,
                trimmedName,
                this.projectContext
            );
        });

        await this.panel.webview.postMessage({
            command: 'success',
            message: `Backup "${trimmedName}" creation started.`
        });
        await this.refreshJobs();
        await this.refreshTree();
    }

    private async cancelBackup(backupId?: string, backupName?: string): Promise<void> {
        const selectedBackupId = String(backupId || '').trim();
        if (!selectedBackupId) {
            throw new Error('Select an active backup job to cancel.');
        }

        const displayName = backupName || selectedBackupId;
        const confirmed = await vscode.window.showWarningMessage(
            `Cancel backup "${displayName}" by deleting it? This is best-effort and may fail based on backup state.`,
            { modal: true },
            'Cancel Backup'
        );
        if (confirmed !== 'Cancel Backup') {
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Canceling backup "${displayName}"...`,
            cancellable: false
        }, async () => {
            await this.pineconeService.getControlPlane().deleteBackup(selectedBackupId, this.projectContext);
        });

        await this.panel.webview.postMessage({
            command: 'success',
            message: `Cancel requested for backup "${displayName}".`
        });

        await this.refreshJobs();
        await this.refreshTree();
    }

    private async restoreBackup(
        backupId?: string,
        backupName?: string,
        sourceIndexName?: string,
        status?: string
    ): Promise<void> {
        const selectedBackupId = String(backupId || '').trim();
        if (!selectedBackupId) {
            throw new Error('Select a backup to restore.');
        }

        const normalizedStatus = String(status || '').trim().toLowerCase();
        if (normalizedStatus && normalizedStatus !== 'ready') {
            throw new Error(`Backup "${backupName || selectedBackupId}" is not ready for restore.`);
        }

        const sourceIndex = String(sourceIndexName || this.indexName).trim() || this.indexName;
        const targetIndexName = await vscode.window.showInputBox({
            prompt: `Enter name for the index restored from "${backupName || selectedBackupId}"`,
            value: `${sourceIndex}-restored`,
            validateInput: (value) => {
                if (!value) { return 'Index name is required.'; }
                if (!/^[a-z0-9-]+$/.test(value)) {
                    return 'Name must consist of lowercase alphanumeric characters or hyphens.';
                }
                if (value.length > 45) {
                    return 'Name must be 45 characters or less.';
                }
                return null;
            }
        });
        if (!targetIndexName) {
            return;
        }

        const response = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Starting restore to "${targetIndexName}"...`,
            cancellable: false
        }, async () => {
            return this.pineconeService.getControlPlane().createIndexFromBackup(
                {
                    backup_id: selectedBackupId,
                    name: targetIndexName,
                    deletion_protection: 'disabled'
                },
                this.projectContext
            );
        });

        await this.panel.webview.postMessage({
            command: 'success',
            message: `Restore job started for "${targetIndexName}" (job: ${response.restore_job_id}).`
        });
        await this.refreshJobs();
        await this.refreshTree();
        this.scheduleRefreshBurst();
    }

    private async deleteBackup(backupId?: string, backupName?: string): Promise<void> {
        const selectedBackupId = String(backupId || '').trim();
        if (!selectedBackupId) {
            throw new Error('Select a backup to delete.');
        }

        const displayName = backupName || selectedBackupId;
        const confirmed = await vscode.window.showWarningMessage(
            `Delete backup "${displayName}"? This action cannot be undone.`,
            { modal: true },
            'Delete Backup'
        );
        if (confirmed !== 'Delete Backup') {
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Deleting backup "${displayName}"...`,
            cancellable: false
        }, async () => {
            await this.pineconeService.getControlPlane().deleteBackup(selectedBackupId, this.projectContext);
        });

        await this.panel.webview.postMessage({
            command: 'success',
            message: `Backup "${displayName}" deleted.`
        });
        await this.refreshJobs();
        await this.refreshTree();
    }

    private async refreshTree(): Promise<void> {
        if (!this.treeDataProvider) {
            return;
        }
        await refreshExplorer({
            treeDataProvider: this.treeDataProvider,
            delayMs: 0,
            focusExplorer: false
        });
    }

    private scheduleRefreshBurst(): void {
        if (!this.treeDataProvider) {
            return;
        }
        const delays = [5000, 15000, 30000];
        for (const delay of delays) {
            setTimeout(() => {
                void this.refreshTree();
            }, delay);
        }
    }
}
