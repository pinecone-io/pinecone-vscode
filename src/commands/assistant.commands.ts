/**
 * Assistant Commands
 * 
 * Command handlers for Pinecone Assistant operations including creation,
 * deletion, and chat interactions.
 */

import * as vscode from 'vscode';
import { PineconeService } from '../services/pineconeService';
import { PineconeTreeItem } from '../providers/treeItems';
import { PineconeTreeDataProvider } from '../providers/pineconeTreeDataProvider';
import { ChatPanel } from '../webview/chatPanel';
import { AssistantModel } from '../api/types';
import { buildProjectContextFromItem } from '../utils/treeItemHelpers';
import { POLLING_CONFIG } from '../utils/constants';

/**
 * Handles all assistant-related commands in the extension.
 * 
 * Provides interactive wizards for assistant creation and
 * manages the chat panel lifecycle.
 */
export class AssistantCommands {
    /**
     * Creates a new AssistantCommands instance.
     * @param pineconeService - Service for Pinecone API operations
     * @param extensionUri - Extension URI for webview resource loading
     * @param treeDataProvider - Tree data provider for refreshing the tree view
     */
    constructor(
        private pineconeService: PineconeService, 
        private extensionUri: vscode.Uri,
        private treeDataProvider?: PineconeTreeDataProvider
    ) {}

    /**
     * Creates a new assistant using an interactive wizard.
     * 
     * When invoked from a tree item context (e.g., right-click on Assistant category),
     * the project context is extracted from the tree item's parentId. For JWT auth,
     * this ensures the assistant is created in the correct project.
     * 
     * Prompts the user for:
     * - Assistant name
     * - System instructions (optional)
     * - Deployment region
     * 
     * @param item - Optional tree item providing project context
     */
    async createAssistant(item?: PineconeTreeItem): Promise<void> {
        // Build project context from tree item if available (for JWT auth)
        const projectContext = item ? buildProjectContextFromItem(item) : undefined;
        
        // Also set shared context for backward compatibility
        if (item?.parentId) {
            this.pineconeService.setProjectId(item.parentId);
        }
        
        // Step 1: Get assistant name
        const name = await vscode.window.showInputBox({
            prompt: 'Enter assistant name',
            placeHolder: 'my-assistant',
            validateInput: (value) => {
                if (!value) {return 'Name is required';}
                if (!/^[a-z0-9-]+$/.test(value)) {
                    return 'Name must consist of lowercase alphanumeric characters or hyphens';
                }
                if (value.length > 45) {
                    return 'Name must be 45 characters or less';
                }
                return null;
            }
        });
        if (!name) { return; }

        // Step 2: Get instructions (optional)
        const instructions = await vscode.window.showInputBox({
            prompt: 'Enter system instructions (optional)',
            placeHolder: 'You are a helpful assistant that answers questions about our documentation.'
        });

        // Step 3: Select region (use configured default)
        const config = vscode.workspace.getConfiguration('pinecone');
        const defaultRegion = config.get<string>('defaultRegion', 'us');
        
        const regionOptions = [
            { label: 'us', description: 'United States' },
            { label: 'eu', description: 'European Union' }
        ];
        // Sort to put default first
        regionOptions.sort((a, b) => {
            if (a.label === defaultRegion) { return -1; }
            if (b.label === defaultRegion) { return 1; }
            return 0;
        });
        
        const region = await vscode.window.showQuickPick(
            regionOptions,
            { placeHolder: `Select deployment region (default: ${defaultRegion})` }
        );
        if (!region) { return; }

        // Create the assistant
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Creating assistant "${name}"...`,
                cancellable: false
            }, async () => {
                await this.pineconeService.createAssistant(
                    name, 
                    region.label, 
                    instructions || undefined,
                    undefined, // metadata
                    projectContext
                );
            });
            
            vscode.window.showInformationMessage(
                `Assistant "${name}" created successfully. Upload files to start using it.`
            );
            vscode.commands.executeCommand('pinecone.refresh');
        } catch (e: unknown) {
            this.handleError('create assistant', e);
        }
    }

    /**
     * Prompts the user to type a resource name to confirm deletion.
     * 
     * This provides an extra layer of protection for destructive operations,
     * similar to the Pinecone web console's delete confirmation pattern.
     * 
     * @param resourceType - Type of resource being deleted (e.g., 'assistant')
     * @param resourceName - Name of the resource to be deleted
     * @returns true if the user correctly typed the name, false otherwise
     */
    private async confirmDeletionByName(resourceType: string, resourceName: string): Promise<boolean> {
        const input = await vscode.window.showInputBox({
            prompt: `Type "${resourceName}" to confirm deletion`,
            placeHolder: resourceName,
            validateInput: (value) => {
                if (value !== resourceName) {
                    return `Please type "${resourceName}" exactly to confirm`;
                }
                return null;
            }
        });
        
        return input === resourceName;
    }

    /**
     * Deletes an assistant after confirmation.
     * 
     * Requires the user to type the assistant name to confirm deletion,
     * providing an extra layer of protection against accidental deletions.
     * This also deletes all files uploaded to the assistant.
     * 
     * @param item - Tree item representing the assistant to delete
     */
    async deleteAssistant(item: PineconeTreeItem): Promise<void> {
        if (!item.resourceId) { return; }
        const name = item.resourceId;

        // Build project context from tree item (required for JWT auth)
        const projectContext = buildProjectContextFromItem(item);

        // Step 1: Initial warning confirmation
        const confirmation = await vscode.window.showWarningMessage(
            `Are you sure you want to delete assistant "${name}"? This will also delete all uploaded files and cannot be undone.`,
            { modal: true },
            'Delete'
        );

        if (confirmation !== 'Delete') { return; }

        // Step 2: Require user to type the assistant name to confirm
        // This matches the Pinecone web console's delete confirmation pattern
        const confirmed = await this.confirmDeletionByName('assistant', name);
        if (!confirmed) {
            vscode.window.showInformationMessage('Assistant deletion cancelled.');
            return;
        }

        // Step 3: Proceed with deletion
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Deleting assistant "${name}"...`,
                cancellable: false
            }, async () => {
                await this.pineconeService.deleteAssistant(name, projectContext);
            });
            vscode.window.showInformationMessage(`Assistant "${name}" deleted successfully`);
            
            // Refresh after successful deletion using triple-refresh approach
            // This ensures the tree view updates in Cursor IDE
            setTimeout(async () => {
                // Approach 1: Direct call to treeDataProvider (if available)
                if (this.treeDataProvider) {
                    this.treeDataProvider.refresh();
                }
                
                // Approach 2: Execute refresh command
                await vscode.commands.executeCommand('pinecone.refresh');
                
                // Approach 3: Focus on the explorer to force UI update
                await vscode.commands.executeCommand('pineconeExplorer.focus');
            }, POLLING_CONFIG.REFRESH_DELAY_MS);
        } catch (e: unknown) {
            this.handleError('delete assistant', e);
        }
    }

    /**
     * Opens the chat panel for an assistant.
     * 
     * @param item - Tree item representing the assistant to chat with
     */
    async chatWithAssistant(item: PineconeTreeItem): Promise<void> {
        if (!item.resourceId || !item.metadata?.assistant) {
            vscode.window.showErrorMessage('Unable to open chat: assistant information not available');
            return;
        }
        
        const assistant = item.metadata.assistant as AssistantModel;
        
        if (assistant.status !== 'Ready') {
            vscode.window.showWarningMessage(
                `Assistant "${item.resourceId}" is ${assistant.status.toLowerCase()}. Please wait until it's ready.`
            );
            return;
        }

        // Build project context for API authentication
        const projectContext = buildProjectContextFromItem(item);

        ChatPanel.createOrShow(
            this.extensionUri, 
            this.pineconeService, 
            item.resourceId, 
            assistant.host,
            projectContext
        );
    }
    
    /**
     * Handles errors with actionable error messages.
     * 
     * @param operation - Description of the failed operation
     * @param error - The error that occurred
     */
    private handleError(operation: string, error: unknown): void {
        const message = error instanceof Error ? error.message : String(error);
        
        // Check for common error patterns and provide guidance
        if (message.includes('401') || message.includes('unauthorized')) {
            vscode.window.showErrorMessage(
                `Failed to ${operation}: Authentication expired. Please log in again.`,
                'Login'
            ).then(selection => {
                if (selection === 'Login') {
                    vscode.commands.executeCommand('pinecone.login');
                }
            });
        } else if (message.includes('409') || message.includes('already exists')) {
            vscode.window.showErrorMessage(
                `Failed to ${operation}: An assistant with this name already exists.`
            );
        } else if (message.includes('404') || message.includes('not found')) {
            vscode.window.showErrorMessage(
                `Failed to ${operation}: Assistant not found. It may have been deleted.`,
                'Refresh'
            ).then(selection => {
                if (selection === 'Refresh') {
                    vscode.commands.executeCommand('pinecone.refresh');
                }
            });
        } else {
            vscode.window.showErrorMessage(`Failed to ${operation}: ${message}`);
        }
    }
}
