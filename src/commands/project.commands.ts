/**
 * Project Commands
 * 
 * Command handlers for Pinecone project operations including creation
 * and deletion. Projects organize indexes and assistants within an organization.
 * 
 * Note: Project management requires JWT-based authentication (OAuth or service account).
 * API key users do not have access to project management features.
 * 
 * @module commands/project
 */

import * as vscode from 'vscode';
import { PineconeService } from '../services/pineconeService';
import { PineconeTreeItem } from '../providers/treeItems';
import { AuthService } from '../services/authService';
import { AUTH_CONTEXTS } from '../utils/constants';
import { getErrorMessage } from '../utils/errorHandling';
import { refreshExplorer } from '../utils/refreshExplorer';
// Project interface available if needed for future expansion

/**
 * Validates a project name.
 * 
 * Valid project names:
 * - Are non-empty
 * - Contain only alphanumeric characters, hyphens, and underscores
 * - Are 64 characters or less
 * 
 * @param value - The project name to validate
 * @returns Error message if invalid, null if valid
 */
export function validateProjectName(value: string): string | null {
    if (!value) {
        return 'Project name is required';
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
        return 'Name can only contain alphanumeric characters, hyphens, and underscores';
    }
    if (value.length > 64) {
        return 'Name must be 64 characters or less';
    }
    return null;
}

/**
 * Handles all project-related commands in the extension.
 * 
 * Requires service account authentication for all operations.
 */
export class ProjectCommands {
    /**
     * Creates a new ProjectCommands instance.
     * @param pineconeService - Service for Pinecone API operations
     * @param authService - Service for authentication state
     */
    constructor(
        private pineconeService: PineconeService,
        private authService: AuthService
    ) {}

    /**
     * Gets an access token for Admin API operations.
     * 
     * For service accounts, exchanges credentials for a token.
     * For OAuth users, uses the existing access token.
     * API key users cannot manage projects.
     * 
     * @returns Access token or null if authentication not suitable
     */
    private async getAdminToken(): Promise<string | null> {
        const authContext = this.authService.getAuthContext();
        
        if (authContext === AUTH_CONTEXTS.API_KEY) {
            vscode.window.showWarningMessage(
                'Project management is not available with API key authentication. Please use OAuth or service account.'
            );
            return null;
        }

        try {
            if (authContext === AUTH_CONTEXTS.SERVICE_ACCOUNT) {
                // Service account: exchange credentials for token
                const configService = this.authService.getConfigService();
                const secrets = configService.getSecrets();
                
                if (!secrets.client_id || !secrets.client_secret) {
                    vscode.window.showErrorMessage('Service account credentials not found.');
                    return null;
                }

                return await this.pineconeService.getAdminApi().getAccessToken(
                    secrets.client_id,
                    secrets.client_secret
                );
            } else {
                // OAuth: use existing access token
                return await this.authService.getAccessToken();
            }
        } catch (e: unknown) {
            const message = getErrorMessage(e);
            vscode.window.showErrorMessage(`Failed to authenticate: ${message}`);
            return null;
        }
    }

    /**
     * Creates a new project using an interactive wizard.
     * 
     * When invoked from a tree item context (right-click on Organization),
     * the organization ID is extracted from the tree item. Projects are
     * created within the selected organization.
     * 
     * Prompts the user for:
     * - Project name
     * - Optional CMEK encryption setting (with warning about irreversibility)
     * 
     * @param item - Optional tree item providing organization context
     */
    async createProject(item?: PineconeTreeItem): Promise<void> {
        const token = await this.getAdminToken();
        if (!token) { return; }

        // Get organization ID from tree item if available
        const organizationId = item?.resourceId;

        // Step 1: Get project name
        const name = await vscode.window.showInputBox({
            prompt: 'Enter project name',
            placeHolder: 'my-project',
            validateInput: validateProjectName
        });
        if (!name) { return; }

        // Step 2: Ask about CMEK encryption
        const cmekChoice = await vscode.window.showQuickPick(
            [
                { 
                    label: 'No', 
                    description: 'Standard encryption (default)', 
                    value: false 
                },
                { 
                    label: 'Yes', 
                    description: 'Force CMEK encryption (WARNING: Irreversible)', 
                    value: true 
                }
            ],
            { placeHolder: 'Enable CMEK encryption for all indexes in this project?' }
        );
        if (cmekChoice === undefined) { return; }

        // Additional warning for CMEK
        if (cmekChoice.value) {
            const confirm = await vscode.window.showWarningMessage(
                'CMEK encryption cannot be disabled once enabled. All indexes in this project will require CMEK keys. Continue?',
                { modal: true },
                'Yes, Enable CMEK'
            );
            if (confirm !== 'Yes, Enable CMEK') { return; }
        }

        // Create the project in the specified organization
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Creating project "${name}"...`,
                cancellable: false
            }, async () => {
                await this.pineconeService.getAdminApi().createProject(
                    token, 
                    {
                        name,
                        force_encryption_with_cmek: cmekChoice.value
                    },
                    organizationId  // Pass organization context
                );
            });

            vscode.window.showInformationMessage(`Project "${name}" created successfully`);
            void refreshExplorer({ delayMs: 0, focusExplorer: false });
        } catch (e: unknown) {
            const message = getErrorMessage(e);
            vscode.window.showErrorMessage(`Failed to create project: ${message}`);
        }
    }

    /**
     * Deletes a project after confirmation.
     * 
     * Shows warnings about data loss and requires typing the project name
     * to confirm deletion if the project has resources.
     * 
     * @param item - Tree item representing the project to delete
     */
    async deleteProject(item: PineconeTreeItem): Promise<void> {
        const token = await this.getAdminToken();
        if (!token) { return; }

        // Note: project metadata is available for potential future use
        const projectId = item.resourceId;
        const projectName = item.label as string;

        if (!projectId) {
            vscode.window.showErrorMessage('Could not determine project to delete');
            return;
        }

        // First warning
        const firstConfirm = await vscode.window.showWarningMessage(
            `Are you sure you want to delete project "${projectName}"? All indexes, assistants, and backups in this project will be permanently deleted.`,
            { modal: true },
            'Continue'
        );
        if (firstConfirm !== 'Continue') { return; }

        // Require typing project name for confirmation
        const confirmName = await vscode.window.showInputBox({
            prompt: `Type "${projectName}" to confirm deletion`,
            placeHolder: projectName,
            validateInput: (value) => {
                if (value !== projectName) {
                    return `Please type "${projectName}" exactly to confirm`;
                }
                return null;
            }
        });
        if (confirmName !== projectName) { return; }

        // Delete the project
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Deleting project "${projectName}"...`,
                cancellable: false
            }, async () => {
                await this.pineconeService.getAdminApi().deleteProject(token, projectId);
            });

            vscode.window.showInformationMessage(`Project "${projectName}" deleted successfully`);
            void refreshExplorer({ delayMs: 0, focusExplorer: false });
        } catch (e: unknown) {
            const message = getErrorMessage(e);
            vscode.window.showErrorMessage(`Failed to delete project: ${message}`);
        }
    }

    /**
     * Renames a project.
     *
     * Only project name updates are exposed in the extension.
     */
    async renameProject(item: PineconeTreeItem): Promise<void> {
        const token = await this.getAdminToken();
        if (!token) { return; }

        const projectId = item.resourceId;
        const projectName = item.label as string;
        if (!projectId) {
            vscode.window.showErrorMessage('Could not determine project to rename');
            return;
        }

        const newName = await vscode.window.showInputBox({
            prompt: `Enter new name for project "${projectName}"`,
            placeHolder: projectName,
            value: projectName,
            validateInput: validateProjectName
        });
        if (!newName || newName === projectName) {
            return;
        }

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Renaming project "${projectName}"...`,
                cancellable: false
            }, async () => {
                await this.pineconeService.getAdminApi().updateProject(token, projectId, { name: newName });
            });

            vscode.window.showInformationMessage(`Project renamed to "${newName}"`);
            void refreshExplorer({ delayMs: 0, focusExplorer: false });
        } catch (e: unknown) {
            const message = getErrorMessage(e);
            vscode.window.showErrorMessage(`Failed to rename project: ${message}`);
        }
    }
}
