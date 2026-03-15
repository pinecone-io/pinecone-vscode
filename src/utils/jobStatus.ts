import { BackupModel, ImportJob, RestoreJob } from '../api/types';

export interface PaginatedDataResponse<T> {
    data?: T[];
    pagination?: {
        next?: string;
    };
}

const TERMINAL_BACKUP_STATUSES = new Set([
    'ready',
    'failed',
    'canceled',
    'cancelled',
    'deleted'
]);

const TERMINAL_RESTORE_STATUSES = new Set([
    'completed',
    'failed',
    'canceled',
    'cancelled'
]);

const TERMINAL_IMPORT_STATUSES = new Set([
    'completed',
    'failed',
    'canceled',
    'cancelled',
    'succeeded'
]);

export function normalizeJobStatus(status: unknown): string {
    return String(status ?? '').trim().toLowerCase();
}

function isTerminalStatus(status: unknown, terminalStatuses: Set<string>): boolean {
    const normalized = normalizeJobStatus(status);
    if (!normalized) {
        return false;
    }
    return terminalStatuses.has(normalized);
}

export function isActiveBackupStatus(status: unknown): boolean {
    return !isTerminalStatus(status, TERMINAL_BACKUP_STATUSES);
}

export function isActiveRestoreStatus(status: unknown): boolean {
    return !isTerminalStatus(status, TERMINAL_RESTORE_STATUSES);
}

export function isActiveImportStatus(status: unknown): boolean {
    return !isTerminalStatus(status, TERMINAL_IMPORT_STATUSES);
}

export function getActiveBackups(backups: BackupModel[]): BackupModel[] {
    return sortByCreatedAtDesc(
        backups.filter((backup) => isActiveBackupStatus(backup.status))
    );
}

export function getActiveRestoreJobs(
    restoreJobs: RestoreJob[],
    backupIds: Set<string>
): RestoreJob[] {
    return sortByCreatedAtDesc(
        filterRestoreJobsForBackupIds(restoreJobs, backupIds)
            .filter((job) => isActiveRestoreStatus(job.status))
    );
}

export function getActiveImports(imports: ImportJob[]): ImportJob[] {
    return sortByCreatedAtDesc(
        imports.filter((job) => isActiveImportStatus(job.status))
    );
}

export function filterRestoreJobsForBackupIds(
    restoreJobs: RestoreJob[],
    backupIds: Set<string>
): RestoreJob[] {
    return restoreJobs.filter((job) => backupIds.has(job.backup_id));
}

export async function collectPaginatedData<T>(
    fetchPage: (paginationToken?: string) => Promise<PaginatedDataResponse<T>>,
    options?: { maxPages?: number }
): Promise<T[]> {
    const maxPages = options?.maxPages ?? 25;
    const all: T[] = [];
    let nextToken: string | undefined;

    for (let page = 0; page < maxPages; page++) {
        const response = await fetchPage(nextToken);
        if (Array.isArray(response.data)) {
            all.push(...response.data);
        }

        const next = response.pagination?.next;
        if (!next || next === nextToken) {
            break;
        }
        nextToken = next;
    }

    return all;
}

export function sortByCreatedAtDesc<T extends { created_at?: string }>(items: T[]): T[] {
    return [...items].sort((a, b) => {
        const aTime = a.created_at ? Date.parse(a.created_at) : 0;
        const bTime = b.created_at ? Date.parse(b.created_at) : 0;
        return bTime - aTime;
    });
}
