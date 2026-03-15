import {
    DedicatedReadNodeType,
    IndexModel,
    ServerlessReadCapacity,
    ServerlessSpec
} from '../api/types';

export const DEDICATED_READ_NODE_TYPES: readonly DedicatedReadNodeType[] = ['b1', 't1'];

const DEFAULT_READ_CAPACITY: ServerlessReadCapacity = { mode: 'OnDemand' };

interface ReadCapacityPayload {
    mode?: unknown;
    nodeType?: unknown;
    replicas?: unknown;
    shards?: unknown;
}

export interface ReadCapacitySummary {
    mode: 'OnDemand' | 'Dedicated';
    nodeType?: DedicatedReadNodeType;
    desiredReplicas?: number;
    desiredShards?: number;
    currentReplicas?: number;
    currentShards?: number;
    status?: string;
}

export interface ReadCapacityTransitionState {
    transitioning: boolean;
    status?: string;
    reason?: string;
    phase?: 'Migrating' | 'Scaling' | 'Updating';
}

function parsePositiveInteger(value: unknown): number | undefined {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
        return undefined;
    }
    return parsed;
}

function isDedicatedReadNodeType(value: string): value is DedicatedReadNodeType {
    return (DEDICATED_READ_NODE_TYPES as readonly string[]).includes(value);
}

export function parseReadCapacityPayload(
    payload: unknown,
    options?: { allowDedicated?: boolean }
): { value?: ServerlessReadCapacity; error?: string } {
    const input = (payload && typeof payload === 'object') ? (payload as ReadCapacityPayload) : {};
    const mode = String(input.mode || 'OnDemand');

    if (mode !== 'OnDemand' && mode !== 'Dedicated') {
        return { error: 'Read capacity mode must be OnDemand or Dedicated.' };
    }

    if (mode === 'OnDemand') {
        return { value: { mode: 'OnDemand' } };
    }

    if (options?.allowDedicated === false) {
        return { error: 'Dedicated Read Nodes are only supported for Bring Your Own Vectors indexes in this extension.' };
    }

    const nodeType = String(input.nodeType || '').trim();
    if (!isDedicatedReadNodeType(nodeType)) {
        return { error: `Dedicated read node type must be one of: ${DEDICATED_READ_NODE_TYPES.join(', ')}.` };
    }

    const replicas = parsePositiveInteger(input.replicas);
    if (!replicas) {
        return { error: 'Dedicated read node replicas must be an integer greater than or equal to 1.' };
    }

    const shards = parsePositiveInteger(input.shards);
    if (!shards) {
        return { error: 'Dedicated read node shards must be an integer greater than or equal to 1.' };
    }

    return {
        value: {
            mode: 'Dedicated',
            dedicated: {
                node_type: nodeType,
                scaling: 'Manual',
                manual: {
                    replicas,
                    shards
                }
            }
        }
    };
}

export function normalizeServerlessReadCapacity(spec?: ServerlessSpec): ServerlessReadCapacity {
    const readCapacity = spec?.serverless?.read_capacity;
    if (!readCapacity || readCapacity.mode !== 'Dedicated') {
        return DEFAULT_READ_CAPACITY;
    }

    const dedicated = readCapacity.dedicated;
    if (!dedicated || !isDedicatedReadNodeType(dedicated.node_type)) {
        return DEFAULT_READ_CAPACITY;
    }

    const legacyScaling = (dedicated as unknown as {
        scaling?: {
            replicas?: number;
            shards?: number;
        };
    }).scaling;

    const replicas = parsePositiveInteger(dedicated.manual?.replicas ?? legacyScaling?.replicas);
    const shards = parsePositiveInteger(dedicated.manual?.shards ?? legacyScaling?.shards);
    if (!replicas || !shards) {
        return DEFAULT_READ_CAPACITY;
    }

    return {
        mode: 'Dedicated',
        dedicated: {
            node_type: dedicated.node_type,
            scaling: 'Manual',
            manual: {
                replicas,
                shards
            }
        }
    };
}

export function summarizeReadCapacity(index: IndexModel): ReadCapacitySummary {
    const spec = ('serverless' in index.spec)
        ? normalizeServerlessReadCapacity(index.spec as ServerlessSpec)
        : DEFAULT_READ_CAPACITY;
    const runtime = index.status?.read_capacity;
    const normalizeMode = (value: unknown): 'OnDemand' | 'Dedicated' | undefined => {
        const normalized = String(value ?? '').trim().toLowerCase();
        if (!normalized) {
            return undefined;
        }
        if (normalized.includes('dedicated')) {
            return 'Dedicated';
        }
        if (normalized.includes('ondemand') || normalized.includes('on-demand')) {
            return 'OnDemand';
        }
        return undefined;
    };
    const mode = normalizeMode(runtime?.mode) || normalizeMode(spec.mode) || 'OnDemand';

    if (mode !== 'Dedicated') {
        return {
            mode: 'OnDemand',
            currentReplicas: runtime?.dedicated?.current_replicas ?? runtime?.current_replicas,
            currentShards: runtime?.dedicated?.current_shards ?? runtime?.current_shards,
            status: runtime?.state || runtime?.status
        };
    }

    return {
        mode: 'Dedicated',
        nodeType: spec.dedicated?.node_type,
        desiredReplicas: spec.dedicated?.manual.replicas,
        desiredShards: spec.dedicated?.manual.shards,
        currentReplicas: runtime?.dedicated?.current_replicas ?? runtime?.current_replicas,
        currentShards: runtime?.dedicated?.current_shards ?? runtime?.current_shards,
        status: runtime?.state || runtime?.status
    };
}

function detectTransitionPhase(normalizedStatus: string): ReadCapacityTransitionState['phase'] | undefined {
    if (!normalizedStatus) {
        return undefined;
    }
    if (normalizedStatus.includes('migrat')) {
        return 'Migrating';
    }
    if (normalizedStatus.includes('scal')) {
        return 'Scaling';
    }
    if (
        normalizedStatus.includes('initializ') ||
        normalizedStatus.includes('provision') ||
        normalizedStatus.includes('pending') ||
        normalizedStatus.includes('updat') ||
        normalizedStatus.includes('transition')
    ) {
        return 'Updating';
    }
    return undefined;
}

function isExactReady(value: string): boolean {
    return value.trim().toLowerCase() === 'ready';
}

function isExactDedicatedMode(value: string): boolean {
    return value.trim().toLowerCase() === 'dedicated';
}

function hasDedicatedModeSignal(value: string): boolean {
    return value.trim().toLowerCase().includes('dedicated');
}

function hasOnDemandModeSignal(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return normalized.includes('ondemand') || normalized.includes('on-demand');
}

function collectStringLeaves(value: unknown, depth: number = 0, maxDepth: number = 4): string[] {
    if (depth > maxDepth || value === null || value === undefined) {
        return [];
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? [trimmed] : [];
    }

    if (Array.isArray(value)) {
        return value.flatMap((entry) => collectStringLeaves(entry, depth + 1, maxDepth));
    }

    if (typeof value === 'object') {
        return Object.values(value as Record<string, unknown>)
            .flatMap((entry) => collectStringLeaves(entry, depth + 1, maxDepth));
    }

    return [];
}

export function getReadCapacityTransitionState(index: IndexModel): ReadCapacityTransitionState {
    const summary = summarizeReadCapacity(index);
    const runtime = (index.status?.read_capacity || {}) as Record<string, unknown>;
    const statusCandidates = [
        runtime.state,
        runtime.status,
        index.status?.state
    ].map((value) => String(value ?? '').trim()).filter(Boolean);
    const modeCandidates = [
        runtime.mode,
        runtime.capacity_mode,
        runtime.read_capacity_mode
    ].map((value) => String(value ?? '').trim()).filter(Boolean);

    const combinedStatus = [
        ...statusCandidates,
        ...modeCandidates
    ].join(' | ');
    const runtimeText = collectStringLeaves(runtime).join(' | ');
    const statusText = collectStringLeaves(index.status || {}).join(' | ');
    const allSignalsText = `${combinedStatus} | ${runtimeText} | ${statusText}`.trim();
    const phaseFromStatus = detectTransitionPhase(allSignalsText.toLowerCase());
    const modeSignalCandidates = [
        ...modeCandidates,
        runtime.status,
        runtime.state,
        ...collectStringLeaves(runtime).filter((value) => hasDedicatedModeSignal(value) || hasOnDemandModeSignal(value)),
        ...collectStringLeaves(index.status || {}).filter((value) => hasDedicatedModeSignal(value) || hasOnDemandModeSignal(value))
    ].map((value) => String(value ?? '').trim()).filter(Boolean);
    const hasDedicatedSignal = summary.mode === 'Dedicated'
        || modeSignalCandidates.some((value) => hasDedicatedModeSignal(value))
        || allSignalsText.toLowerCase().includes('dedicated');

    // On-demand indexes without DRN signals should not be considered transitioning.
    if (!hasDedicatedSignal) {
        return { transitioning: false };
    }

    if (phaseFromStatus) {
        return {
            transitioning: true,
            status: combinedStatus,
            phase: phaseFromStatus,
            reason: `DRN read capacity is currently ${phaseFromStatus.toLowerCase()}.`
        };
    }

    const indexState = String(index.status?.state || '').trim();
    if (!isExactReady(indexState)) {
        return {
            transitioning: true,
            status: combinedStatus,
            phase: 'Updating',
            reason: `Index status is "${indexState || 'Unknown'}" (requires Ready).`
        };
    }

    if (modeSignalCandidates.length > 0) {
        const strictDedicated = modeSignalCandidates.some((value) => isExactDedicatedMode(value));
        if (!strictDedicated) {
            return {
                transitioning: true,
                status: combinedStatus,
                phase: detectTransitionPhase(modeSignalCandidates.join(' | ').toLowerCase()) || 'Updating',
                reason: `DRN capacity mode is "${modeSignalCandidates.join(' | ')}" (requires Dedicated).`
            };
        }
    }

    const hasDesiredAndCurrentReplicas = Number.isInteger(summary.desiredReplicas) && Number.isInteger(summary.currentReplicas);
    const hasDesiredAndCurrentShards = Number.isInteger(summary.desiredShards) && Number.isInteger(summary.currentShards);
    const replicasMismatch = hasDesiredAndCurrentReplicas && summary.desiredReplicas !== summary.currentReplicas;
    const shardsMismatch = hasDesiredAndCurrentShards && summary.desiredShards !== summary.currentShards;

    if (replicasMismatch || shardsMismatch) {
        return {
            transitioning: true,
            status: combinedStatus,
            phase: 'Scaling',
            reason: 'DRN read capacity is still converging to the requested replicas/shards.'
        };
    }

    return {
        transitioning: false,
        status: combinedStatus
    };
}
