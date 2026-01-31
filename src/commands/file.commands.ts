/**
 * File Commands
 * 
 * Command handlers for managing files within Pinecone Assistants,
 * including upload and delete operations.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { PineconeService } from '../services/pineconeService';
import { PineconeTreeItem } from '../providers/treeItems';
import { PineconeTreeDataProvider } from '../providers/pineconeTreeDataProvider';
import { AssistantModel, Organization, Project } from '../api/types';
import { ProjectContext } from '../api/client';
import { POLLING_CONFIG } from '../utils/constants';
import { getErrorMessage } from '../utils/errorHandling';

/**
 * Handles all file-related commands for Pinecone Assistants.
 * 
 * Manages file uploads (with multi-select support) and deletions.
 */
export class FileCommands {
    /**
     * Creates a new FileCommands instance.
     * @param pineconeService - Service for Pinecone API operations
     * @param treeDataProvider - Tree data provider for refreshing the view
     */
    constructor(
        private pineconeService: PineconeService,
        private treeDataProvider: PineconeTreeDataProvider
    ) {}

    /**
     * Uploads one or more files to an assistant.
     * 
     * Opens a file picker with multi-select support and uploads
     * all selected files with progress reporting.
     * 
     * @param item - Tree item representing the Files category
     */
    async uploadFiles(item: PineconeTreeItem): Promise<void> {
        if (!item.resourceId || !item.metadata?.assistant) {
            vscode.window.showErrorMessage('Unable to upload: assistant information not available');
            return;
        }
        
        const assistant = item.metadata.assistant as AssistantModel;
        const project = item.metadata?.project as Project | undefined;
        const organization = item.metadata?.organization as Organization | undefined;
        const assistantName = item.resourceId;
        const host = assistant.host;

        // Build project context for API call (required for JWT auth)
        // Extract project ID from composite parentId (format: "projectId:assistantName")
        let projectId: string | undefined;
        if (item.parentId) {
            const colonIndex = item.parentId.indexOf(':');
            projectId = colonIndex > 0 ? item.parentId.substring(0, colonIndex) : undefined;
        }
        
        const projectContext: ProjectContext | undefined = (projectId && project && organization)
            ? { id: projectId, name: project.name, organizationId: organization.id }
            : undefined;

        // Open file picker
        const uris = await vscode.window.showOpenDialog({
            canSelectMany: true,
            canSelectFolders: false,
            openLabel: 'Upload',
            title: `Upload files to "${assistantName}"`,
            filters: {
                'Supported Files': ['pdf', 'txt', 'docx', 'doc', 'md', 'json', 'csv'],
                'All Files': ['*']
            }
        });

        if (!uris || uris.length === 0) { return; }

        // Upload files with progress
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Uploading ${uris.length} file(s) to "${assistantName}"...`,
            cancellable: true
        }, async (progress, token) => {
            let completed = 0;
            const errors: string[] = [];

            for (const uri of uris) {
                if (token.isCancellationRequested) {
                    vscode.window.showWarningMessage(
                        `Upload cancelled. ${completed} of ${uris.length} files uploaded.`
                    );
                    break;
                }
                
                const fileName = path.basename(uri.fsPath);
                progress.report({ message: `Uploading ${fileName}...` });
                
                try {
                    await this.pineconeService.getAssistantApi().uploadFile(
                        host, 
                        assistantName, 
                        uri.fsPath,
                        undefined, // metadata
                        projectContext
                    );
                    completed++;
                } catch (e: unknown) {
                    const message = getErrorMessage(e);
                    errors.push(`${fileName}: ${message}`);
                }
                
                progress.report({ increment: 100 / uris.length });
            }

            // Report results
            if (errors.length > 0) {
                const errorDetails = errors.slice(0, 3).join('\n');
                const moreErrors = errors.length > 3 ? `\n...and ${errors.length - 3} more` : '';
                vscode.window.showErrorMessage(
                    `Failed to upload ${errors.length} file(s):\n${errorDetails}${moreErrors}`
                );
            }
            
            if (completed > 0) {
                vscode.window.showInformationMessage(
                    `Successfully uploaded ${completed} file(s). Processing may take a few minutes.`
                );
            }
            
            vscode.commands.executeCommand('pinecone.refresh');
        });
    }

    /**
     * Deletes a file from an assistant.
     * 
     * @param item - Tree item representing the file to delete
     */
    async deleteFile(item: PineconeTreeItem): Promise<void> {
        if (!item.resourceId || !item.metadata?.assistant) {
            vscode.window.showErrorMessage('Unable to delete: file information not available');
            return;
        }
        
        const assistant = item.metadata.assistant as AssistantModel;
        const project = item.metadata?.project as Project | undefined;
        const organization = item.metadata?.organization as Organization | undefined;
        const fileId = item.resourceId;
        // Use assistant name from metadata, not parentId (which is now a composite ID)
        const assistantName = assistant.name;
        const host = assistant.host;
        const fileName = item.label;

        // Build project context for API call
        // Extract project ID from composite parentId (format: "projectId:assistantName")
        let projectId: string | undefined;
        if (item.parentId) {
            const colonIndex = item.parentId.indexOf(':');
            projectId = colonIndex > 0 ? item.parentId.substring(0, colonIndex) : undefined;
        }
        
        const projectContext: ProjectContext | undefined = (projectId && project && organization)
            ? { id: projectId, name: project.name, organizationId: organization.id }
            : undefined;

        const confirmation = await vscode.window.showWarningMessage(
            `Are you sure you want to delete "${fileName}" from "${assistantName}"?`,
            { modal: true },
            'Delete'
        );

        if (confirmation === 'Delete') {
            try {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `Deleting "${fileName}"...`,
                    cancellable: false
                }, async () => {
                    await this.pineconeService.getAssistantApi().deleteFile(
                        host, 
                        assistantName, 
                        fileId,
                        projectContext
                    );
                });
                vscode.window.showInformationMessage(`File "${fileName}" deleted successfully`);
                
                // Refresh after successful deletion using triple-refresh approach
                // This ensures the tree view updates reliably in Cursor IDE
                setTimeout(async () => {
                    // Approach 1: Direct call to treeDataProvider
                    this.treeDataProvider.refresh();
                    
                    // Approach 2: Execute refresh command
                    await vscode.commands.executeCommand('pinecone.refresh');
                    
                    // Approach 3: Focus on the explorer to force UI update
                    await vscode.commands.executeCommand('pineconeExplorer.focus');
                }, POLLING_CONFIG.REFRESH_DELAY_MS);
            } catch (e: unknown) {
                const message = getErrorMessage(e);
                vscode.window.showErrorMessage(`Failed to delete file: ${message}`);
            }
        }
    }
}
