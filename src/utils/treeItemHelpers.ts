/**
 * Tree Item Helper Utilities
 * 
 * Shared utility functions for working with PineconeTreeItem instances.
 * These helpers extract context information from tree items in a consistent
 * way, avoiding code duplication across command handlers.
 * 
 * ## Composite ID Format
 * 
 * Tree items use composite IDs to encode hierarchical relationships:
 * - Format: `"projectId:resourceName"` or just `"projectId"`
 * - Example: `"proj-123:my-index"` for an index's backup category
 * - Example: `"proj-123"` for a project's Database category
 * 
 * This format allows child items to reference their parent project
 * without needing to traverse the tree structure.
 * 
 * @module utils/treeItemHelpers
 */

import { PineconeTreeItem } from '../providers/treeItems';
import { ProjectContext } from '../api/client';
import { Organization, Project } from '../api/types';

/**
 * Extracts the project ID from a tree item, handling composite IDs.
 * 
 * Tree items may have a composite parentId in the format "projectId:resourceName"
 * (e.g., "proj-123:my-index" for a backup item under an index). This function
 * extracts just the project ID portion.
 * 
 * The function prioritizes metadata over parentId because:
 * 1. Metadata contains the full Project object with all details
 * 2. parentId may be composite and require parsing
 * 3. Metadata is explicitly set during tree construction
 * 
 * @param item - The tree item to extract project ID from
 * @returns The project ID, or undefined if not available
 * 
 * @example
 * ```typescript
 * // For an index item with parentId = "proj-123"
 * extractProjectId(indexItem); // Returns "proj-123"
 * 
 * // For a backup item with parentId = "proj-123:my-index"
 * extractProjectId(backupItem); // Returns "proj-123"
 * 
 * // For an item with project metadata
 * extractProjectId(itemWithMetadata); // Returns metadata.project.id
 * ```
 */
export function extractProjectId(item: PineconeTreeItem): string | undefined {
    // Priority 1: Get from project metadata (most reliable)
    const project = item.metadata?.project as Project | undefined;
    if (project?.id) {
        return project.id;
    }

    // Priority 2: Extract from parentId (may be composite)
    if (item.parentId) {
        // Check for composite format: "projectId:resourceName"
        const colonIndex = item.parentId.indexOf(':');
        if (colonIndex > 0) {
            // Composite ID - extract project ID before the colon
            return item.parentId.substring(0, colonIndex);
        } else {
            // Simple ID - use as-is
            return item.parentId;
        }
    }

    return undefined;
}

/**
 * Extracts the resource name from a composite parent ID.
 * 
 * For composite IDs in the format "projectId:resourceName", this
 * extracts the resourceName portion.
 * 
 * @param parentId - The composite parent ID
 * @returns The resource name portion, or undefined if not composite
 * 
 * @example
 * ```typescript
 * extractResourceFromParentId("proj-123:my-index"); // Returns "my-index"
 * extractResourceFromParentId("proj-123"); // Returns undefined
 * ```
 */
export function extractResourceFromParentId(parentId: string | undefined): string | undefined {
    if (!parentId) {
        return undefined;
    }

    const colonIndex = parentId.indexOf(':');
    if (colonIndex > 0 && colonIndex < parentId.length - 1) {
        return parentId.substring(colonIndex + 1);
    }

    return undefined;
}

/**
 * Builds a full ProjectContext object from a tree item.
 * 
 * ProjectContext is required for API calls when using JWT authentication
 * (OAuth or service account). It contains all the information needed to:
 * 1. Set the X-Project-Id header
 * 2. Create/retrieve managed API keys for data plane operations
 * 
 * This function prioritizes building context from metadata because:
 * - Metadata contains full Project and Organization objects
 * - These objects include the project name and organization ID
 * - All three pieces (id, name, orgId) are needed for managed key auth
 * 
 * @param item - The tree item to extract context from
 * @returns ProjectContext if all required fields are available, undefined otherwise
 * 
 * @example
 * ```typescript
 * const context = buildProjectContextFromItem(indexItem);
 * if (context) {
 *   // Use context for API calls
 *   await api.listBackups(indexName, context);
 * }
 * ```
 */
export function buildProjectContextFromItem(item: PineconeTreeItem): ProjectContext | undefined {
    const project = item.metadata?.project as Project | undefined;
    const organization = item.metadata?.organization as Organization | undefined;

    // Extract project ID (handles composite parentId format)
    const projectId = extractProjectId(item);

    // Get organization ID from multiple possible sources:
    // 1. Organization metadata (if available)
    // 2. Project's organization_id field
    const organizationId = organization?.id || project?.organization_id;

    // All three pieces are required for full project context
    // - id: Used for X-Project-Id header
    // - name: Used for managed API key naming
    // - organizationId: Used for Admin API calls
    if (projectId && project?.name && organizationId) {
        return {
            id: projectId,
            name: project.name,
            organizationId
        };
    }

    return undefined;
}

/**
 * Sets the project context on a PineconeService from a tree item.
 * 
 * This is a convenience function that extracts context from a tree item
 * and sets it on the service. It handles both full context (managed API key auth)
 * and partial context (Bearer token + X-Project-Id header).
 * 
 * @param item - The tree item containing project context
 * @param service - An object with setProjectId and setFullProjectContext methods
 * 
 * @example
 * ```typescript
 * // In a command handler
 * setProjectContextFromItem(item, this.pineconeService);
 * // Now API calls will use the correct project context
 * ```
 */
export function setProjectContextFromItem(
    item: PineconeTreeItem,
    service: {
        setProjectId: (id: string | undefined) => void;
        setFullProjectContext: (projectId: string, projectName: string, organizationId: string) => void;
    }
): void {
    const project = item.metadata?.project as Project | undefined;
    const projectId = extractProjectId(item);
    const organizationId = project?.organization_id;

    if (projectId && project?.name && organizationId) {
        // Full context available - use managed API key authentication
        service.setFullProjectContext(projectId, project.name, organizationId);
    } else if (projectId) {
        // Only project ID available - fall back to Bearer token + X-Project-Id
        service.setProjectId(projectId);
    }
}

/**
 * Builds a unique ID for a tree item by combining parent ID, type, and resource ID.
 * 
 * This ensures tree items have stable, unique identifiers that encode their
 * position in the hierarchy. Unique IDs are important for:
 * 1. Proper expansion/collapse state tracking
 * 2. Avoiding duplicate rendering issues
 * 3. Reliable refresh targeting
 * 
 * @param parentId - The parent item's ID (or undefined for root items)
 * @param itemType - The type of this item
 * @param resourceId - The resource-specific identifier (e.g., index name)
 * @param label - Fallback label if no resourceId
 * @returns A unique identifier string
 * 
 * @example
 * ```typescript
 * buildUniqueId('proj-123', 'index', 'my-index', 'my-index');
 * // Returns "proj-123:index:my-index"
 * 
 * buildUniqueId(undefined, 'database-category', undefined, 'Database');
 * // Returns "database-category:Database"
 * ```
 */
export function buildUniqueId(
    parentId: string | undefined,
    itemType: string,
    resourceId: string | undefined,
    label: string
): string {
    const parts: string[] = [];
    
    if (parentId) {
        parts.push(parentId);
    }
    
    parts.push(itemType);
    parts.push(resourceId || label);
    
    return parts.join(':');
}

/**
 * Checks if a parent ID is in composite format (contains a colon).
 * 
 * @param parentId - The parent ID to check
 * @returns true if the ID is composite format
 */
export function isCompositeId(parentId: string | undefined): boolean {
    return !!parentId && parentId.includes(':');
}
