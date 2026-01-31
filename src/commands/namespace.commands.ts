/**
 * Namespace Commands
 * 
 * Command handlers for Pinecone namespace operations including creation,
 * deletion, and viewing namespace details.
 * 
 * Namespaces partition vector data within a serverless index, enabling
 * logical separation while sharing the same index configuration.
 * 
 * @module commands/namespace
 */

import * as vscode from 'vscode';
import { PineconeService } from '../services/pineconeService';
import { PineconeTreeItem } from '../providers/treeItems';
import { getErrorMessage } from '../utils/errorHandling';
import { IndexModel, MetadataSchema } from '../api/types';
import { buildProjectContextFromItem } from '../utils/treeItemHelpers';

/**
 * Validates a namespace name.
 * 
 * Valid namespace names:
 * - Are non-empty (unless creating default namespace)
 * - Contain only alphanumeric characters, hyphens, and underscores
 * - Are 64 characters or less
 * 
 * @param value - The namespace name to validate
 * @param allowEmpty - Whether to allow empty string (for default namespace)
 * @returns Error message if invalid, null if valid
 */
export function validateNamespaceName(value: string, allowEmpty = false): string | null {
    if (!value && !allowEmpty) {
        return 'Namespace name is required';
    }
    if (value && !/^[a-zA-Z0-9_-]+$/.test(value)) {
        return 'Name can only contain alphanumeric characters, hyphens, and underscores';
    }
    if (value.length > 64) {
        return 'Name must be 64 characters or less';
    }
    return null;
}

/**
 * Handles all namespace-related commands in the extension.
 * 
 * Provides interactive interfaces for namespace management including
 * creation with optional schema configuration.
 */
export class NamespaceCommands {
    /**
     * Creates a new NamespaceCommands instance.
     * @param pineconeService - Service for Pinecone API operations
     */
    constructor(private pineconeService: PineconeService) {}

    /**
     * Creates a new namespace using an interactive wizard.
     * 
     * Prompts the user for:
     * - Namespace name
     * - Optional metadata schema with filterable fields
     * 
     * @param item - Tree item representing the Namespaces category (contains index info)
     */
    async createNamespace(item: PineconeTreeItem): Promise<void> {
        const index = item.metadata?.index as IndexModel | undefined;
        if (!index) {
            vscode.window.showErrorMessage('Could not determine index for namespace creation');
            return;
        }

        // Build project context for API calls (required for JWT auth)
        const projectContext = buildProjectContextFromItem(item);

        // Step 1: Get namespace name
        const name = await vscode.window.showInputBox({
            prompt: 'Enter namespace name',
            placeHolder: 'my-namespace',
            validateInput: (value) => validateNamespaceName(value)
        });
        if (name === undefined) { return; } // User cancelled

        // Step 2: Ask about metadata schema
        const addSchema = await vscode.window.showQuickPick(
            [
                { label: 'No', description: 'Create namespace without schema (can add later)' },
                { label: 'Yes', description: 'Define filterable metadata fields' }
            ],
            { placeHolder: 'Would you like to define a metadata schema for filtering?' }
        );
        if (!addSchema) { return; }

        let schema: MetadataSchema | undefined;

        // Step 3: Collect schema fields if requested
        if (addSchema.label === 'Yes') {
            schema = await this.collectSchemaFields();
            if (schema === undefined) { return; } // User cancelled
        }

        // Create the namespace
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Creating namespace "${name || '(default)'}"...`,
                cancellable: false
            }, async () => {
                const namespaceApi = this.pineconeService.getNamespaceApi();
                await namespaceApi.createNamespace(
                    index.host, 
                    { name, schema },
                    projectContext
                );
            });

            vscode.window.showInformationMessage(
                `Namespace "${name || '(default)'}" created successfully`
            );
            vscode.commands.executeCommand('pinecone.refresh');
        } catch (e: unknown) {
            const message = getErrorMessage(e);
            vscode.window.showErrorMessage(`Failed to create namespace: ${message}`);
        }
    }

    /**
     * Collects metadata schema fields from user input.
     * 
     * Prompts the user to enter field names in a comma-separated format.
     * All fields are marked as filterable.
     * 
     * @returns MetadataSchema if fields were provided, undefined if cancelled, empty object if no fields
     */
    private async collectSchemaFields(): Promise<MetadataSchema | undefined> {
        const fieldsStr = await vscode.window.showInputBox({
            prompt: 'Enter filterable field names (comma-separated)',
            placeHolder: 'category, author, tags',
            validateInput: (value) => {
                if (!value.trim()) {
                    return 'At least one field name is required for schema';
                }
                // Validate each field name
                const fields = value.split(',').map(f => f.trim()).filter(f => f);
                for (const field of fields) {
                    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field)) {
                        return `Invalid field name: "${field}". Use alphanumeric characters and underscores, starting with a letter or underscore`;
                    }
                }
                return null;
            }
        });
        
        if (fieldsStr === undefined) { return undefined; } // User cancelled
        
        // Parse fields into schema
        const fields = fieldsStr.split(',').map(f => f.trim()).filter(f => f);
        const schema: MetadataSchema = {};
        for (const field of fields) {
            schema[field] = { filterable: true };
        }
        
        return schema;
    }

    /**
     * Shows detailed information about a namespace.
     * 
     * Displays namespace properties including:
     * - Name (or "(default)" for the default namespace)
     * - Record count
     * - Schema fields (if defined)
     * - Indexed fields
     * 
     * @param item - Tree item representing the namespace
     */
    async describeNamespace(item: PineconeTreeItem): Promise<void> {
        const index = item.metadata?.index as IndexModel | undefined;
        const namespaceName = item.resourceId;
        
        if (!index || namespaceName === undefined) {
            vscode.window.showErrorMessage('Could not determine namespace details');
            return;
        }

        // Build project context for API calls (required for JWT auth)
        const projectContext = buildProjectContextFromItem(item);

        try {
            const namespaceApi = this.pineconeService.getNamespaceApi();
            const ns = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Loading namespace details...',
                cancellable: false
            }, async () => {
                // Use actual name or __default__ for API call
                const apiName = namespaceName === '__default__' || namespaceName === '' 
                    ? '__default__' 
                    : namespaceName;
                return namespaceApi.describeNamespace(index.host, apiName, projectContext);
            });

            // Format the details
            const displayName = ns.name === '' ? '(default)' : ns.name;
            const schemaFields = ns.schema 
                ? Object.keys(ns.schema).join(', ') || '(none)'
                : '(not defined)';
            const indexedFields = ns.indexed_fields 
                ? Object.keys(ns.indexed_fields).join(', ') || '(none)'
                : '(none)';

            // Show in output channel for better formatting
            const outputChannel = vscode.window.createOutputChannel('Pinecone Namespace');
            outputChannel.clear();
            outputChannel.appendLine(`Namespace: ${displayName}`);
            outputChannel.appendLine(`Index: ${index.name}`);
            outputChannel.appendLine('');
            outputChannel.appendLine(`Record Count: ${ns.record_count.toLocaleString()} vectors`);
            outputChannel.appendLine('');
            outputChannel.appendLine(`Schema Fields: ${schemaFields}`);
            outputChannel.appendLine(`Indexed Fields: ${indexedFields}`);
            outputChannel.show();

        } catch (e: unknown) {
            const message = getErrorMessage(e);
            vscode.window.showErrorMessage(`Failed to get namespace details: ${message}`);
        }
    }

    /**
     * Deletes a namespace after confirmation.
     * 
     * Warns the user that all vectors in the namespace will be permanently deleted.
     * 
     * @param item - Tree item representing the namespace to delete
     */
    async deleteNamespace(item: PineconeTreeItem): Promise<void> {
        const index = item.metadata?.index as IndexModel | undefined;
        const namespaceName = item.resourceId;
        
        if (!index || namespaceName === undefined) {
            vscode.window.showErrorMessage('Could not determine namespace to delete');
            return;
        }

        // Build project context for API calls (required for JWT auth)
        const projectContext = buildProjectContextFromItem(item);

        const displayName = namespaceName === '__default__' || namespaceName === '' 
            ? '(default)' 
            : namespaceName;

        // Get vector count for warning
        let vectorCount = 0;
        try {
            const namespaceApi = this.pineconeService.getNamespaceApi();
            const apiName = namespaceName === '__default__' || namespaceName === '' 
                ? '__default__' 
                : namespaceName;
            const ns = await namespaceApi.describeNamespace(index.host, apiName, projectContext);
            vectorCount = ns.record_count;
        } catch {
            // Proceed with deletion even if we can't get count
        }

        // Confirm deletion with warning about vector count
        const warningMessage = vectorCount > 0
            ? `Are you sure you want to delete namespace "${displayName}"? This will permanently delete ${vectorCount.toLocaleString()} vectors.`
            : `Are you sure you want to delete namespace "${displayName}"? This action cannot be undone.`;

        const confirmation = await vscode.window.showWarningMessage(
            warningMessage,
            { modal: true },
            'Delete'
        );

        if (confirmation !== 'Delete') { return; }

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Deleting namespace "${displayName}"...`,
                cancellable: false
            }, async () => {
                const namespaceApi = this.pineconeService.getNamespaceApi();
                const apiName = namespaceName === '__default__' || namespaceName === '' 
                    ? '__default__' 
                    : namespaceName;
                await namespaceApi.deleteNamespace(index.host, apiName, projectContext);
            });

            vscode.window.showInformationMessage(`Namespace "${displayName}" deleted successfully`);
            vscode.commands.executeCommand('pinecone.refresh');
        } catch (e: unknown) {
            const message = getErrorMessage(e);
            vscode.window.showErrorMessage(`Failed to delete namespace: ${message}`);
        }
    }
}
