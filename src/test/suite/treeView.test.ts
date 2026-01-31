/**
 * Tree View Tests
 * 
 * Unit tests for the tree view items and data provider.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { PineconeTreeItem, PineconeItemType, TreeItemMetadata } from '../../providers/treeItems';
import { IndexModel, AssistantModel } from '../../api/types';

suite('PineconeItemType Test Suite', () => {
    
    test('should have all expected item types', () => {
        // Organization and project hierarchy
        assert.strictEqual(PineconeItemType.Organization, 'organization');
        assert.strictEqual(PineconeItemType.Project, 'project');
        
        // Category containers
        assert.strictEqual(PineconeItemType.DatabaseCategory, 'database-category');
        assert.strictEqual(PineconeItemType.AssistantCategory, 'assistant-category');
        assert.strictEqual(PineconeItemType.NamespacesCategory, 'namespaces-category');
        assert.strictEqual(PineconeItemType.BackupsCategory, 'backups-category');
        assert.strictEqual(PineconeItemType.FilesCategory, 'files-category');
        
        // Resource items
        assert.strictEqual(PineconeItemType.Index, 'index');
        assert.strictEqual(PineconeItemType.PodIndex, 'pod-index');
        assert.strictEqual(PineconeItemType.Namespace, 'namespace');
        assert.strictEqual(PineconeItemType.Backup, 'backup');
        assert.strictEqual(PineconeItemType.Assistant, 'assistant');
        assert.strictEqual(PineconeItemType.File, 'file');
    });

    test('should have unique context values', () => {
        const values = Object.values(PineconeItemType);
        const uniqueValues = new Set(values);
        assert.strictEqual(values.length, uniqueValues.size, 'All item types should have unique context values');
    });
});

suite('PineconeTreeItem Test Suite', () => {
    
    test('should create item with basic properties', () => {
        const item = new PineconeTreeItem(
            'Test Item',
            PineconeItemType.Index,
            vscode.TreeItemCollapsibleState.None
        );

        assert.strictEqual(item.label, 'Test Item');
        assert.strictEqual(item.itemType, PineconeItemType.Index);
        assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.None);
        assert.strictEqual(item.contextValue, 'index');
    });

    test('should create item with resource ID', () => {
        const item = new PineconeTreeItem(
            'my-index',
            PineconeItemType.Index,
            vscode.TreeItemCollapsibleState.None,
            'my-index'
        );

        assert.strictEqual(item.resourceId, 'my-index');
    });

    test('should create item with parent ID', () => {
        const item = new PineconeTreeItem(
            'my-file.pdf',
            PineconeItemType.File,
            vscode.TreeItemCollapsibleState.None,
            'file-123',
            'my-assistant'
        );

        assert.strictEqual(item.resourceId, 'file-123');
        assert.strictEqual(item.parentId, 'my-assistant');
    });

    test('should create item with metadata', () => {
        const indexModel: IndexModel = {
            name: 'test-index',
            dimension: 1536,
            metric: 'cosine',
            host: 'test.pinecone.io',
            status: { ready: true, state: 'Ready' },
            spec: { serverless: { cloud: 'aws', region: 'us-east-1' } },
            deletion_protection: 'disabled'
        };

        const metadata: TreeItemMetadata = { index: indexModel };
        
        const item = new PineconeTreeItem(
            'test-index',
            PineconeItemType.Index,
            vscode.TreeItemCollapsibleState.None,
            'test-index',
            undefined,
            metadata
        );

        assert.ok(item.metadata);
        assert.ok(item.metadata.index);
        assert.strictEqual(item.metadata.index.name, 'test-index');
        assert.strictEqual(item.metadata.index.host, 'test.pinecone.io');
    });

    test('should set icon for database category', () => {
        const item = new PineconeTreeItem(
            'Database',
            PineconeItemType.DatabaseCategory,
            vscode.TreeItemCollapsibleState.Expanded
        );

        assert.ok(item.iconPath instanceof vscode.ThemeIcon);
    });

    test('should set icon for assistant category', () => {
        const item = new PineconeTreeItem(
            'Assistant',
            PineconeItemType.AssistantCategory,
            vscode.TreeItemCollapsibleState.Expanded
        );

        assert.ok(item.iconPath instanceof vscode.ThemeIcon);
    });

    test('should create expandable category items', () => {
        const databaseCategory = new PineconeTreeItem(
            'Database',
            PineconeItemType.DatabaseCategory,
            vscode.TreeItemCollapsibleState.Expanded
        );

        const assistantCategory = new PineconeTreeItem(
            'Assistant',
            PineconeItemType.AssistantCategory,
            vscode.TreeItemCollapsibleState.Expanded
        );

        assert.strictEqual(databaseCategory.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
        assert.strictEqual(assistantCategory.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
    });

    test('should create non-expandable leaf items', () => {
        const indexItem = new PineconeTreeItem(
            'my-index',
            PineconeItemType.Index,
            vscode.TreeItemCollapsibleState.None
        );

        const fileItem = new PineconeTreeItem(
            'document.pdf',
            PineconeItemType.File,
            vscode.TreeItemCollapsibleState.None
        );

        assert.strictEqual(indexItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
        assert.strictEqual(fileItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
    });
});

suite('TreeItemMetadata Test Suite', () => {
    
    test('should support index metadata', () => {
        const indexModel: IndexModel = {
            name: 'test',
            dimension: 384,
            metric: 'euclidean',
            host: 'host.pinecone.io',
            status: { ready: true, state: 'Ready' },
            spec: { serverless: { cloud: 'gcp', region: 'us-central1' } },
            deletion_protection: 'enabled'
        };

        const metadata: TreeItemMetadata = { index: indexModel };
        
        assert.strictEqual(metadata.index?.name, 'test');
        assert.strictEqual(metadata.index?.dimension, 384);
    });

    test('should support assistant metadata', () => {
        const assistantModel: AssistantModel = {
            name: 'test-assistant',
            status: 'Ready',
            host: 'assistant.pinecone.io',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z'
        };

        const metadata: TreeItemMetadata = { assistant: assistantModel };
        
        assert.strictEqual(metadata.assistant?.name, 'test-assistant');
        assert.strictEqual(metadata.assistant?.status, 'Ready');
    });

    test('should support backup metadata', () => {
        // Backup model matches Pinecone API response format
        // Note: API returns backup_id, not id
        const backupModel = {
            backup_id: 'backup-123',
            name: 'my-backup',
            source_index_name: 'test-index',
            source_index_id: 'idx-456',
            status: 'Ready',
            cloud: 'aws',
            region: 'us-east-1',
            dimension: 1536,
            metric: 'cosine',
            record_count: 10000,
            namespace_count: 3,
            size_bytes: 5242880,
            created_at: '2024-01-15T12:00:00Z'
        };

        const metadata: TreeItemMetadata = { backup: backupModel };
        
        assert.strictEqual(metadata.backup?.backup_id, 'backup-123');
        assert.strictEqual(metadata.backup?.name, 'my-backup');
        assert.strictEqual(metadata.backup?.status, 'Ready');
        assert.strictEqual(metadata.backup?.record_count, 10000);
    });

    test('should support custom properties', () => {
        const metadata: TreeItemMetadata = {
            customProperty: 'custom value',
            numberProperty: 42
        };

        assert.strictEqual(metadata.customProperty, 'custom value');
        assert.strictEqual(metadata.numberProperty, 42);
    });
});

suite('Backup Tree Item Tests', () => {

    test('should create backups category item', () => {
        const item = new PineconeTreeItem(
            'Backups',
            PineconeItemType.BackupsCategory,
            vscode.TreeItemCollapsibleState.Collapsed,
            'test-index',
            undefined,
            {}
        );

        assert.strictEqual(item.label, 'Backups');
        assert.strictEqual(item.itemType, PineconeItemType.BackupsCategory);
        assert.strictEqual(item.contextValue, 'backups-category');
        assert.strictEqual(item.resourceId, 'test-index');
        assert.ok(item.iconPath instanceof vscode.ThemeIcon);
    });

    test('should create backup item with metadata', () => {
        // Backup model matches Pinecone API response format
        const backupModel = {
            backup_id: 'bkp-abc123',
            name: 'daily-backup',
            source_index_name: 'production-index',
            source_index_id: 'idx-prod-123',
            status: 'Ready',
            cloud: 'aws',
            region: 'us-west-2',
            dimension: 1536,
            metric: 'cosine',
            record_count: 50000,
            namespace_count: 5,
            size_bytes: 26214400,
            created_at: '2024-01-20T08:00:00Z'
        };

        const item = new PineconeTreeItem(
            '✓ daily-backup (50,000 records)',
            PineconeItemType.Backup,
            vscode.TreeItemCollapsibleState.None,
            'bkp-abc123',
            'production-index',
            { backup: backupModel }
        );

        assert.strictEqual(item.label, '✓ daily-backup (50,000 records)');
        assert.strictEqual(item.itemType, PineconeItemType.Backup);
        assert.strictEqual(item.contextValue, 'backup');
        assert.strictEqual(item.resourceId, 'bkp-abc123');
        assert.strictEqual(item.parentId, 'production-index');
        assert.ok(item.metadata?.backup);
        assert.strictEqual(item.metadata?.backup?.record_count, 50000);
    });

    test('should create namespaces category item', () => {
        const item = new PineconeTreeItem(
            'Namespaces',
            PineconeItemType.NamespacesCategory,
            vscode.TreeItemCollapsibleState.Collapsed,
            'test-index'
        );

        assert.strictEqual(item.label, 'Namespaces');
        assert.strictEqual(item.itemType, PineconeItemType.NamespacesCategory);
        assert.strictEqual(item.contextValue, 'namespaces-category');
    });

    test('should create namespace item', () => {
        const item = new PineconeTreeItem(
            'my-namespace (1,000 vectors)',
            PineconeItemType.Namespace,
            vscode.TreeItemCollapsibleState.None,
            'my-namespace',
            'test-index'
        );

        assert.strictEqual(item.itemType, PineconeItemType.Namespace);
        assert.strictEqual(item.contextValue, 'namespace');
        assert.strictEqual(item.resourceId, 'my-namespace');
        assert.strictEqual(item.parentId, 'test-index');
    });

    test('should create pod index item with limited functionality indicator', () => {
        const podIndex: IndexModel = {
            name: 'legacy-pod-index',
            dimension: 768,
            metric: 'dotproduct',
            host: 'pod-index.pinecone.io',
            status: { ready: true, state: 'Ready' },
            spec: { 
                pod: { 
                    environment: 'us-west1-gcp', 
                    pod_type: 'p1.x1', 
                    pods: 1, 
                    replicas: 1, 
                    shards: 1 
                } 
            },
            deletion_protection: 'disabled'
        };

        const item = new PineconeTreeItem(
            'legacy-pod-index (pod)',
            PineconeItemType.PodIndex,
            vscode.TreeItemCollapsibleState.None,
            'legacy-pod-index',
            undefined,
            { index: podIndex }
        );

        assert.strictEqual(item.itemType, PineconeItemType.PodIndex);
        assert.strictEqual(item.contextValue, 'pod-index');
        // Pod indexes should not be expandable (no children)
        assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.None);
    });
});
