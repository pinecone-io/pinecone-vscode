/**
 * Index Commands
 * 
 * Command handlers for Pinecone index operations including creation,
 * deletion, configuration, and backup management.
 * 
 * ## Command Registration
 * 
 * Commands are registered in extension.ts and bound to methods in this class.
 * Each command handler follows a consistent pattern:
 * 1. Extract project context from tree item (for JWT auth)
 * 2. Show interactive wizard for user input
 * 3. Call PineconeService API method
 * 4. Show success/error message
 * 5. Refresh tree view via shared refreshExplorer() helper
 * 
 * ## Error Handling
 * 
 * All commands catch errors at the boundary and show user-friendly messages.
 * Authentication errors prompt the user to log in again.
 * 
 * @module commands/index.commands
 */

import * as vscode from 'vscode';
import { PineconeService } from '../services/pineconeService';
import { PineconeTreeItem, PineconeItemType } from '../providers/treeItems';
import { PineconeTreeDataProvider } from '../providers/pineconeTreeDataProvider';
import { IndexModel, ServerlessSpec, PodSpec, RestoreJob, CreateIndexForModelRequest, BackupModel } from '../api/types';
import { CLOUD_REGIONS, EMBEDDING_MODELS, POLLING_CONFIG } from '../utils/constants';
import { getErrorMessage } from '../utils/errorHandling';
import { buildProjectContextFromItem, setProjectContextFromItem } from '../utils/treeItemHelpers';
import { refreshExplorer } from '../utils/refreshExplorer';

/**
 * Handles all index-related commands in the extension.
 * 
 * Provides interactive wizards for complex operations like index creation
 * and configuration updates.
 */
export class IndexCommands {
    /**
     * Creates a new IndexCommands instance.
     * @param pineconeService - Service for Pinecone API operations
     * @param treeDataProvider - Tree data provider for refreshing the tree view
     * @param treeView - The tree view instance for additional control
     */
    constructor(
        private pineconeService: PineconeService,
        private treeDataProvider: PineconeTreeDataProvider,
        private treeView?: vscode.TreeView<PineconeTreeItem>,
        private extensionUri?: vscode.Uri
    ) {}

    /**
     * Creates a new serverless index using an interactive wizard.
     * 
     * Supports two types of indexes:
     * 1. Integrated embeddings: Pinecone automatically converts text to vectors
     * 2. Standard indexes: User provides their own vectors (dense or sparse)
     * 
     * Note: This extension only supports serverless indexes. Pod-based indexes
     * are not supported for creation. Existing pod indexes can be queried and deleted.
     * 
     * When invoked from a tree item context (e.g., right-click on Database category),
     * the project context is extracted from the tree item's parentId. For JWT auth,
     * this ensures the index is created in the correct project.
     * 
     * @param item - Optional tree item providing project context
     */
    async createIndex(item?: PineconeTreeItem): Promise<void> {
        // Set project context from tree item if available (for JWT auth)
        if (item) {
            setProjectContextFromItem(item, this.pineconeService);
        }

        const projectContext = item ? buildProjectContextFromItem(item) : undefined;
        const { CreateIndexPanel } = await import('../webview/createIndexPanel.js');
        CreateIndexPanel.createOrShow(
            this.extensionUri || vscode.Uri.file(''),
            this.pineconeService,
            this.treeDataProvider,
            projectContext
        );
    }

    /**
     * Creates an index with integrated embeddings.
     * Pinecone automatically converts text to vectors using a hosted model.
     */
    private async createIntegratedEmbeddingIndex(name: string): Promise<void> {
        // ========== Step 1: Select embedding model ==========
        const modelItems = EMBEDDING_MODELS.map(m => ({
            label: m.label,
            description: m.isSparse ? 'Sparse vectors' : `Dense vectors (${m.dimensions.join(', ')} dims)`,
            model: m
        }));

        const selectedModel = await vscode.window.showQuickPick(modelItems, {
            placeHolder: 'Select embedding model'
        });
        if (!selectedModel) { return; }
        const model = selectedModel.model;

        // ========== Step 2: Select dimension (if multiple options) ==========
        let dimension: number | undefined;
        if (model.dimensions.length === 1) {
            // Single dimension - use it automatically
            dimension = model.dimensions[0];
        } else if (model.dimensions.length > 1) {
            // Multiple options - let user choose
            const dimensionItems = model.dimensions.map(d => ({
                label: String(d),
                description: d === model.defaultDimension ? '(default)' : undefined
            }));

            const selectedDimension = await vscode.window.showQuickPick(dimensionItems, {
                placeHolder: 'Select vector dimension'
            });
            if (!selectedDimension) { return; }
            dimension = parseInt(selectedDimension.label);
        }
        // Note: sparse models don't need dimension

        // ========== Step 3: Select cloud provider ==========
        const cloud = await vscode.window.showQuickPick(
            [
                { label: 'aws', description: 'Amazon Web Services' },
                { label: 'gcp', description: 'Google Cloud Platform' },
                { label: 'azure', description: 'Microsoft Azure' }
            ],
            { placeHolder: 'Select cloud provider' }
        );
        if (!cloud) { return; }

        // ========== Step 4: Select region ==========
        const regions = CLOUD_REGIONS[cloud.label];
        let region: string;
        
        if (regions.length === 1) {
            // Only one region available - use it automatically
            region = regions[0].label;
        } else {
            const selectedRegion = await vscode.window.showQuickPick(regions, {
                placeHolder: 'Select region'
            });
            if (!selectedRegion) { return; }
            region = selectedRegion.label;
        }

        // ========== Step 5: Get text field name ==========
        const textField = await vscode.window.showInputBox({
            prompt: 'Enter the name of the text field in your documents to embed',
            value: 'text',
            placeHolder: 'text',
            validateInput: (value) => {
                if (!value) { return 'Field name is required'; }
                return null;
            }
        });
        if (!textField) { return; }

        // ========== Build request and create index ==========
        const request: CreateIndexForModelRequest = {
            name,
            cloud: cloud.label as 'aws' | 'gcp' | 'azure',
            region,
            embed: {
                model: model.name,
                field_map: { text: textField }
            }
        };

        // Add dimension for dense models that support it
        if (dimension && !model.isSparse) {
            request.embed.dimension = dimension;
        }

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Creating index "${name}" with ${model.label}...`,
                cancellable: false
            }, async (progress) => {
                // Create the index
                await this.pineconeService.createIndexForModel(request);
                
                // Poll for index to be ready
                progress.report({ message: 'Waiting for index to be ready...' });
                
                const maxWaitMs = POLLING_CONFIG.MAX_WAIT_MS;
                const pollIntervalMs = POLLING_CONFIG.POLL_INTERVAL_MS;
                const startTime = Date.now();
                
                while (Date.now() - startTime < maxWaitMs) {
                    await this.sleep(pollIntervalMs);
                    
                    try {
                        const indexStatus = await this.pineconeService.describeIndex(name);
                        const state = indexStatus.status?.state?.toLowerCase();
                        
                        if (state === 'ready') {
                            progress.report({ message: 'Index is ready!' });
                            return;
                        }
                        
                        if (state === 'terminating' || state === 'failed') {
                            throw new Error(`Index creation failed: ${indexStatus.status?.state}`);
                        }
                        
                        // Still initializing
                        const elapsed = Math.round((Date.now() - startTime) / 1000);
                        progress.report({ message: `Waiting for index... (${elapsed}s)` });
                    } catch (pollError) {
                        // Index might not be immediately visible, continue polling
                        const elapsed = Math.round((Date.now() - startTime) / 1000);
                        progress.report({ message: `Waiting for index... (${elapsed}s)` });
                    }
                }
                
                // Timeout - index may still become ready, but we'll stop waiting
                progress.report({ message: 'Index created (may take longer to initialize)' });
            });
            
            vscode.window.showInformationMessage(`Index "${name}" created successfully`);

            void refreshExplorer({ treeDataProvider: this.treeDataProvider });
        } catch (e: unknown) {
            const message = getErrorMessage(e);
            vscode.window.showErrorMessage(`Failed to create index: ${message}`);
        }
    }

    /**
     * Creates a standard index where user provides their own vectors.
     * Supports both dense and sparse vector types.
     */
    private async createStandardIndex(name: string): Promise<void> {
        // ========== Step 1: Dense or Sparse? ==========
        const vectorType = await vscode.window.showQuickPick(
            [
                { 
                    label: '$(symbol-array) Dense Vectors', 
                    description: 'Standard fixed-dimension embeddings (e.g., OpenAI, Cohere)',
                    value: 'dense' 
                },
                { 
                    label: '$(list-filter) Sparse Vectors', 
                    description: 'Variable-dimension keyword/token vectors (e.g., BM25, SPLADE)',
                    value: 'sparse' 
                }
            ],
            { placeHolder: 'Select vector type' }
        );
        if (!vectorType) { return; }

        let dimension: number | undefined;
        let metric: 'cosine' | 'dotproduct' | 'euclidean';

        if (vectorType.value === 'dense') {
            // ========== Dense: Get dimension and metric ==========
            const dimensionStr = await vscode.window.showInputBox({
                prompt: 'Enter vector dimension',
                placeHolder: '1536 (for OpenAI embeddings)',
                validateInput: (value) => {
                    const dim = parseInt(value);
                    if (isNaN(dim) || dim <= 0) { return 'Dimension must be a positive integer'; }
                    if (dim > 20000) { return 'Dimension must be 20000 or less'; }
                    return null;
                }
            });
            if (!dimensionStr) { return; }
            dimension = parseInt(dimensionStr);

            // Select metric for dense vectors
            const metricSelection = await vscode.window.showQuickPick(
                [
                    { label: 'cosine', description: 'Best for normalized vectors (default)' },
                    { label: 'dotproduct', description: 'Best for non-normalized vectors' },
                    { label: 'euclidean', description: 'L2 distance metric' }
                ],
                { placeHolder: 'Select distance metric' }
            );
            if (!metricSelection) { return; }
            metric = metricSelection.label as 'cosine' | 'dotproduct' | 'euclidean';
        } else {
            // Sparse vectors only support dotproduct - no user input needed
            metric = 'dotproduct';
        }

        // ========== Step 2: Select cloud provider ==========
        const cloud = await vscode.window.showQuickPick(
            [
                { label: 'aws', description: 'Amazon Web Services' },
                { label: 'gcp', description: 'Google Cloud Platform' },
                { label: 'azure', description: 'Microsoft Azure' }
            ],
            { placeHolder: 'Select cloud provider' }
        );
        if (!cloud) { return; }

        // ========== Step 3: Select region ==========
        const regions = CLOUD_REGIONS[cloud.label];
        let region: string;
        
        if (regions.length === 1) {
            // Only one region available - use it automatically
            region = regions[0].label;
        } else {
            const selectedRegion = await vscode.window.showQuickPick(regions, {
                placeHolder: 'Select region'
            });
            if (!selectedRegion) { return; }
            region = selectedRegion.label;
        }

        // ========== Build spec and create index ==========
        const spec: ServerlessSpec = {
            serverless: { 
                cloud: cloud.label as 'aws' | 'gcp' | 'azure', 
                region 
            }
        };

        // Build index config
        const indexConfig: Partial<IndexModel> = {
            name,
            metric,
            spec
        };

        // Add dimension and vector_type based on selection
        if (vectorType.value === 'dense') {
            indexConfig.dimension = dimension;
        } else {
            // Sparse index configuration
            indexConfig.vector_type = 'sparse';
        }

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Creating ${vectorType.value} index "${name}"...`,
                cancellable: false
            }, async (progress) => {
                // Create the index
                await this.pineconeService.createIndex(indexConfig);
                
                // Poll for index to be ready
                progress.report({ message: 'Waiting for index to be ready...' });
                
                const maxWaitMs = POLLING_CONFIG.MAX_WAIT_MS;
                const pollIntervalMs = POLLING_CONFIG.POLL_INTERVAL_MS;
                const startTime = Date.now();
                
                while (Date.now() - startTime < maxWaitMs) {
                    await this.sleep(pollIntervalMs);
                    
                    try {
                        const indexStatus = await this.pineconeService.describeIndex(name);
                        const state = indexStatus.status?.state?.toLowerCase();
                        
                        if (state === 'ready') {
                            progress.report({ message: 'Index is ready!' });
                            return;
                        }
                        
                        if (state === 'terminating' || state === 'failed') {
                            throw new Error(`Index creation failed: ${indexStatus.status?.state}`);
                        }
                        
                        // Still initializing
                        const elapsed = Math.round((Date.now() - startTime) / 1000);
                        progress.report({ message: `Waiting for index... (${elapsed}s)` });
                    } catch (pollError) {
                        // Index might not be immediately visible, continue polling
                        const elapsed = Math.round((Date.now() - startTime) / 1000);
                        progress.report({ message: `Waiting for index... (${elapsed}s)` });
                    }
                }
                
                // Timeout - index may still become ready, but we'll stop waiting
                progress.report({ message: 'Index created (may take longer to initialize)' });
            });
            
            vscode.window.showInformationMessage(`Index "${name}" created successfully`);

            void refreshExplorer({ treeDataProvider: this.treeDataProvider });
        } catch (e: unknown) {
            const message = getErrorMessage(e);
            vscode.window.showErrorMessage(`Failed to create index: ${message}`);
        }
    }

    /**
     * Prompts the user to type a resource name to confirm deletion.
     * 
     * This provides an extra layer of protection for destructive operations,
     * similar to the Pinecone web console's delete confirmation pattern.
     * 
     * @param resourceType - Type of resource being deleted (e.g., 'index', 'backup')
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
     * Deletes an index after confirmation.
     * 
     * Requires the user to type the index name to confirm deletion,
     * providing an extra layer of protection against accidental deletions.
     * 
     * When invoked from a tree item context (e.g., right-click on an index),
     * the project context is extracted from the tree item's parentId. For JWT auth,
     * this ensures the delete operation targets the correct project.
     * 
     * @param item - Tree item representing the index to delete
     */
    async deleteIndex(item: PineconeTreeItem): Promise<void> {
        if (!item.resourceId) { return; }
        const name = item.resourceId;
        const index = item.metadata?.index as IndexModel | undefined;

        // Set project context from tree item for JWT authentication
        // Uses full project context when available for managed API key authentication
        setProjectContextFromItem(item, this.pineconeService);

        // Check for deletion protection
        if (index?.deletion_protection === 'enabled') {
            const disableFirst = await vscode.window.showWarningMessage(
                `Index "${name}" has deletion protection enabled. Disable it first?`,
                { modal: true },
                'Disable Protection'
            );
            
            if (disableFirst === 'Disable Protection') {
                try {
                    await this.pineconeService.configureIndex(name, { deletion_protection: 'disabled' });
                    vscode.window.showInformationMessage('Deletion protection disabled. Please try deleting again.');
                    void refreshExplorer({
                        treeDataProvider: this.treeDataProvider,
                        delayMs: 0,
                        focusExplorer: false
                    });
                } catch (e: unknown) {
                    const message = getErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to disable protection: ${message}`);
                }
            }
            return;
        }

        // Step 1: Initial warning confirmation
        const confirmation = await vscode.window.showWarningMessage(
            `Are you sure you want to delete index "${name}"? This action cannot be undone and all data will be lost.`,
            { modal: true },
            'Delete'
        );

        if (confirmation !== 'Delete') { return; }

        // Step 2: Require user to type the index name to confirm
        // This matches the Pinecone web console's delete confirmation pattern
        const confirmed = await this.confirmDeletionByName('index', name);
        if (!confirmed) {
            vscode.window.showInformationMessage('Index deletion cancelled.');
            return;
        }

        // Step 3: Proceed with deletion
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Deleting index "${name}"...`,
                cancellable: false
            }, async () => {
                await this.pineconeService.deleteIndex(name);
            });
            
            vscode.window.showInformationMessage(`Index "${name}" deleted successfully`);
        } catch (e: unknown) {
            const message = getErrorMessage(e);
            vscode.window.showErrorMessage(`Failed to delete index: ${message}`);
            return; // Don't refresh on error
        }
        
        void refreshExplorer({ treeDataProvider: this.treeDataProvider });
    }

    /**
     * Opens a configuration menu for an index.
     * 
     * Allows updating:
     * - Deletion protection
     * - Pod replicas (for pod indexes)
     * - Tags
     * 
     * When invoked from a tree item context (e.g., right-click on an index),
     * the project context is extracted from the tree item's parentId. For JWT auth,
     * this ensures the configuration update targets the correct project.
     * 
     * @param item - Tree item representing the index to configure
     */
    async configureIndex(item: PineconeTreeItem): Promise<void> {
        if (!item.resourceId) { return; }
        setProjectContextFromItem(item, this.pineconeService);
        const projectContext = buildProjectContextFromItem(item);
        const { ConfigureIndexPanel } = await import('../webview/configureIndexPanel.js');
        ConfigureIndexPanel.createOrShow(
            this.extensionUri || vscode.Uri.file(''),
            this.pineconeService,
            this.treeDataProvider,
            item.resourceId,
            projectContext
        );
    }

    /**
     * Toggles deletion protection for an index.
     */
    private async toggleDeletionProtection(name: string, index?: IndexModel): Promise<void> {
        const currentState = index?.deletion_protection || 'disabled';
        const newState = currentState === 'enabled' ? 'disabled' : 'enabled';
        const action = newState === 'enabled' ? 'enable' : 'disable';

        const confirm = await vscode.window.showInformationMessage(
            `${action.charAt(0).toUpperCase() + action.slice(1)} deletion protection for "${name}"?`,
            { modal: true },
            'Yes'
        );

        if (confirm === 'Yes') {
            try {
                await this.pineconeService.configureIndex(name, { deletion_protection: newState });
                vscode.window.showInformationMessage(`Deletion protection ${newState} for "${name}"`);
                void refreshExplorer({
                    treeDataProvider: this.treeDataProvider,
                    delayMs: 0,
                    focusExplorer: false
                });
            } catch (e: unknown) {
                const message = getErrorMessage(e);
                vscode.window.showErrorMessage(`Failed to update deletion protection: ${message}`);
            }
        }
    }

    /**
     * Updates the replica count for a pod index.
     */
    private async updateReplicas(name: string, index?: IndexModel): Promise<void> {
        const currentReplicas = (index?.spec as PodSpec)?.pod?.replicas || 1;
        
        const replicasStr = await vscode.window.showInputBox({
            prompt: 'Enter new replica count',
            value: String(currentReplicas),
            validateInput: (value) => {
                const num = parseInt(value);
                if (isNaN(num) || num < 1) {return 'Must be at least 1';}
                if (num > 20) {return 'Maximum 20 replicas';}
                return null;
            }
        });
        if (!replicasStr) { return; }

        const replicas = parseInt(replicasStr);
        if (replicas === currentReplicas) {
            vscode.window.showInformationMessage('Replica count unchanged');
            return;
        }

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Updating replicas for "${name}"...`,
                cancellable: false
            }, async () => {
                await this.pineconeService.configureIndex(name, {
                    spec: { pod: { replicas } }
                });
            });
            vscode.window.showInformationMessage(`Replicas updated to ${replicas} for "${name}"`);
            void refreshExplorer({
                treeDataProvider: this.treeDataProvider,
                delayMs: 0,
                focusExplorer: false
            });
        } catch (e: unknown) {
            const message = getErrorMessage(e);
            vscode.window.showErrorMessage(`Failed to update replicas: ${message}`);
        }
    }

    /**
     * Adds or updates tags on an index.
     * 
     * When invoked from a tree item context (e.g., right-click on an index),
     * the project context is extracted from the tree item's parentId. For JWT auth,
     * this ensures the tag update targets the correct project.
     * 
     * @param item - Tree item representing the index
     */
    async addTags(item: PineconeTreeItem): Promise<void> {
        await this.configureIndex(item);
    }

    /**
     * Creates a backup of an index.
     * 
     * When invoked from a tree item context (e.g., right-click on an index),
     * the project context is extracted from the tree item's parentId. For JWT auth,
     * this ensures the backup is created in the correct project.
     * 
     * @param item - Tree item representing the index to backup
     * @see https://docs.pinecone.io/reference/api/2025-10/control-plane/create_backup
     */
    async createBackup(item: PineconeTreeItem): Promise<void> {
        if (!item.resourceId) { return; }
        const indexName = item.resourceId;

        // Build project context for API calls
        const projectContext = buildProjectContextFromItem(item);
        
        // Also set shared context for backward compatibility
        setProjectContextFromItem(item, this.pineconeService);

        const backupName = await vscode.window.showInputBox({
            prompt: 'Enter backup name',
            placeHolder: `${indexName}-backup-${new Date().toISOString().split('T')[0]}`,
            validateInput: (value) => {
                if (!value) {return 'Backup name is required';}
                if (!/^[a-z0-9-]+$/.test(value)) {
                    return 'Name must consist of lowercase alphanumeric characters or hyphens';
                }
                return null;
            }
        });
        if (!backupName) { return; }

        try {
            // Create the backup and get the backup ID for polling
            let backupId: string | undefined;
            
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Creating backup "${backupName}"...`,
                cancellable: false
            }, async (progress) => {
                // Start backup creation
                const backup = await this.pineconeService.getControlPlane().createBackup(
                    indexName, 
                    backupName,
                    projectContext
                );
                backupId = backup.backup_id;
                
                // Poll for backup completion
                progress.report({ message: 'Waiting for backup to complete...' });
                
                const maxWaitMs = POLLING_CONFIG.MAX_WAIT_MS;
                const pollIntervalMs = POLLING_CONFIG.POLL_INTERVAL_MS;
                const startTime = Date.now();
                
                while (Date.now() - startTime < maxWaitMs) {
                    await this.sleep(pollIntervalMs);
                    
                    const status = await this.pineconeService.getControlPlane().describeBackup(
                        backupId,
                        projectContext
                    );
                    
                    if (status.status.toLowerCase() === 'ready') {
                        progress.report({ message: 'Backup complete!' });
                        return;
                    }
                    
                    if (status.status.toLowerCase() === 'failed') {
                        throw new Error(`Backup failed: ${status.status}`);
                    }
                    
                    // Still in progress
                    const elapsed = Math.round((Date.now() - startTime) / 1000);
                    progress.report({ message: `Waiting for backup... (${elapsed}s)` });
                }
                
                // Timeout - backup may still complete, but we'll stop waiting
                progress.report({ message: 'Backup started (taking longer than expected)' });
            });
            
            vscode.window.showInformationMessage(`Backup "${backupName}" created successfully`);

            void refreshExplorer({ treeDataProvider: this.treeDataProvider });
        } catch (e: unknown) {
            const message = getErrorMessage(e);
            vscode.window.showErrorMessage(`Failed to create backup: ${message}`);
        }
    }
    
    /**
     * Helper to pause execution for a specified duration.
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Displays a list of backups for an index.
     * 
     * When invoked from a tree item context (e.g., right-click on an index),
     * the project context is extracted from the tree item's parentId. For JWT auth,
     * this ensures the backup list is fetched from the correct project.
     * 
     * @param item - Tree item representing the index
     * @see https://docs.pinecone.io/reference/api/2025-10/control-plane/list_index_backups
     */
    async viewBackups(item: PineconeTreeItem): Promise<void> {
        if (!item.resourceId) { return; }
        const indexName = item.resourceId;

        // Set project context from tree item for JWT authentication
        // Uses full project context when available for managed API key authentication
        setProjectContextFromItem(item, this.pineconeService);

        try {
            const backups = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Loading backups for "${indexName}"...`,
                cancellable: false
            }, async () => {
                return this.pineconeService.getControlPlane().listBackups(indexName);
            });

            if (backups.length === 0) {
                vscode.window.showInformationMessage(`No backups found for index "${indexName}"`);
                return;
            }

            const items = backups.map(b => ({
                label: `$(archive) ${b.name}`,
                description: b.status,
                detail: `Created: ${new Date(b.created_at).toLocaleString()} | Vectors: ${b.record_count.toLocaleString()} | Size: ${this.formatBytes(b.size_bytes)}`
            }));

            await vscode.window.showQuickPick(items, {
                placeHolder: `Backups for "${indexName}" (${backups.length} total)`
            });
        } catch (e: unknown) {
            const message = getErrorMessage(e);
            vscode.window.showErrorMessage(`Failed to list backups: ${message}`);
        }
    }

    /**
     * Shows statistics for an index.
     * 
     * When invoked from a tree item context (e.g., right-click on an index),
     * the project context is extracted from the tree item's parentId. For JWT auth,
     * this ensures the stats request uses the correct project's managed API key.
     * 
     * @param item - Tree item representing the index
     */
    async showIndexStats(item: PineconeTreeItem): Promise<void> {
        if (!item.resourceId || !item.metadata?.index?.host) { return; }
        
        const name = item.resourceId;
        const host = item.metadata.index.host;

        // Set project context from tree item for JWT authentication
        // Uses full project context when available for managed API key authentication
        setProjectContextFromItem(item, this.pineconeService);

        try {
            const stats = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Loading stats for "${name}"...`,
                cancellable: false
            }, async () => {
                return this.pineconeService.describeIndexStats(host);
            });

            // Format namespace info
            const namespaceInfo = Object.entries(stats.namespaces || {})
                .map(([ns, data]) => `  ${ns || '(default)'}: ${data.vectorCount.toLocaleString()} vectors`)
                .join('\n');

            const message = [
                `Index: ${name}`,
                `Total Vectors: ${stats.totalVectorCount.toLocaleString()}`,
                `Dimension: ${stats.dimension}`,
                `Index Fullness: ${(stats.indexFullness * 100).toFixed(1)}%`,
                '',
                'Namespaces:',
                namespaceInfo || '  (no namespaces)'
            ].join('\n');

            // Show in output channel for better formatting
            const outputChannel = vscode.window.createOutputChannel('Pinecone Index Stats');
            outputChannel.clear();
            outputChannel.appendLine(message);
            outputChannel.show();

        } catch (e: unknown) {
            const message = getErrorMessage(e);
            vscode.window.showErrorMessage(`Failed to get index stats: ${message}`);
        }
    }

    /**
     * Restores an index from a backup using an interactive wizard.
     * 
     * Creates a NEW index from the backup data - Pinecone restore does not
     * overwrite the existing index. The user must provide a name for the
     * new index (defaulting to `{original}-restored`).
     * 
     * Only works with serverless index backups.
     * 
     * When invoked from a tree item context (e.g., right-click on an index),
     * the project context is extracted from the tree item's parentId. For JWT auth,
     * this ensures the backup operations target the correct project.
     * 
     * @param item - Tree item representing the index (to get its backups)
     * @see https://docs.pinecone.io/reference/api/2025-10/control-plane/create_index_from_backup
     */
    async restoreBackup(item: PineconeTreeItem): Promise<void> {
        // Build project context for API calls
        const projectContext = buildProjectContextFromItem(item);
        
        // Also set shared context for backward compatibility
        setProjectContextFromItem(item, this.pineconeService);

        try {
            // Determine if we're operating on a specific backup item or listing backups for an index
            let selectedBackup: BackupModel | undefined;
            const isBackupItem = item.itemType === PineconeItemType.Backup;
            
            // Get index name from the appropriate source:
            // - For backup items: from metadata.index.name, metadata.backup.source_index_name, or resourceId of parent
            // - For index items: from resourceId
            // Note: parentId is now a composite ID (projectId:indexName), so we use metadata
            let indexName: string;
            if (isBackupItem) {
                const index = item.metadata?.index as IndexModel | undefined;
                const backup = item.metadata?.backup as BackupModel | undefined;
                indexName = index?.name || backup?.source_index_name || '';
            } else {
                indexName = item.resourceId || '';
            }
            
            if (isBackupItem) {
                // Direct restore from backup item
                selectedBackup = item.metadata?.backup as BackupModel;
                
                if (!selectedBackup) {
                    // Fallback if metadata is missing
                    const backupId = item.resourceId;
                    if (!backupId) { return; }
                    
                    selectedBackup = {
                        backup_id: backupId,
                        name: item.label?.toString() || backupId,
                        source_index_name: indexName,
                        // Minimal required fields
                        source_index_id: '',
                        status: 'Ready',
                        cloud: '',
                        region: '',
                        created_at: new Date().toISOString(),
                        dimension: 0,
                        metric: '',
                        record_count: 0,
                        namespace_count: 0,
                        size_bytes: 0
                    };
                }
            } else {
                // Listing flow (from Index item)
                if (!item.resourceId) { return; }

                // Step 1: Load and select backup
                const backups = await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `Loading backups for "${indexName}"...`,
                    cancellable: false
                }, async () => {
                    return this.pineconeService.getControlPlane().listBackups(indexName);
                });

                if (backups.length === 0) {
                    vscode.window.showInformationMessage(`No backups found for index "${indexName}"`);
                    return;
                }

                // Filter to ready backups only
                const readyBackups = backups.filter(b => b.status === 'Ready');
                if (readyBackups.length === 0) {
                    vscode.window.showWarningMessage('No ready backups available for restore');
                    return;
                }

                const backupItems = readyBackups.map(b => ({
                    label: `$(archive) ${b.name}`,
                    description: `${b.record_count.toLocaleString()} vectors`,
                    detail: `Created: ${new Date(b.created_at).toLocaleString()} | Size: ${this.formatBytes(b.size_bytes)}`,
                    backup: b
                }));

                const selection = await vscode.window.showQuickPick(backupItems, {
                    placeHolder: 'Select a backup to restore from'
                });
                if (!selection) { return; }
                selectedBackup = selection.backup;
            }

            if (!selectedBackup) { return; }

            // Step 2: Get new index name
            const newIndexName = await vscode.window.showInputBox({
                prompt: 'Enter name for the restored index',
                value: `${indexName}-restored`,
                validateInput: (value) => {
                    if (!value) { return 'Index name is required'; }
                    if (!/^[a-z0-9-]+$/.test(value)) {
                        return 'Name must consist of lowercase alphanumeric characters or hyphens';
                    }
                    if (value.length > 45) {
                        return 'Name must be 45 characters or less';
                    }
                    return null;
                }
            });
            if (!newIndexName) { return; }

            // Step 3: Deletion protection
            const enableProtection = await vscode.window.showQuickPick(
                [
                    { label: 'No', description: 'Deletion protection disabled (default)', value: 'disabled' as const },
                    { label: 'Yes', description: 'Enable deletion protection', value: 'enabled' as const }
                ],
                { placeHolder: 'Enable deletion protection on restored index?' }
            );
            if (!enableProtection) { return; }

            // Step 4: Optional tags
            const tagsStr = await vscode.window.showInputBox({
                prompt: 'Enter tags as key=value pairs separated by comma (optional)',
                placeHolder: 'env=prod, restored=true'
            });
            
            // Parse tags
            const tags: Record<string, string> = {};
            if (tagsStr && tagsStr.trim()) {
                tagsStr.split(',').forEach(pair => {
                    const [key, value] = pair.split('=').map(s => s.trim());
                    if (key) { tags[key] = value || ''; }
                });
            }

            // Step 5: Create restore job and wait for completion
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Restoring backup to "${newIndexName}"...`,
                cancellable: false
            }, async (progress) => {
                // Start the restore
                await this.pineconeService.getControlPlane().createIndexFromBackup({
                    backup_id: selectedBackup!.backup_id,
                    name: newIndexName,
                    deletion_protection: enableProtection.value,
                    tags: Object.keys(tags).length > 0 ? tags : undefined
                });
                
                // Poll for index to become ready
                progress.report({ message: 'Waiting for index to be ready...' });
                
                const maxWaitMs = POLLING_CONFIG.MAX_WAIT_MS;
                const pollIntervalMs = POLLING_CONFIG.POLL_INTERVAL_MS;
                const startTime = Date.now();
                
                while (Date.now() - startTime < maxWaitMs) {
                    await this.sleep(pollIntervalMs);
                    
                    try {
                        const index = await this.pineconeService.getControlPlane().describeIndex(
                            newIndexName,
                            projectContext
                        );
                        
                        if (index.status?.state === 'Ready') {
                            progress.report({ message: 'Index ready!' });
                            return;
                        }
                        
                        // Check for failure states (Terminating means something went wrong during init)
                        if (index.status?.state === 'Terminating') {
                            throw new Error(`Index creation failed: ${index.status?.state}`);
                        }
                        
                        // Still initializing
                        const elapsed = Math.round((Date.now() - startTime) / 1000);
                        progress.report({ message: `Waiting for index... (${elapsed}s)` });
                    } catch (e: unknown) {
                        // Index might not exist yet in early stages, continue polling
                        const elapsed = Math.round((Date.now() - startTime) / 1000);
                        progress.report({ message: `Waiting for index... (${elapsed}s)` });
                    }
                }
                
                // Timeout - index may still complete, but we'll stop waiting
                progress.report({ message: 'Restore started (taking longer than expected)' });
            });

            vscode.window.showInformationMessage(`Index "${newIndexName}" restored successfully`);

            void refreshExplorer({ treeDataProvider: this.treeDataProvider });

        } catch (e: unknown) {
            const message = getErrorMessage(e);
            vscode.window.showErrorMessage(`Failed to restore backup: ${message}`);
        }
    }

    /**
     * Deletes a backup after confirmation.
     * 
     * Shows a list of backups for the index and allows the user to select
     * one to delete. Requires the user to type the backup name to confirm
     * deletion (matching Pinecone web console behavior).
     * 
     * When invoked from a tree item context (e.g., right-click on an index),
     * the project context is extracted from the tree item's parentId. For JWT auth,
     * this ensures the backup operations target the correct project.
     * 
     * @param item - Tree item representing the index
     * @see https://docs.pinecone.io/reference/api/2025-10/control-plane/delete_backup
     */
    async deleteBackup(item: PineconeTreeItem): Promise<void> {
        // Set project context from tree item for JWT authentication
        // Uses full project context when available for managed API key authentication
        // This is critical for backup operations which require proper Api-Key auth
        setProjectContextFromItem(item, this.pineconeService);

        try {
            // Determine if we're operating on a specific backup item or listing backups for an index
            let backupToDelete: BackupModel | undefined;
            const isBackupItem = item.itemType === PineconeItemType.Backup;

            if (isBackupItem) {
                // Direct deletion from backup item
                // When item is a Backup, metadata contains the backup object
                backupToDelete = item.metadata?.backup as BackupModel;
                
                if (!backupToDelete) {
                    // Fallback: construct minimal backup model if metadata missing
                    // Use resourceId as backup_id (which is how Backup items are constructed)
                    const backupId = item.resourceId; 
                    if (!backupId) { return; }
                    
                    // Get index name from metadata, not parentId (which is now composite)
                    const index = item.metadata?.index as IndexModel | undefined;
                    const sourceIndexName = index?.name || 'unknown';
                    
                    // We need at least the name for confirmation
                    // If name is not available, use ID
                    backupToDelete = {
                        backup_id: backupId,
                        name: item.label?.toString() || backupId,
                        source_index_name: sourceIndexName,
                        // Minimal required fields
                        source_index_id: '',
                        status: 'Ready',
                        cloud: '',
                        region: '',
                        created_at: new Date().toISOString(),
                        dimension: 0,
                        metric: '',
                        record_count: 0,
                        namespace_count: 0,
                        size_bytes: 0
                    };
                }
            } else {
                // Listing flow (from Index item)
                if (!item.resourceId) { return; }
                const indexName = item.resourceId;

                // Load backups
                const backups = await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `Loading backups for "${indexName}"...`,
                    cancellable: false
                }, async () => {
                    return this.pineconeService.getControlPlane().listBackups(indexName);
                });

                if (backups.length === 0) {
                    vscode.window.showInformationMessage(`No backups found for index "${indexName}"`);
                    return;
                }

                const backupItems = backups.map(b => ({
                    label: `$(archive) ${b.name}`,
                    description: b.status,
                    detail: `Created: ${new Date(b.created_at).toLocaleString()} | Vectors: ${b.record_count.toLocaleString()}`,
                    backup: b
                }));

                const selectedBackup = await vscode.window.showQuickPick(backupItems, {
                    placeHolder: 'Select a backup to delete'
                });
                if (!selectedBackup) { return; }
                backupToDelete = selectedBackup.backup;
            }

            if (!backupToDelete) { return; }

            // Step 1: Initial warning confirmation
            const confirmation = await vscode.window.showWarningMessage(
                `Are you sure you want to delete backup "${backupToDelete.name}"? This action cannot be undone.`,
                { modal: true },
                'Delete'
            );

            if (confirmation !== 'Delete') { return; }

            // Step 2: Require user to type the backup name to confirm
            // This matches the Pinecone web console's delete confirmation pattern
            const confirmed = await this.confirmDeletionByName('backup', backupToDelete.name);
            if (!confirmed) {
                vscode.window.showInformationMessage('Backup deletion cancelled.');
                return;
            }

            // Step 3: Proceed with deletion
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Deleting backup "${backupToDelete.name}"...`,
                cancellable: false
            }, async () => {
                await this.pineconeService.getControlPlane().deleteBackup(backupToDelete!.backup_id);
            });

            vscode.window.showInformationMessage(`Backup "${backupToDelete.name}" deleted successfully`);

            void refreshExplorer({ treeDataProvider: this.treeDataProvider });

        } catch (e: unknown) {
            const message = getErrorMessage(e);
            vscode.window.showErrorMessage(`Failed to delete backup: ${message}`);
        }
    }

    /**
     * Displays a list of all restore jobs with their status.
     * 
     * Shows restore jobs across all indexes with options to refresh
     * and view details.
     */
    async viewRestoreJobs(): Promise<void> {
        try {
            const response = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Loading restore jobs...',
                cancellable: false
            }, async () => {
                return this.pineconeService.getControlPlane().listRestoreJobs({ limit: 50 });
            });

            const jobs = response.data || [];

            if (jobs.length === 0) {
                vscode.window.showInformationMessage('No restore jobs found');
                return;
            }

            // Format job items with status icons
            const jobItems = jobs.map(job => {
                const statusIcon = job.status === 'Completed' ? '$(check)' :
                                   job.status === 'Failed' ? '$(error)' :
                                   '$(sync~spin)';
                const progress = job.status === 'InProgress' ? ` (${job.percent_complete}%)` : '';
                
                return {
                    label: `${statusIcon} ${job.target_index_name}`,
                    description: `${job.status}${progress}`,
                    detail: `From backup: ${job.backup_id} | Started: ${new Date(job.created_at).toLocaleString()}`,
                    job
                };
            });

            const selected = await vscode.window.showQuickPick(jobItems, {
                placeHolder: `Restore Jobs (${jobs.length} total)`,
                matchOnDescription: true,
                matchOnDetail: true
            });

            if (selected) {
                // Show detailed job info
                this.showRestoreJobDetails(selected.job);
            }

        } catch (e: unknown) {
            const message = getErrorMessage(e);
            vscode.window.showErrorMessage(`Failed to list restore jobs: ${message}`);
        }
    }

    /**
     * Shows detailed information about a restore job.
     */
    private showRestoreJobDetails(job: RestoreJob): void {
        const outputChannel = vscode.window.createOutputChannel('Pinecone Restore Job');
        outputChannel.clear();
        
        const completedAt = job.completed_at 
            ? new Date(job.completed_at).toLocaleString() 
            : 'In progress...';

        outputChannel.appendLine(`Restore Job: ${job.restore_job_id}`);
        outputChannel.appendLine('');
        outputChannel.appendLine(`Target Index: ${job.target_index_name}`);
        outputChannel.appendLine(`Target Index ID: ${job.target_index_id}`);
        outputChannel.appendLine(`Source Backup: ${job.backup_id}`);
        outputChannel.appendLine('');
        outputChannel.appendLine(`Status: ${job.status}`);
        outputChannel.appendLine(`Progress: ${job.percent_complete}%`);
        outputChannel.appendLine('');
        outputChannel.appendLine(`Started: ${new Date(job.created_at).toLocaleString()}`);
        outputChannel.appendLine(`Completed: ${completedAt}`);
        
        outputChannel.show();
    }

    /**
     * Formats bytes into human-readable string.
     */
    private formatBytes(bytes: number): string {
        if (bytes === 0) { return '0 B'; }
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
    }
}
