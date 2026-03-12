/**
 * Shared explorer refresh utilities.
 */

import * as vscode from 'vscode';
import { POLLING_CONFIG } from './constants';
import { createComponentLogger } from './logger';

const log = createComponentLogger('RefreshExplorer');

interface RefreshTarget {
    refresh: () => void;
}

export interface RefreshExplorerOptions {
    treeDataProvider?: RefreshTarget;
    delayMs?: number;
    focusExplorer?: boolean;
}

let pendingTimer: NodeJS.Timeout | undefined;
let pendingResolvers: Array<() => void> = [];

/**
 * Refreshes the Pinecone explorer through a single shared sequence.
 *
 * Calls are debounced so bursts of refresh requests coalesce into one update.
 */
export function refreshExplorer(options: RefreshExplorerOptions = {}): Promise<void> {
    const delayMs = options.delayMs ?? POLLING_CONFIG.REFRESH_DELAY_MS;
    const focusExplorer = options.focusExplorer ?? true;

    if (pendingTimer) {
        clearTimeout(pendingTimer);
    }

    return new Promise((resolve) => {
        pendingResolvers.push(resolve);

        pendingTimer = setTimeout(async () => {
            pendingTimer = undefined;

            try {
                try {
                    options.treeDataProvider?.refresh();
                } catch (error: unknown) {
                    log.warn('Tree data provider refresh failed:', error);
                }

                try {
                    await vscode.commands.executeCommand('pinecone.refresh');
                    if (focusExplorer) {
                        await vscode.commands.executeCommand('pineconeExplorer.focus');
                    }
                } catch (error: unknown) {
                    log.warn('Explorer command refresh failed:', error);
                }
            } finally {
                const resolvers = pendingResolvers;
                pendingResolvers = [];
                resolvers.forEach((r) => r());
            }
        }, delayMs);
    });
}
