/**
 * Tree View Items
 * 
 * Defines the tree item types and classes used in the Pinecone Explorer
 * tree view. Each item type maps to a specific context value used for
 * menu visibility conditions.
 */

import * as vscode from 'vscode';
import { IndexModel, AssistantModel, NamespaceDescription, Organization, Project } from '../api/types';

/**
 * Types of items that can appear in the Pinecone tree view.
 * 
 * These values are used as `contextValue` for tree items, enabling
 * conditional menu visibility via `when` clauses in package.json.
 * 
 * Note: The extension is designed for serverless indexes. Pod-based indexes
 * have limited functionality (Query and Delete only) and use a separate
 * item type for menu restriction.
 */
export enum PineconeItemType {
    /** Organization container (service account only) */
    Organization = 'organization',
    /** Project container */
    Project = 'project',
    /** Database/Index category container */
    DatabaseCategory = 'database-category',
    /** Assistant category container */
    AssistantCategory = 'assistant-category',
    /** Serverless index (full functionality) */
    Index = 'index',
    /** Index that is currently initializing (limited functionality) */
    InitializingIndex = 'initializing-index',
    /** Legacy pod-based index (Query and Delete only) */
    PodIndex = 'pod-index',
    /** Namespaces category under a serverless index */
    NamespacesCategory = 'namespaces-category',
    /** Individual namespace within an index */
    Namespace = 'namespace',
    /** Backups category under a serverless index */
    BackupsCategory = 'backups-category',
    /** Individual backup of an index */
    Backup = 'backup',
    /** Individual assistant */
    Assistant = 'assistant',
    /** Files category under an assistant */
    FilesCategory = 'files-category',
    /** Individual file in an assistant */
    File = 'file'
}

/**
 * Metadata structure for tree items.
 * Contains the full API model for the resource when applicable.
 */
export interface TreeItemMetadata {
    /** Organization model for organization tree items */
    organization?: Organization;
    /** Project model for project tree items */
    project?: Project;
    /** Index model for index tree items */
    index?: IndexModel;
    /** Assistant model for assistant/file tree items */
    assistant?: AssistantModel;
    /** File ID for file tree items */
    fileId?: string;
    /** Namespace description for namespace tree items */
    namespace?: NamespaceDescription;
    /** 
     * Backup model for backup tree items.
     * Field names match the Pinecone API response format (e.g., `backup_id` not `id`).
     * @see https://docs.pinecone.io/reference/api/2025-10/control-plane/list_index_backups
     */
    backup?: {
        backup_id: string;
        name: string;
        source_index_name: string;
        source_index_id: string;
        description?: string;
        status: string;
        cloud: string;
        region: string;
        dimension: number;
        metric: string;
        record_count: number;
        namespace_count: number;
        size_bytes: number;
        created_at: string;
    };
    /** Flag indicating this item is a placeholder for empty state */
    isEmpty?: boolean;
    /** Flag indicating API key authentication (project-scoped) */
    isApiKeyAuth?: boolean;
    /** Flag indicating this item represents an error state */
    isError?: boolean;
    /** Error message when isError is true */
    errorMessage?: string;
    /** Flag indicating this item is the currently selected/active one */
    isSelected?: boolean;
    /** Additional custom data */
    [key: string]: unknown;
}

/**
 * Tree item representing a Pinecone resource in the explorer.
 * 
 * Extends VSCode's TreeItem with additional metadata for resource
 * identification and context menu support.
 * 
 * @example
 * ```typescript
 * // Create an index tree item
 * const indexItem = new PineconeTreeItem(
 *   'my-index',
 *   PineconeItemType.Index,
 *   vscode.TreeItemCollapsibleState.None,
 *   'my-index',
 *   undefined,
 *   { index: indexModel }
 * );
 * ```
 */
export class PineconeTreeItem extends vscode.TreeItem {
    /**
     * Creates a new PineconeTreeItem.
     * 
     * @param label - Display label for the tree item
     * @param itemType - Type of Pinecone resource
     * @param collapsibleState - Whether the item can be expanded
     * @param resourceId - Unique identifier for the resource (e.g., index name)
     * @param parentId - ID of the parent resource (for hierarchical items)
     * @param metadata - Additional data about the resource (e.g., full API model)
     */
    constructor(
        public readonly label: string,
        public readonly itemType: PineconeItemType,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly resourceId?: string,
        public readonly parentId?: string,
        public readonly metadata?: TreeItemMetadata
    ) {
        super(label, collapsibleState);
        this.contextValue = itemType;
        
        // Set a unique ID to preserve expanded state across refreshes.
        // VSCode uses this ID to track which items are expanded.
        // Format: {parentId}/{itemType}/{resourceId or label}
        // This ensures uniqueness even when labels repeat (e.g., "Database" under different projects)
        this.id = this.buildUniqueId();
        
        this.setIcon();
    }

    /**
     * Builds a unique identifier for this tree item.
     * Used by VSCode to preserve expanded state across refreshes.
     */
    private buildUniqueId(): string {
        const parts: string[] = [];
        if (this.parentId) {
            parts.push(this.parentId);
        }
        parts.push(this.itemType);
        parts.push(this.resourceId || this.label);
        return parts.join('/');
    }

    /**
     * Sets the icon for the tree item based on its type.
     * Uses VSCode's built-in Codicon icons.
     */
    private setIcon(): void {
        const iconMap: Record<PineconeItemType, string> = {
            [PineconeItemType.Organization]: 'organization',
            [PineconeItemType.Project]: 'project',
            [PineconeItemType.DatabaseCategory]: 'database',
            [PineconeItemType.AssistantCategory]: 'robot',
            [PineconeItemType.Index]: 'table',
            [PineconeItemType.InitializingIndex]: 'sync~spin', // Spinner for initializing indexes
            [PineconeItemType.PodIndex]: 'archive',  // Different icon for legacy pod indexes
            [PineconeItemType.NamespacesCategory]: 'layers',
            [PineconeItemType.Namespace]: 'symbol-namespace',
            [PineconeItemType.BackupsCategory]: 'history',
            [PineconeItemType.Backup]: 'cloud-download',
            [PineconeItemType.Assistant]: 'comment-discussion',
            [PineconeItemType.FilesCategory]: 'folder',
            [PineconeItemType.File]: 'file'
        };
        
        this.iconPath = new vscode.ThemeIcon(iconMap[this.itemType]);
    }
}

/**
 * Helper function to determine if an index is pod-based.
 * 
 * Pod-based indexes have limited functionality in this extension
 * (Query and Delete only). This function is used to select the
 * appropriate item type for tree rendering.
 * 
 * @param index - The index model to check
 * @returns true if the index is pod-based, false if serverless
 */
export function isPodIndex(index: IndexModel): boolean {
    return 'pod' in index.spec;
}
