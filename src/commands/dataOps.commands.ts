/**
 * Data Ops Commands
 *
 * Opens the Data Operations panel for index-level vector/import workflows.
 */

import * as vscode from 'vscode';
import { PineconeService } from '../services/pineconeService';
import { PineconeTreeItem } from '../providers/treeItems';
import { buildProjectContextFromItem } from '../utils/treeItemHelpers';
import { getErrorMessage } from '../utils/errorHandling';
import { waitForIndexReadyForOperations } from '../utils/indexReadiness';
import { Organization } from '../api/types';

export class DataOpsCommands {
    constructor(
        private readonly pineconeService: PineconeService,
        private readonly extensionUri: vscode.Uri
    ) {}

    async openDataOps(item: PineconeTreeItem): Promise<void> {
        if (!item?.metadata?.index?.host || !item?.resourceId) {
            vscode.window.showErrorMessage('Unable to open Data Ops: index information not available.');
            return;
        }
        const projectContext = buildProjectContextFromItem(item);

        try {
            await waitForIndexReadyForOperations(
                this.pineconeService,
                item.resourceId,
                'Data Ops',
                projectContext
            );
        } catch (error: unknown) {
            vscode.window.showErrorMessage(getErrorMessage(error));
            return;
        }

        const hasIntegratedEmbeddings = !!item.metadata.index.embed;
        const organization = item.metadata?.organization as Organization | undefined;

        const { DataOpsPanel } = await import('../webview/dataOpsPanel.js');
        DataOpsPanel.createOrShow(
            this.extensionUri,
            this.pineconeService,
            item.resourceId,
            item.metadata.index.host,
            hasIntegratedEmbeddings,
            projectContext,
            organization?.plan
        );
    }
}
