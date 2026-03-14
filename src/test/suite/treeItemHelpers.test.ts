import * as assert from 'assert';
import * as vscode from 'vscode';
import { PineconeTreeItem, PineconeItemType } from '../../providers/treeItems';
import {
    buildProjectContextFromItem,
    setProjectContextFromItem
} from '../../utils/treeItemHelpers';
import { Organization, Project } from '../../api/types';

function createProject(overrides?: Partial<Project>): Project {
    return {
        id: 'proj-123',
        name: 'Project 123',
        organization_id: undefined,
        created_at: new Date().toISOString(),
        ...overrides
    };
}

function createOrganization(overrides?: Partial<Organization>): Organization {
    return {
        id: 'org-456',
        name: 'Org 456',
        ...overrides
    };
}

suite('treeItemHelpers Regression Tests', () => {
    test('buildProjectContextFromItem uses metadata.organization.id fallback', () => {
        const project = createProject({ organization_id: undefined });
        const organization = createOrganization({ id: 'org-metadata' });

        const item = new PineconeTreeItem(
            'Database',
            PineconeItemType.DatabaseCategory,
            vscode.TreeItemCollapsibleState.Collapsed,
            project.id,
            project.id,
            { project, organization }
        );

        const context = buildProjectContextFromItem(item);

        assert.deepStrictEqual(context, {
            id: project.id,
            name: project.name,
            organizationId: 'org-metadata'
        });
    });

    test('setProjectContextFromItem sets full context when organization metadata exists', () => {
        const project = createProject({ organization_id: undefined });
        const organization = createOrganization({ id: 'org-metadata' });

        const item = new PineconeTreeItem(
            'Assistant',
            PineconeItemType.AssistantCategory,
            vscode.TreeItemCollapsibleState.Collapsed,
            project.id,
            project.id,
            { project, organization }
        );

        let setProjectIdArg: string | undefined;
        let setFullContextArgs:
            | { projectId: string; projectName: string; organizationId: string }
            | undefined;

        setProjectContextFromItem(item, {
            setProjectId: (id: string | undefined) => {
                setProjectIdArg = id;
            },
            setFullProjectContext: (projectId: string, projectName: string, organizationId: string) => {
                setFullContextArgs = { projectId, projectName, organizationId };
            }
        });

        assert.strictEqual(setProjectIdArg, undefined);
        assert.deepStrictEqual(setFullContextArgs, {
            projectId: 'proj-123',
            projectName: 'Project 123',
            organizationId: 'org-metadata'
        });
    });

    test('setProjectContextFromItem falls back to project-id-only context when metadata is partial', () => {
        const project = createProject({ name: undefined });

        const item = new PineconeTreeItem(
            'Database',
            PineconeItemType.DatabaseCategory,
            vscode.TreeItemCollapsibleState.Collapsed,
            project.id,
            `${project.id}:idx-1`,
            { project }
        );

        let setProjectIdArg: string | undefined;
        let fullContextCalled = false;

        setProjectContextFromItem(item, {
            setProjectId: (id: string | undefined) => {
                setProjectIdArg = id;
            },
            setFullProjectContext: () => {
                fullContextCalled = true;
            }
        });

        assert.strictEqual(setProjectIdArg, 'proj-123');
        assert.strictEqual(fullContextCalled, false);
    });
});
