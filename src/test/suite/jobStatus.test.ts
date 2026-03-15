import * as assert from 'assert';
import { RestoreJob } from '../../api/types';
import {
    collectPaginatedData,
    filterRestoreJobsForBackupIds,
    getActiveImports,
    isActiveBackupStatus,
    isActiveImportStatus,
    isActiveRestoreStatus,
    normalizeJobStatus
} from '../../utils/jobStatus';

suite('Job Status Helpers', () => {
    test('normalizeJobStatus trims and lowercases values', () => {
        assert.strictEqual(normalizeJobStatus('  InProgress  '), 'inprogress');
        assert.strictEqual(normalizeJobStatus(undefined), '');
    });

    test('backup status classification treats terminal statuses as inactive', () => {
        assert.strictEqual(isActiveBackupStatus('Ready'), false);
        assert.strictEqual(isActiveBackupStatus('FAILED'), false);
        assert.strictEqual(isActiveBackupStatus('Initializing'), true);
        assert.strictEqual(isActiveBackupStatus('Queueing'), true);
    });

    test('restore status classification treats terminal statuses as inactive', () => {
        assert.strictEqual(isActiveRestoreStatus('Completed'), false);
        assert.strictEqual(isActiveRestoreStatus('FAILED'), false);
        assert.strictEqual(isActiveRestoreStatus('InProgress'), true);
        assert.strictEqual(isActiveRestoreStatus('Pending'), true);
    });

    test('import status classification treats terminal statuses as inactive', () => {
        assert.strictEqual(isActiveImportStatus('completed'), false);
        assert.strictEqual(isActiveImportStatus('Succeeded'), false);
        assert.strictEqual(isActiveImportStatus('running'), true);
        assert.strictEqual(isActiveImportStatus('queued'), true);
    });

    test('getActiveImports filters terminal jobs and sorts newest first', () => {
        const active = getActiveImports([
            { id: 'imp-1', status: 'running', created_at: '2026-03-14T01:00:00Z' },
            { id: 'imp-2', status: 'completed', created_at: '2026-03-14T03:00:00Z' },
            { id: 'imp-3', status: 'queued', created_at: '2026-03-14T02:00:00Z' }
        ]);

        assert.deepStrictEqual(active.map((job) => job.id), ['imp-3', 'imp-1']);
    });

    test('filterRestoreJobsForBackupIds keeps only jobs for index backups', () => {
        const jobs: RestoreJob[] = [
            {
                restore_job_id: 'rj-1',
                backup_id: 'backup-1',
                target_index_name: 'idx-a',
                target_index_id: 'idx-id-a',
                status: 'InProgress',
                created_at: '2026-03-14T10:00:00Z',
                percent_complete: 20
            },
            {
                restore_job_id: 'rj-2',
                backup_id: 'backup-2',
                target_index_name: 'idx-b',
                target_index_id: 'idx-id-b',
                status: 'InProgress',
                created_at: '2026-03-14T11:00:00Z',
                percent_complete: 40
            }
        ];

        const filtered = filterRestoreJobsForBackupIds(jobs, new Set(['backup-2']));
        assert.strictEqual(filtered.length, 1);
        assert.strictEqual(filtered[0].restore_job_id, 'rj-2');
    });

    test('collectPaginatedData aggregates all pages until pagination ends', async () => {
        const pages = [
            { data: [{ id: 'a' }], pagination: { next: 'token-1' } },
            { data: [{ id: 'b' }], pagination: { next: 'token-2' } },
            { data: [{ id: 'c' }], pagination: {} }
        ];
        let index = 0;

        const result = await collectPaginatedData(async (_token) => {
            const page = pages[index] || { data: [] };
            index += 1;
            return page;
        });

        assert.deepStrictEqual(result, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    });
});
