import * as vscode from 'vscode';
import { ProjectContext } from '../api/client';
import { IndexModel } from '../api/types';
import { PineconeService } from '../services/pineconeService';
import { POLLING_CONFIG } from './constants';
import { getReadCapacityTransitionState } from './readCapacity';

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getIndexOperationBlockReason(index: IndexModel): string | undefined {
    const indexState = String(index.status?.state || '').trim();
    const normalizedIndexState = indexState.toLowerCase();

    if (!normalizedIndexState || normalizedIndexState !== 'ready') {
        return `Index state is "${indexState || 'Unknown'}".`;
    }

    const readCapacityTransition = getReadCapacityTransitionState(index);
    if (readCapacityTransition.transitioning) {
        return readCapacityTransition.reason
            || `DRN read capacity status is "${readCapacityTransition.status || 'Updating'}".`;
    }

    return undefined;
}

export async function waitForIndexReadyForOperations(
    pineconeService: PineconeService,
    indexName: string,
    operationLabel: string,
    projectContext?: ProjectContext
): Promise<IndexModel> {
    let lastReason = 'Index is not ready yet.';

    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Checking index readiness for ${operationLabel}...`,
        cancellable: false
    }, async (progress) => {
        const startTime = Date.now();
        while (Date.now() - startTime < POLLING_CONFIG.MAX_WAIT_MS) {
            const index = await pineconeService.getControlPlane().describeIndex(indexName, projectContext);
            const blockReason = getIndexOperationBlockReason(index);
            if (!blockReason) {
                return index;
            }

            lastReason = blockReason;
            const elapsedSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000));
            progress.report({ message: `${blockReason} Retrying... (${elapsedSeconds}s)` });
            await sleep(POLLING_CONFIG.POLL_INTERVAL_MS);
        }

        throw new Error(
            `Index "${indexName}" is not ready for ${operationLabel}. ${lastReason} ` +
            'DRN migration/scaling can take up to 30 minutes.'
        );
    });
}
