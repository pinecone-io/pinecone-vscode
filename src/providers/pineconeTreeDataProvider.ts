/**
 * Pinecone Tree Data Provider
 * 
 * Provides data for the Pinecone Explorer tree view in the sidebar.
 * The tree structure varies based on authentication type:
 * 
 * **For OAuth or Service Account (JWT auth):**
 * ```
 * Organization (multiple possible)
 * └── Project (multiple possible)
 *     ├── Database
 *     │   └── indexes...
 *     └── Assistant
 *         └── assistants...
 * ```
 * 
 * **For API Key:**
 * ```
 * Database
 * └── indexes...
 * Assistant
 * └── assistants...
 * ```
 * 
 * API keys are project-scoped, so the Organization/Project levels are skipped.
 * 
 * @module providers/pineconeTreeDataProvider
 */

import * as vscode from 'vscode';
import { PineconeService } from '../services/pineconeService';
import { AuthService } from '../services/authService';
import { PineconeTreeItem, PineconeItemType, isPodIndex } from './treeItems';
import { AssistantModel, IndexModel, BackupModel, Organization, Project } from '../api/types';
import { ProjectContext } from '../api/client';
import { AUTH_CONTEXTS } from '../utils/constants';
import { createComponentLogger } from '../utils/logger';
import { classifyError } from '../utils/errorHandling';
import { getReadCapacityTransitionState, summarizeReadCapacity } from '../utils/readCapacity';
import { isFreeTierPlan } from '../utils/organizationPlan';

/** Logger for tree data provider operations */
const log = createComponentLogger('TreeDataProvider');

/**
 * Provides data for the Pinecone Explorer tree view.
 * 
 * Implements VSCode's TreeDataProvider interface to populate the
 * sidebar with Pinecone resources (organizations, projects, indexes, assistants, files).
 * 
 * The tree hierarchy depends on the authentication method:
 * - JWT auth (OAuth/service account): Organization → Project → Resources
 * - API key auth: Resources directly (API keys are project-scoped)
 * 
 * @example
 * ```typescript
 * const provider = new PineconeTreeDataProvider(pineconeService, authService);
 * vscode.window.registerTreeDataProvider('pineconeExplorer', provider);
 * ```
 */
export class PineconeTreeDataProvider implements vscode.TreeDataProvider<PineconeTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<PineconeTreeItem | undefined | null | void>();
    private readonly staleRecoveryRefreshes = new Set<string>();
    
    /** Event fired when tree data changes and needs refresh */
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    /**
     * Creates a new PineconeTreeDataProvider.
     * 
     * @param pineconeService - Service for Pinecone API calls
     * @param authService - Service for authentication state
     */
    constructor(
        private pineconeService: PineconeService,
        private authService: AuthService
    ) {
        // Automatically refresh tree when authentication state changes
        this.authService.onDidChangeAuth(() => {
            this.refresh();
        });
    }

    /**
     * Triggers a refresh of the tree view.
     * 
     * Fires the onDidChangeTreeData event with undefined to refresh the entire tree.
     * This causes VSCode to re-call getChildren() for all visible items.
     */
    refresh(): void {
        // Fire with undefined to refresh the entire tree
        // This tells VSCode that all tree data may have changed
        this._onDidChangeTreeData.fire(undefined);
    }

    /**
     * Schedules a one-time recovery refresh for stale tree item metadata.
     *
     * Stale IDs can occur when VSCode reuses expanded-state item identities across
     * context changes. We refresh once per stale key to recover without triggering
     * an endless refresh loop.
     */
    private scheduleStaleMetadataRecovery(staleKey: string): void {
        if (this.staleRecoveryRefreshes.has(staleKey)) {
            return;
        }

        this.staleRecoveryRefreshes.add(staleKey);
        setTimeout(() => this.refresh(), 100);
    }

    /**
     * Gets the tree item representation of an element.
     * 
     * @param element - The tree item to get
     * @returns The same element (tree items are self-describing)
     */
    getTreeItem(element: PineconeTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * Handles API errors with user-friendly messages and actions.
     * 
     * **Error Recovery Strategy:**
     * 
     * This method implements a tiered error handling approach:
     * 
     * 1. **Authentication Errors** (401, 403, token expired):
     *    - Show warning message (yellow, less alarming)
     *    - Offer "Login" action button for quick recovery
     *    - Detected via shared classifyError() logic
     * 
     * 2. **Other API Errors** (404, 500, network issues):
     *    - Show error message (red)
     *    - Include the operation name for context
     *    - No action button (user should investigate)
     * 
     * **Design Rationale:**
     * - Auth errors are common (token expiry) and have a clear fix (re-login)
     * - Other errors need investigation; action buttons would be misleading
     * - Messages include just enough detail without overwhelming users
     * - The tree view continues working (returns empty array on error)
     * 
     * @param error - The error that occurred
     * @param operation - Description of the failed operation
     */
    private handleApiError(error: unknown, operation: string): void {
        const classified = classifyError(error);
        
        if (classified.requiresLogin) {
            // Tier 1: Auth errors - offer quick recovery action
            vscode.window.showWarningMessage(
                `Authentication error: ${classified.userMessage}`,
                'Login'
            ).then(selection => {
                if (selection === 'Login') {
                    vscode.commands.executeCommand('pinecone.login');
                }
            });
        } else {
            // Tier 2: Other errors - inform user without action
            vscode.window.showErrorMessage(`Failed to ${operation}: ${classified.userMessage}`);
        }
    }

    /**
     * Gets the children of a tree element.
     * 
     * The tree structure varies based on authentication type and element:
     * 
     * **Root level:**
     * - JWT auth: List of organizations (or single org if only one)
     * - API key: Database and Assistant categories directly
     * 
     * **Organization → Projects**
     * **Project → Database + Assistant categories**
     * **Database category → List of indexes**
     * **Index → Namespaces + Backups (serverless only)**
     * **Assistant category → List of assistants**
     * **Assistant → Files category**
     * **Files category → List of files**
     * 
     * @param element - Parent element, or undefined for root
     * @returns Array of child tree items
     */
    async getChildren(element?: PineconeTreeItem): Promise<PineconeTreeItem[]> {
        // Return empty if not authenticated
        if (!this.authService.isAuthenticated()) {
            return [];
        }

        const authContext = this.authService.getAuthContext();

        // Root level - determine tree structure based on auth type
        if (!element) {
            return this.getRootChildren(authContext);
        }

        // Return children based on element type
        switch (element.itemType) {
            case PineconeItemType.Organization:
                return this.getOrganizationChildren(element);
            case PineconeItemType.Project:
                return this.getProjectChildren(element);
            case PineconeItemType.DatabaseCategory:
                return this.getDatabaseChildren(element);
            case PineconeItemType.Index:
                return this.getIndexChildren(element);
            case PineconeItemType.NamespacesCategory:
                return this.getNamespaceChildren(element);
            case PineconeItemType.BackupsCategory:
                return this.getBackupChildren(element);
            case PineconeItemType.AssistantCategory:
                return this.getAssistantChildren(element);
            case PineconeItemType.Assistant:
                return this.getAssistantFileCategory(element);
            case PineconeItemType.FilesCategory:
                return this.getFileChildren(element);
            default:
                return [];
        }
    }

    /**
     * Gets root-level children based on authentication context.
     * 
     * **For JWT auth (OAuth or service account):**
     * Lists all organizations the user belongs to. Users can be members of
     * multiple organizations, so we show them all.
     * 
     * **For API key auth:**
     * Shows Database and Assistant categories directly since API keys are
     * already scoped to a specific project.
     * 
     * This method uses OperationResult to provide explicit error feedback
     * to users rather than silently showing "No organizations found" on errors.
     */
    private async getRootChildren(authContext: string): Promise<PineconeTreeItem[]> {
        // ─────────────────────────────────────────────────────────────────────
        // API Key Auth: Show resources directly (API keys are project-scoped)
        // ─────────────────────────────────────────────────────────────────────
        if (authContext === AUTH_CONTEXTS.API_KEY) {
            return [
                new PineconeTreeItem(
                    'Database',
                    PineconeItemType.DatabaseCategory,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    undefined,
                    undefined,
                    { isApiKeyAuth: true }
                ),
                new PineconeTreeItem(
                    'Assistant',
                    PineconeItemType.AssistantCategory,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    undefined,
                    undefined,
                    { isApiKeyAuth: true }
                )
            ];
        }

        // ─────────────────────────────────────────────────────────────────────
        // JWT Auth (OAuth/Service Account): List organizations
        // ─────────────────────────────────────────────────────────────────────
        const result = await this.pineconeService.listOrganizations();
        
        // Handle API errors with explicit feedback
        if (!result.success && result.error) {
            // Show error in tree with option to retry
            const errorItem = new PineconeTreeItem(
                `Error: ${this.truncateError(result.error)}`,
                PineconeItemType.Organization,
                vscode.TreeItemCollapsibleState.None,
                undefined,
                undefined,
                { isEmpty: true, isError: true, errorMessage: result.error }
            );
            errorItem.tooltip = `Failed to list organizations: ${result.error}\n\nClick Refresh to retry.`;
            
            // Also show the error via notification for visibility
            this.handleApiError(new Error(result.error), 'list organizations');
            
            return [errorItem];
        }
        
        const organizations = result.data || [];
        
        // Handle empty state
        if (organizations.length === 0) {
            return [
                new PineconeTreeItem(
                    'No organizations found',
                    PineconeItemType.Organization,
                    vscode.TreeItemCollapsibleState.None,
                    undefined,
                    undefined,
                    { isEmpty: true }
                )
            ];
        }

        // Map organizations to tree items
        // Note: Project context is automatically set when user expands a project,
        // so we don't need to visually indicate which org/project is "selected"
        return organizations.map((org: Organization) => {
            return new PineconeTreeItem(
                org.name,
                PineconeItemType.Organization,
                vscode.TreeItemCollapsibleState.Collapsed,
                org.id,
                undefined,
                { organization: org }
            );
        });
    }
    
    /**
     * Truncates long error messages for display in tree items.
     */
    private truncateError(error: string, maxLength: number = 50): string {
        if (error.length <= maxLength) {
            return error;
        }
        return error.substring(0, maxLength) + '...';
    }

    /**
     * Gets children for an Organization node (list of projects).
     * 
     * Lists all projects within the organization. Each project can contain
     * indexes and assistants.
     * 
     * When an organization is expanded, it becomes the "target" organization.
     * This is persisted so the extension remembers the user's selection.
     */
    private async getOrganizationChildren(element: PineconeTreeItem): Promise<PineconeTreeItem[]> {
        const orgId = element.resourceId;
        const org = element.metadata?.organization as Organization | undefined;
        
        if (!orgId) {
            return [];
        }

        // ─────────────────────────────────────────────────────────────────────
        // Persist organization selection when user expands an organization
        // This allows the extension to remember which org the user is working with
        // ─────────────────────────────────────────────────────────────────────
        if (org && !element.metadata?.isEmpty) {
            this.pineconeService.setTargetOrganization({ id: org.id, name: org.name });

            // OAuth tokens are organization-scoped. Switch token scope before
            // listing projects so non-default organizations populate correctly.
            if (this.authService.getAuthContext() === AUTH_CONTEXTS.USER_TOKEN) {
                const switched = await this.authService.switchOrganization(org.id);
                if (!switched) {
                    log.warn(`Could not switch auth scope to organization "${org.id}". Project list may be empty for this org.`);
                }
            }
        }

        // ─────────────────────────────────────────────────────────────────────
        // Fetch projects from API
        // ─────────────────────────────────────────────────────────────────────
        const result = await this.pineconeService.listProjects(orgId);
        
        // Handle API errors with explicit feedback
        if (!result.success && result.error) {
            const errorItem = new PineconeTreeItem(
                `Error: ${this.truncateError(result.error)}`,
                PineconeItemType.Project,
                vscode.TreeItemCollapsibleState.None,
                undefined,
                orgId,
                { isEmpty: true, isError: true, errorMessage: result.error, organization: org }
            );
            errorItem.tooltip = `Failed to list projects: ${result.error}\n\nClick Refresh to retry.`;
            
            this.handleApiError(new Error(result.error), 'list projects');
            return [errorItem];
        }
        
        const projects = result.data || [];
        
        // Handle empty state
        if (projects.length === 0) {
            return [
                new PineconeTreeItem(
                    'No projects',
                    PineconeItemType.Project,
                    vscode.TreeItemCollapsibleState.None,
                    undefined,
                    orgId,
                    { isEmpty: true, organization: org }
                )
            ];
        }

        // Map projects to tree items
        // Note: Project context is automatically set when user expands a project,
        // so we don't need to visually indicate which project is "selected"
        return projects.map((p: Project) => {
            return new PineconeTreeItem(
                p.name,
                PineconeItemType.Project,
                vscode.TreeItemCollapsibleState.Collapsed,
                p.id,
                orgId,
                { project: p, organization: org }
            );
        });
    }

    /**
     * Gets children for a project node (Database and Assistant categories).
     * 
     * NOTE: This method does NOT set shared/global project context.
     * Instead, project context is passed directly to each API call to avoid
     * race conditions when multiple project nodes are expanded concurrently.
     * 
     * The organization metadata is passed to child items so they can build
     * the full project context (id, name, organizationId) for API calls.
     */
    private getProjectChildren(element: PineconeTreeItem): PineconeTreeItem[] {
        const projectId = element.resourceId;
        const project = element.metadata?.project as Project | undefined;
        const organization = element.metadata?.organization as Organization | undefined;

        // Persist the active project context for toolbar/dialog workflows (e.g. Inference Toolbox).
        if (project && organization && !element.metadata?.isEmpty) {
            this.pineconeService.setTargetOrganization({ id: organization.id, name: organization.name });
            this.pineconeService.setTargetProject({ id: project.id, name: project.name });
        }
        
        // Pass both project and organization to child items so they can build
        // the full project context for API calls
        return [
            new PineconeTreeItem(
                'Database',
                PineconeItemType.DatabaseCategory,
                vscode.TreeItemCollapsibleState.Collapsed,
                undefined,
                projectId,
                { project, organization }
            ),
            new PineconeTreeItem(
                'Assistant',
                PineconeItemType.AssistantCategory,
                vscode.TreeItemCollapsibleState.Collapsed,
                undefined,
                projectId,
                { project, organization }
            )
        ];
    }

    /**
     * Gets index children for the Database category.
     * 
     * Ensures the project context is set before listing indexes.
     * Distinguishes between serverless and pod-based indexes:
     * - Serverless indexes are collapsible (can show namespaces)
     * - Pod-based indexes are not collapsible and have limited functionality
     * 
     * Index items include project metadata in their metadata object, which allows
     * index commands to set the full project context for proper API authentication.
     */
    private async getDatabaseChildren(element: PineconeTreeItem): Promise<PineconeTreeItem[]> {
        const projectId = element.parentId;
        const project = element.metadata?.project as Project | undefined;
        const organization = element.metadata?.organization as Organization | undefined;

        // Build full project context for API call to avoid race conditions
        // when multiple Database nodes are expanded simultaneously during refresh
        const projectContext: ProjectContext | undefined = (projectId && project && organization)
            ? { id: projectId, name: project.name, organizationId: organization.id }
            : undefined;

        try {
            const indexes = await this.pineconeService.listIndexes(projectContext);

            const serverlessIndexNames = indexes
                .filter((idx) => !isPodIndex(idx))
                .map((idx) => idx.name);

            const runtimeByIndexName = new Map<string, IndexModel>();
            const describeFailedByIndexName = new Set<string>();
            if (serverlessIndexNames.length > 0) {
                const described = await Promise.all(
                    serverlessIndexNames.map(async (indexName) => {
                        try {
                            return await this.pineconeService.getControlPlane().describeIndex(indexName, projectContext);
                        } catch {
                            describeFailedByIndexName.add(indexName);
                            log.warn(`Failed to describe serverless index "${indexName}" for runtime readiness; using conservative DRN fallback state.`);
                            return undefined;
                        }
                    })
                );
                for (const describedIndex of described) {
                    if (describedIndex?.name) {
                        runtimeByIndexName.set(describedIndex.name, describedIndex);
                    }
                }
            }
            
            if (indexes.length === 0) {
                return [
                    new PineconeTreeItem(
                        'No indexes',
                        PineconeItemType.Index,
                        vscode.TreeItemCollapsibleState.None,
                        undefined,
                        projectId,
                        { isEmpty: true, project }
                    )
                ];
            }
            
            return indexes.map((listedIndex) => {
                const idx = runtimeByIndexName.get(listedIndex.name) || listedIndex;
                const isPod = isPodIndex(idx);
                const state = idx.status?.state?.toLowerCase() || '';
                const isReady = state === 'ready';
                const isTerminating = state === 'terminating';
                const readCapacity = summarizeReadCapacity(idx);
                const listedReadCapacity = summarizeReadCapacity(listedIndex);
                const describeFailed = describeFailedByIndexName.has(listedIndex.name);
                const detectedReadCapacityTransition = getReadCapacityTransitionState(idx);
                const readCapacityTransition = (
                    !detectedReadCapacityTransition.transitioning
                    && describeFailed
                    && listedReadCapacity.mode === 'Dedicated'
                )
                    ? {
                        transitioning: true,
                        phase: 'Updating' as const,
                        status: 'DescribeFailed',
                        reason: 'Unable to verify DRN runtime status yet. Actions are disabled until status can be confirmed.'
                    }
                    : detectedReadCapacityTransition;
                const isReadCapacityTransitioning = readCapacityTransition.transitioning;
                const isInitializing = (!isReady && !isTerminating && !isPod) || isReadCapacityTransitioning;

                let itemType = PineconeItemType.Index;
                if (isPod) {
                    itemType = PineconeItemType.PodIndex;
                } else if (isInitializing || isTerminating) {
                    itemType = PineconeItemType.InitializingIndex;
                }

                // Serverless indexes can expand to show namespaces
                // Initializing/terminating indexes cannot be expanded
                const collapsibleState = (isPod || isInitializing || isTerminating)
                    ? vscode.TreeItemCollapsibleState.None 
                    : vscode.TreeItemCollapsibleState.Collapsed;
                
                // Format label based on status
                let label = idx.name;
                if (isPod) {
                    label += ' (pod)';
                } else if (isTerminating) {
                    label = `${idx.name} (Deleting)`;
                } else if (isInitializing) {
                    label = isReadCapacityTransitioning
                        ? `${idx.name} (DRN ${readCapacityTransition.phase || 'Updating'})`
                        : `${idx.name} (Initializing)`;
                } else {
                    if (readCapacity.mode === 'Dedicated') {
                        label = `${idx.name} (DRN)`;
                    }
                }

                // Include project and organization in metadata so index commands and
                // child operations can build full project context for API authentication
                const item = new PineconeTreeItem(
                    label,
                    itemType,
                    collapsibleState,
                    idx.name,
                    projectId,
                    { index: idx, project, organization }
                );
                
                // Add tooltip based on status
                if (isPod) {
                    item.tooltip = 'Legacy pod-based index - Query and Delete only';
                } else if (isTerminating) {
                    item.tooltip = 'Index is being deleted. It will disappear from the list shortly.';
                } else if (isInitializing) {
                    if (isReadCapacityTransitioning) {
                        item.tooltip = [
                            `DRN status: ${readCapacityTransition.status || 'Updating'}`,
                            readCapacityTransition.reason || 'Dedicated read capacity is still converging.',
                            'Actions are disabled until DRN migration/scaling completes.'
                        ].join('\n');
                    } else {
                        item.tooltip = `Index is initializing (State: ${idx.status?.state || 'Unknown'}). Actions disabled until Ready.`;
                    }
                } else {
                    // Safe access for serverless spec properties
                    const cloud = 'serverless' in idx.spec ? idx.spec.serverless.cloud : 'Unknown';
                    const region = 'serverless' in idx.spec ? idx.spec.serverless.region : 'Unknown';
                    const readCapacityText = readCapacity.mode === 'Dedicated'
                        ? `Dedicated (${[
                            readCapacity.nodeType || 'unknown',
                            (readCapacity.desiredReplicas && readCapacity.desiredShards)
                                ? `desired ${readCapacity.desiredReplicas}r/${readCapacity.desiredShards}s`
                                : undefined
                        ].filter(Boolean).join('; ')})`
                        : 'OnDemand';
                    item.tooltip = `Serverless Index (${cloud} - ${region})\nRead Capacity: ${readCapacityText}`;
                }
                
                return item;
            });
        } catch (e: unknown) {
            this.handleApiError(e, 'list indexes');
            return [];
        }
    }

    /**
     * Gets children for a serverless index (Namespaces and Backups categories).
     * 
     * Serverless indexes show both Namespaces and Backups as child categories.
     * Pod-based indexes do not expand (limited functionality).
     * 
     * Note: We create a composite parentId (projectId:indexName) to ensure
     * unique tree item IDs across different projects with same-named indexes.
     */
    private getIndexChildren(element: PineconeTreeItem): PineconeTreeItem[] {
        const index = element.metadata?.index as IndexModel | undefined;
        const project = element.metadata?.project as Project | undefined;
        const organization = element.metadata?.organization as Organization | undefined;
        if (!index) {
            return [];
        }

        // Only serverless indexes show child categories
        if (isPodIndex(index)) {
            return [];
        }

        // Create composite parentId to ensure unique IDs across projects
        // Format: projectId:indexName (or just indexName if no projectId)
        const compositeParentId = element.parentId 
            ? `${element.parentId}:${index.name}` 
            : index.name;

        const items: PineconeTreeItem[] = [
            new PineconeTreeItem(
                'Namespaces',
                PineconeItemType.NamespacesCategory,
                vscode.TreeItemCollapsibleState.Collapsed,
                index.name,
                compositeParentId,
                { index, project, organization }
            )
        ];

        if (!isFreeTierPlan(organization?.plan)) {
            items.push(
                new PineconeTreeItem(
                    'Backups',
                    PineconeItemType.BackupsCategory,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    index.name,
                    compositeParentId,
                    { index, project, organization }
                )
            );
        }

        return items;
    }

    /**
     * Gets namespace children for the Namespaces category.
     * 
     * Uses the composite parentId from the parent element to ensure unique
     * tree item IDs across different projects with same-named indexes.
     * 
     * Validates that metadata.index matches the expected index name
     * to prevent using the wrong host due to tree item ID mismatches.
     */
    private async getNamespaceChildren(element: PineconeTreeItem): Promise<PineconeTreeItem[]> {
        const index = element.metadata?.index as IndexModel | undefined;
        const indexName = element.resourceId;
        const project = element.metadata?.project as Project | undefined;
        const organization = element.metadata?.organization as Organization | undefined;
        // parentId is already composite (projectId:indexName) from getIndexChildren
        const compositeParentId = element.parentId;
        
        if (!index || !indexName) {
            return [];
        }
        // Validate that metadata matches the expected index
        // This prevents using the wrong host if VSCode passes a stale/wrong element
        if (index.name !== indexName) {
            log.warn(`Metadata mismatch: expected index "${indexName}" but got "${index.name}". Scheduling one-time recovery refresh.`);
            this.scheduleStaleMetadataRecovery(`namespace:${compositeParentId ?? 'none'}:${indexName}`);
            return [];
        }

        // Build full project context for API call to avoid race conditions
        // Extract project ID from composite parentId (format: "projectId:indexName")
        let projectId: string | undefined;
        if (compositeParentId) {
            const colonIndex = compositeParentId.indexOf(':');
            projectId = colonIndex > 0 ? compositeParentId.substring(0, colonIndex) : undefined;
        }
        
        const projectContext: ProjectContext | undefined = (projectId && project && organization)
            ? { id: projectId, name: project.name, organizationId: organization.id }
            : undefined;

        try {
            const namespaceApi = this.pineconeService.getNamespaceApi();
            const response = await namespaceApi.listNamespaces(index.host, undefined, projectContext);
            
            if (response.namespaces.length === 0) {
                return [
                    new PineconeTreeItem(
                        'No namespaces',
                        PineconeItemType.Namespace,
                        vscode.TreeItemCollapsibleState.None,
                        undefined,
                        compositeParentId,
                        { isEmpty: true }
                    )
                ];
            }
            
            return response.namespaces.map(ns => {
                // Format the label to show vector count
                const vectorCount = ns.record_count.toLocaleString();
                const label = ns.name === '' 
                    ? `(default) (${vectorCount} vectors)` 
                    : `${ns.name} (${vectorCount} vectors)`;
                
                return new PineconeTreeItem(
                    label,
                    PineconeItemType.Namespace,
                    vscode.TreeItemCollapsibleState.None,
                    ns.name || '__default__',
                    compositeParentId,
                    { index, namespace: ns }
                );
            });
        } catch (e: unknown) {
            this.handleApiError(e, 'list namespaces');
            return [];
        }
    }

    /**
     * Gets backup children for the Backups category.
     * 
     * Lists all backups for the specified index. Each backup shows its name,
     * status, and record count for easy identification.
     * 
     * Uses the composite parentId from the parent element to ensure unique
     * tree item IDs across different projects with same-named indexes.
     * 
     * Validates that metadata.index matches the expected index name
     * to prevent using wrong data due to tree item ID mismatches.
     */
    private async getBackupChildren(element: PineconeTreeItem): Promise<PineconeTreeItem[]> {
        const index = element.metadata?.index as IndexModel | undefined;
        const indexName = element.resourceId;
        const project = element.metadata?.project as Project | undefined;
        const organization = element.metadata?.organization as Organization | undefined;
        // parentId is already composite (projectId:indexName) from getIndexChildren
        const compositeParentId = element.parentId;
        
        if (!index || !indexName) {
            return [];
        }
        if (isFreeTierPlan(organization?.plan)) {
            return [];
        }

        // Validate that metadata matches the expected index
        // This prevents using wrong data if VSCode passes a stale/wrong element
        if (index.name !== indexName) {
            log.warn(`Metadata mismatch: expected index "${indexName}" but got "${index.name}". Scheduling one-time recovery refresh.`);
            this.scheduleStaleMetadataRecovery(`backup:${compositeParentId ?? 'none'}:${indexName}`);
            return [];
        }

        try {
            // Build full project context for API call to avoid race conditions
            // Extract project ID from composite parentId (format: "projectId:indexName")
            let projectId: string | undefined;
            if (compositeParentId) {
                const colonIndex = compositeParentId.indexOf(':');
                projectId = colonIndex > 0 ? compositeParentId.substring(0, colonIndex) : undefined;
            }
            
            const projectContext: ProjectContext | undefined = (projectId && project && organization)
                ? { id: projectId, name: project.name, organizationId: organization.id }
                : undefined;
            
            const backups = await this.pineconeService.getControlPlane().listBackups(indexName, projectContext);
            
            if (backups.length === 0) {
                return [
                    new PineconeTreeItem(
                        'No backups',
                        PineconeItemType.Backup,
                        vscode.TreeItemCollapsibleState.None,
                        undefined,
                        compositeParentId,
                        { index, isEmpty: true }
                    )
                ];
            }
            
            return backups.map((backup: BackupModel) => {
                // Use backup name if available, otherwise truncate backup_id for display
                const displayName = backup.name || backup.backup_id.substring(0, 8);
                // record_count may be null/undefined while backup is still being created
                // Use loose equality (!=) to check for both null and undefined
                // eslint-disable-next-line eqeqeq
                const recordCount = backup.record_count != null 
                    ? backup.record_count.toLocaleString() 
                    : '...';
                const statusIcon = this.getBackupStatusIcon(backup.status);
                const label = `${statusIcon} ${displayName} (${recordCount} records)`;
                
                const item = new PineconeTreeItem(
                    label,
                    PineconeItemType.Backup,
                    vscode.TreeItemCollapsibleState.None,
                    backup.backup_id,  // Use backup_id as the resourceId
                    compositeParentId,
                    { index, backup, project, organization }
                );
                
                item.tooltip = this.formatBackupTooltip(backup);
                
                return item;
            });
        } catch (e: unknown) {
            this.handleApiError(e, 'list backups');
            return [];
        }
    }

    /**
     * Gets a status icon for backup display.
     */
    private getBackupStatusIcon(status: string): string {
        switch (status.toLowerCase()) {
            case 'ready':
                return '✓';
            case 'creating':
            case 'in_progress':
                return '⟳';
            case 'failed':
                return '✗';
            default:
                return '○';
        }
    }

    /**
     * Formats a detailed tooltip for a backup item.
     * Handles null/undefined values for backups that are still being created.
     * 
     * Note: Uses loose equality (!=) to check for both null and undefined,
     * which is the standard pattern for optional numeric fields.
     */
    private formatBackupTooltip(backup: BackupModel): string {
        /* eslint-disable eqeqeq */
        const sizeMB = backup.size_bytes != null 
            ? (backup.size_bytes / (1024 * 1024)).toFixed(2) 
            : '...';
        const recordCount = backup.record_count != null 
            ? backup.record_count.toLocaleString() 
            : '...';
        const namespaceCount = backup.namespace_count != null 
            ? backup.namespace_count.toString() 
            : '...';
        const dimension = backup.dimension != null 
            ? backup.dimension.toString() 
            : '...';
        /* eslint-enable eqeqeq */
        
        const lines: string[] = [
            `Backup: ${backup.name || backup.backup_id}`,
            `ID: ${backup.backup_id}`,
            `Status: ${backup.status}`,
            `Source Index: ${backup.source_index_name}`,
            `Dimension: ${dimension}`,
            `Records: ${recordCount}`,
            `Namespaces: ${namespaceCount}`,
            `Size: ${sizeMB} MB`,
            `Created: ${new Date(backup.created_at).toLocaleString()}`,
        ];
        
        if (backup.description) {
            lines.push(`Description: ${backup.description}`);
        }
        
        return lines.join('\n');
    }

    /**
     * Gets assistant children for the Assistant category.
     * 
     * Passes project ID directly to the API call to avoid race conditions
     * when multiple Assistant nodes are expanded simultaneously during refresh.
     */
    private async getAssistantChildren(element: PineconeTreeItem): Promise<PineconeTreeItem[]> {
        const projectId = element.parentId;
        const project = element.metadata?.project as Project | undefined;
        const organization = element.metadata?.organization as Organization | undefined;

        // Build full project context for API call to avoid race conditions
        // when multiple Assistant nodes are expanded simultaneously during refresh
        const projectContext: ProjectContext | undefined = (projectId && project && organization)
            ? { id: projectId, name: project.name, organizationId: organization.id }
            : undefined;

        try {
            const assistants = await this.pineconeService.listAssistants(projectContext);
            
            if (assistants.length === 0) {
                return [
                    new PineconeTreeItem(
                        'No assistants',
                        PineconeItemType.Assistant,
                        vscode.TreeItemCollapsibleState.None,
                        undefined,
                        projectId,
                        { isEmpty: true }
                    )
                ];
            }
            
            // Include project and organization in metadata so file operations
            // can build full project context for API authentication
            return assistants.map(asst => new PineconeTreeItem(
                asst.name,
                PineconeItemType.Assistant,
                vscode.TreeItemCollapsibleState.Collapsed,
                asst.name,
                projectId,
                { assistant: asst, project, organization }
            ));
        } catch (e: unknown) {
            this.handleApiError(e, 'list assistants');
            return [];
        }
    }

    /**
     * Gets the Files category for an assistant.
     * 
     * Creates a composite parentId (projectId:assistantName) to ensure unique
     * tree item IDs across different projects with same-named assistants.
     */
    private getAssistantFileCategory(element: PineconeTreeItem): PineconeTreeItem[] {
        // Create composite parentId to ensure unique IDs across projects
        // element.parentId is the projectId, element.resourceId is the assistant name
        const compositeParentId = element.parentId 
            ? `${element.parentId}:${element.resourceId}` 
            : element.resourceId;
        
        return [
            new PineconeTreeItem(
                'Files', 
                PineconeItemType.FilesCategory, 
                vscode.TreeItemCollapsibleState.Collapsed, 
                element.resourceId,  // Keep assistant name as resourceId for API calls
                compositeParentId,
                element.metadata
            )
        ];
    }

    /**
     * Gets file children for the Files category.
     * 
     * Uses the composite parentId from the parent element to ensure unique
     * tree item IDs across different projects with same-named assistants.
     * 
     * Validates that metadata.assistant matches the expected assistant name
     * to prevent using the wrong host due to tree item ID mismatches.
     */
    private async getFileChildren(element: PineconeTreeItem): Promise<PineconeTreeItem[]> {
        const assistantName = element.resourceId;
        const assistant = element.metadata?.assistant as AssistantModel | undefined;
        const project = element.metadata?.project as Project | undefined;
        const organization = element.metadata?.organization as Organization | undefined;
        // parentId is already composite (projectId:assistantName) from getAssistantFileCategory
        const compositeParentId = element.parentId;
        
        if (!assistantName || !assistant) {
            return [];
        }

        // Validate that metadata matches the expected assistant
        // This prevents using the wrong host if VSCode passes a stale/wrong element
        if (assistant.name !== assistantName) {
            log.warn(`Metadata mismatch: expected assistant "${assistantName}" but got "${assistant.name}". Scheduling one-time recovery refresh.`);
            this.scheduleStaleMetadataRecovery(`files:${compositeParentId ?? 'none'}:${assistantName}`);
            return [];
        }

        // Build full project context for API call to avoid race conditions
        // Extract project ID from composite parentId (format: "projectId:assistantName")
        let projectId: string | undefined;
        if (compositeParentId) {
            const colonIndex = compositeParentId.indexOf(':');
            projectId = colonIndex > 0 ? compositeParentId.substring(0, colonIndex) : undefined;
        }
        
        const projectContext: ProjectContext | undefined = (projectId && project && organization)
            ? { id: projectId, name: project.name, organizationId: organization.id }
            : undefined;

        try {
            const files = await this.pineconeService.getAssistantApi().listFiles(assistant.host, assistantName, projectContext);
            
            if (files.length === 0) {
                return [
                    new PineconeTreeItem(
                        'No files',
                        PineconeItemType.File,
                        vscode.TreeItemCollapsibleState.None,
                        undefined,
                        compositeParentId,
                        { isEmpty: true }
                    )
                ];
            }
            
            // Include project and organization in metadata so file commands
            // can build full project context for API authentication
            return files.map(f => new PineconeTreeItem(
                f.name,
                PineconeItemType.File,
                vscode.TreeItemCollapsibleState.None,
                f.id,
                compositeParentId,
                { file: f, assistant, project, organization }
            ));
        } catch (e: unknown) {
            this.handleApiError(e, 'list files');
            return [];
        }
    }
}
