/**
 * Pinecone VSCode Extension
 * 
 * Entry point for the Pinecone VSCode extension. Manages the lifecycle
 * of all services, providers, and commands.
 * 
 * @module extension
 */

import * as vscode from 'vscode';
import { AuthService } from './services/authService';
import { PineconeService } from './services/pineconeService';
import { PineconeTreeDataProvider } from './providers/pineconeTreeDataProvider';
import { AuthCommands } from './commands/auth';
import { IndexCommands } from './commands/index.commands';
import { AssistantCommands } from './commands/assistant.commands';
import { FileCommands } from './commands/file.commands';
import { NamespaceCommands } from './commands/namespace.commands';
import { ProjectCommands } from './commands/project.commands';
import { DataOpsCommands } from './commands/dataOps.commands';
import { AssistantToolsCommands } from './commands/assistantTools.commands';
import { ApiKeysCommands } from './commands/apiKeys.commands';
import { InferenceCommands } from './commands/inference.commands';
import { logger } from './utils/logger';
import { buildProjectContextFromItem } from './utils/treeItemHelpers';
import { waitForIndexReadyForOperations } from './utils/indexReadiness';
import { getErrorMessage } from './utils/errorHandling';

/** URL for Pinecone documentation */
const DOCS_URL = 'https://docs.pinecone.io';

/**
 * Activates the Pinecone extension.
 * 
 * Called by VSCode when the extension is first activated. Initializes
 * all services, providers, and registers commands.
 * 
 * @param context - VSCode extension context for registering disposables
 */
export function activate(context: vscode.ExtensionContext): void {
    logger.info('Extension is activating...');

    // IMPORTANT: Set auth context to false IMMEDIATELY before any async operations.
    // This ensures the welcome view shows until auth state is determined.
    // Without this, there's a race condition where the tree view may render
    // before the AuthService's async syncWithCliConfig() completes.
    vscode.commands.executeCommand('setContext', 'pinecone.isAuthenticated', false);
    vscode.commands.executeCommand('setContext', 'pinecone.authContext', '');

    // Initialize Services
    const authService = new AuthService(context.secrets);
    const pineconeService = new PineconeService(authService);

    // Register authService for disposal
    context.subscriptions.push({ dispose: () => authService.dispose() });

    // Initialize Providers
    // Use createTreeView for explicit control over the tree view lifecycle
    const treeDataProvider = new PineconeTreeDataProvider(pineconeService, authService);
    const treeView = vscode.window.createTreeView('pineconeExplorer', {
        treeDataProvider,
        showCollapseAll: true
    });
    context.subscriptions.push(treeView);

    // Initialize Command Handlers
    // Pass treeDataProvider to commands that need to refresh the tree after operations
    const authCommands = new AuthCommands(authService);
    const indexCommands = new IndexCommands(pineconeService, treeDataProvider, treeView, context.extensionUri);
    const assistantCommands = new AssistantCommands(pineconeService, context.extensionUri, treeDataProvider);
    const fileCommands = new FileCommands(pineconeService, treeDataProvider, context.extensionUri);
    const namespaceCommands = new NamespaceCommands(pineconeService);
    const projectCommands = new ProjectCommands(pineconeService, authService, context.extensionUri);
    const dataOpsCommands = new DataOpsCommands(pineconeService, context.extensionUri);
    const assistantToolsCommands = new AssistantToolsCommands(pineconeService, context.extensionUri);
    const apiKeysCommands = new ApiKeysCommands(pineconeService, authService, context.extensionUri);
    const inferenceCommands = new InferenceCommands(pineconeService, context.extensionUri);

    // Register Commands
    context.subscriptions.push(
        // Authentication Commands
        vscode.commands.registerCommand('pinecone.login', () => authCommands.login()),
        vscode.commands.registerCommand('pinecone.logout', () => authCommands.logout()),
        
        // Utility Commands
        vscode.commands.registerCommand('pinecone.refresh', () => treeDataProvider.refresh()),
        vscode.commands.registerCommand('pinecone.openDocs', () => {
            vscode.env.openExternal(vscode.Uri.parse(DOCS_URL));
        }),
        
        // Index Commands
        // Pass tree item to commands that receive context from tree view
        vscode.commands.registerCommand('pinecone.createIndex', (item) => indexCommands.createIndex(item)),
        vscode.commands.registerCommand('pinecone.deleteIndex', (item) => indexCommands.deleteIndex(item)),
        vscode.commands.registerCommand('pinecone.configureIndex', (item) => indexCommands.configureIndex(item)),
        vscode.commands.registerCommand('pinecone.addTags', (item) => indexCommands.addTags(item)),
        vscode.commands.registerCommand('pinecone.createBackup', (item) => indexCommands.createBackup(item)),
        vscode.commands.registerCommand('pinecone.viewBackups', (item) => indexCommands.viewBackups(item)),
        vscode.commands.registerCommand('pinecone.restoreBackup', (item) => indexCommands.restoreBackup(item)),
        vscode.commands.registerCommand('pinecone.deleteBackup', (item) => indexCommands.deleteBackup(item)),
        vscode.commands.registerCommand('pinecone.viewRestoreJobs', (item) => indexCommands.viewRestoreJobs(item)),
        vscode.commands.registerCommand('pinecone.indexStats', (item) => indexCommands.showIndexStats(item)),
        vscode.commands.registerCommand('pinecone.queryIndex', async (item) => {
            if (item?.resourceId && item?.metadata?.index?.host) {
                const { name, host, embed } = item.metadata.index;
                // Build project context for API authentication (required for JWT auth)
                const projectContext = buildProjectContextFromItem(item);
                try {
                    await waitForIndexReadyForOperations(
                        pineconeService,
                        name,
                        'Query',
                        projectContext
                    );
                } catch (error: unknown) {
                    vscode.window.showErrorMessage(getErrorMessage(error));
                    return;
                }
                // Dynamic import of QueryPanel to reduce initial load time
                import('./webview/queryPanel.js')
                    .then(({ QueryPanel }) => {
                        // Pass embed config to enable text search for integrated embedding indexes
                        // Pass project context for API authentication
                        QueryPanel.createOrShow(context.extensionUri, pineconeService, name, host, embed, projectContext);
                    })
                    .catch((error: unknown) => {
                        // Log and show error if QueryPanel fails to load (e.g., module not found)
                        logger.error('Failed to load QueryPanel:', error);
                        vscode.window.showErrorMessage(
                            `Failed to open query panel: ${error instanceof Error ? error.message : String(error)}`
                        );
                    });
            }
        }),
        vscode.commands.registerCommand('pinecone.openDataOps', (item) => dataOpsCommands.openDataOps(item)),

        // Assistant Commands
        // Pass tree item for project context
        vscode.commands.registerCommand('pinecone.createAssistant', (item) => assistantCommands.createAssistant(item)),
        vscode.commands.registerCommand('pinecone.deleteAssistant', (item) => assistantCommands.deleteAssistant(item)),
        vscode.commands.registerCommand('pinecone.chatWithAssistant', (item) => assistantCommands.chatWithAssistant(item)),
        vscode.commands.registerCommand('pinecone.updateAssistant', (item) => assistantToolsCommands.openUpdateAssistant(item)),
        vscode.commands.registerCommand('pinecone.retrieveAssistantContext', (item) => assistantToolsCommands.openRetrieveContext(item)),
        vscode.commands.registerCommand('pinecone.evaluateAssistantAnswer', (item) => assistantToolsCommands.openEvaluateAnswer(item)),

        // File Commands
        vscode.commands.registerCommand('pinecone.uploadFiles', (item) => fileCommands.uploadFiles(item)),
        vscode.commands.registerCommand('pinecone.deleteFile', (item) => fileCommands.deleteFile(item)),
        vscode.commands.registerCommand('pinecone.viewFileDetails', (item) => fileCommands.viewFileDetails(item)),

        // Namespace Commands
        vscode.commands.registerCommand('pinecone.createNamespace', (item) => namespaceCommands.createNamespace(item)),
        vscode.commands.registerCommand('pinecone.describeNamespace', (item) => namespaceCommands.describeNamespace(item)),
        vscode.commands.registerCommand('pinecone.deleteNamespace', (item) => namespaceCommands.deleteNamespace(item)),

        // Project Commands
        // Pass tree item for organization context
        vscode.commands.registerCommand('pinecone.createProject', (item) => projectCommands.createProject(item)),
        vscode.commands.registerCommand('pinecone.deleteProject', (item) => projectCommands.deleteProject(item)),
        vscode.commands.registerCommand('pinecone.renameProject', (item) => projectCommands.renameProject(item)),
        vscode.commands.registerCommand('pinecone.viewOrganizationDetails', (item) => projectCommands.viewOrganizationDetails(item)),

        // Admin + Inference commands
        vscode.commands.registerCommand('pinecone.manageApiKeys', (item) => apiKeysCommands.openApiKeys(item)),
        vscode.commands.registerCommand('pinecone.openInferenceToolbox', () => inferenceCommands.openInferencePanel())
    );

    logger.info('Extension activated');
}

/**
 * Deactivates the Pinecone extension.
 * 
 * Called by VSCode when the extension is deactivated. Performs cleanup
 * of any resources that need explicit disposal.
 */
export function deactivate(): void {
    logger.info('Extension deactivated');
}
