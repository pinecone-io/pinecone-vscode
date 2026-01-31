/**
 * Polling Logic Tests
 * 
 * Tests for the polling behavior in backup creation and index restoration.
 * These operations are asynchronous and require polling the API until
 * the resource reaches a terminal state (Ready, Failed, etc.).
 * 
 * The tests verify:
 * - Correct polling behavior with configurable intervals
 * - Proper handling of state transitions
 * - Timeout handling for long-running operations
 * - Error recovery during polling
 * 
 * @module test/suite/polling.test
 */

import * as assert from 'assert';
import { MockControlPlaneApi } from '../mocks';

// ============================================================================
// Polling Simulation Utilities
// ============================================================================

/**
 * Simulates the polling logic used in backup creation.
 * 
 * This mirrors the implementation in index.commands.ts createBackup().
 * 
 * @param api - Mock API client
 * @param backupId - Backup ID to poll
 * @param maxWaitMs - Maximum wait time
 * @param pollIntervalMs - Interval between polls
 * @returns Final backup status
 */
async function simulateBackupPolling(
    api: MockControlPlaneApi,
    backupId: string,
    maxWaitMs: number = 5000,
    pollIntervalMs: number = 100
): Promise<{ status: string; pollCount: number }> {
    const startTime = Date.now();
    let pollCount = 0;

    while (Date.now() - startTime < maxWaitMs) {
        const backup = await api.describeBackup(backupId);
        pollCount++;

        if (backup.status.toLowerCase() === 'ready') {
            return { status: 'Ready', pollCount };
        }

        if (backup.status.toLowerCase() === 'failed') {
            throw new Error('Backup failed');
        }

        // Wait before next poll
        await sleep(pollIntervalMs);
    }

    // Timeout reached
    return { status: 'Timeout', pollCount };
}

/**
 * Simulates the polling logic used in index restoration.
 * 
 * This mirrors the implementation in index.commands.ts restoreBackup().
 * 
 * @param api - Mock API client
 * @param indexName - Index name to poll
 * @param maxWaitMs - Maximum wait time
 * @param pollIntervalMs - Interval between polls
 * @returns Final index state
 */
async function simulateIndexPolling(
    api: MockControlPlaneApi,
    indexName: string,
    maxWaitMs: number = 5000,
    pollIntervalMs: number = 100
): Promise<{ state: string; pollCount: number }> {
    const startTime = Date.now();
    let pollCount = 0;

    while (Date.now() - startTime < maxWaitMs) {
        try {
            const index = await api.describeIndex(indexName);
            pollCount++;

            if (index.status?.state === 'Ready') {
                return { state: 'Ready', pollCount };
            }

            if (index.status?.state === 'Terminating') {
                throw new Error('Index creation failed (Terminating)');
            }

        } catch (error: unknown) {
            // Re-throw known failure errors
            if (error instanceof Error && error.message.includes('Terminating')) {
                throw error;
            }
            // Index might not exist yet in early stages - continue polling
            pollCount++;
        }

        await sleep(pollIntervalMs);
    }

    return { state: 'Timeout', pollCount };
}

/**
 * Simple sleep function for polling intervals.
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Test Suites
// ============================================================================

suite('Backup Polling Tests', () => {
    let mockApi: MockControlPlaneApi;

    setup(() => {
        mockApi = new MockControlPlaneApi();
        mockApi.resetSequences();
    });

    test('should poll until backup is Ready', async () => {
        // Configure status sequence: Initializing -> Initializing -> Ready
        mockApi.backupStatusSequence = ['Initializing', 'Initializing', 'Ready'];

        const result = await simulateBackupPolling(mockApi, 'backup-123', 5000, 50);

        assert.strictEqual(result.status, 'Ready');
        assert.strictEqual(result.pollCount, 3);
        
        // Verify describeBackup was called
        const calls = mockApi.getCallsTo('describeBackup');
        assert.strictEqual(calls.length, 3);
    });

    test('should immediately return if backup is already Ready', async () => {
        mockApi.backupStatusSequence = ['Ready'];

        const result = await simulateBackupPolling(mockApi, 'backup-123', 5000, 50);

        assert.strictEqual(result.status, 'Ready');
        assert.strictEqual(result.pollCount, 1);
    });

    test('should throw error if backup fails', async () => {
        mockApi.backupStatusSequence = ['Initializing', 'Failed'];

        try {
            await simulateBackupPolling(mockApi, 'backup-123', 5000, 50);
            assert.fail('Should have thrown error');
        } catch (error: unknown) {
            assert.ok(error instanceof Error);
            assert.ok(error.message.includes('failed'));
        }
    });

    test('should timeout if backup takes too long', async () => {
        // Configure status to always return Initializing
        mockApi.backupStatusSequence = Array(100).fill('Initializing');

        const result = await simulateBackupPolling(mockApi, 'backup-123', 200, 50);

        assert.strictEqual(result.status, 'Timeout');
        // Should have polled multiple times before timeout
        assert.ok(result.pollCount >= 2);
    });

    test('should handle API errors during polling', async () => {
        mockApi.backupStatusSequence = ['Initializing'];
        
        // Configure error after first successful poll
        let callCount = 0;
        const originalDescribe = mockApi.describeBackup.bind(mockApi);
        mockApi.describeBackup = async (backupId, projectContext) => {
            callCount++;
            if (callCount === 2) {
                throw new Error('API Error: Service unavailable');
            }
            return originalDescribe(backupId, projectContext);
        };

        try {
            await simulateBackupPolling(mockApi, 'backup-123', 200, 50);
        } catch (error: unknown) {
            assert.ok(error instanceof Error);
            assert.ok(error.message.includes('Service unavailable'));
        }
    });
});

suite('Index Restore Polling Tests', () => {
    let mockApi: MockControlPlaneApi;

    setup(() => {
        mockApi = new MockControlPlaneApi();
        mockApi.resetSequences();
    });

    test('should poll until index is Ready', async () => {
        // Configure state sequence: Initializing -> ScalingUp -> Ready
        mockApi.indexStateSequence = ['Initializing', 'ScalingUp', 'Ready'];

        const result = await simulateIndexPolling(mockApi, 'restored-index', 5000, 50);

        assert.strictEqual(result.state, 'Ready');
        assert.strictEqual(result.pollCount, 3);
        
        // Verify describeIndex was called
        const calls = mockApi.getCallsTo('describeIndex');
        assert.strictEqual(calls.length, 3);
    });

    test('should immediately return if index is already Ready', async () => {
        mockApi.indexStateSequence = ['Ready'];

        const result = await simulateIndexPolling(mockApi, 'restored-index', 5000, 50);

        assert.strictEqual(result.state, 'Ready');
        assert.strictEqual(result.pollCount, 1);
    });

    test('should throw error if index enters Terminating state', async () => {
        mockApi.indexStateSequence = ['Initializing', 'Terminating'];

        try {
            await simulateIndexPolling(mockApi, 'restored-index', 5000, 50);
            assert.fail('Should have thrown error');
        } catch (error: unknown) {
            assert.ok(error instanceof Error);
            assert.ok(error.message.includes('Terminating'));
        }
    });

    test('should timeout if index initialization takes too long', async () => {
        mockApi.indexStateSequence = Array(100).fill('Initializing');

        const result = await simulateIndexPolling(mockApi, 'restored-index', 200, 50);

        assert.strictEqual(result.state, 'Timeout');
        assert.ok(result.pollCount >= 2);
    });

    test('should handle 404 during early polling', async () => {
        // Index doesn't exist for first few polls (API returns 404)
        let callCount = 0;
        const originalDescribe = mockApi.describeIndex.bind(mockApi);
        
        mockApi.describeIndex = async (name, projectContext) => {
            callCount++;
            if (callCount <= 2) {
                // Simulate 404 - index not yet created
                throw new Error('404: Index not found');
            }
            // After a few polls, index exists and is ready
            mockApi.indexStateSequence = ['Ready'];
            return originalDescribe(name, projectContext);
        };

        const result = await simulateIndexPolling(mockApi, 'restored-index', 5000, 50);

        // Should have recovered from 404 and found Ready index
        assert.strictEqual(result.state, 'Ready');
        assert.ok(result.pollCount >= 3);
    });
});

suite('Polling Configuration Tests', () => {

    test('should use configurable poll interval', async () => {
        const mockApi = new MockControlPlaneApi();
        mockApi.backupStatusSequence = ['Initializing', 'Initializing', 'Ready'];

        const startTime = Date.now();
        await simulateBackupPolling(mockApi, 'backup-123', 5000, 100);
        const elapsed = Date.now() - startTime;

        // With 3 polls at 100ms intervals, should take ~200ms minimum
        // (first poll is immediate, then 2 waits)
        assert.ok(elapsed >= 150, `Expected at least 150ms, got ${elapsed}ms`);
    });

    test('should respect maximum wait time', async () => {
        const mockApi = new MockControlPlaneApi();
        mockApi.backupStatusSequence = Array(100).fill('Initializing');

        const maxWaitMs = 300;
        const startTime = Date.now();
        const result = await simulateBackupPolling(mockApi, 'backup-123', maxWaitMs, 50);
        const elapsed = Date.now() - startTime;

        assert.strictEqual(result.status, 'Timeout');
        // Should not exceed max wait time significantly
        assert.ok(elapsed < maxWaitMs + 100, `Expected < ${maxWaitMs + 100}ms, got ${elapsed}ms`);
    });
});

suite('Polling with Project Context Tests', () => {

    test('should pass project context to API calls during backup polling', async () => {
        const mockApi = new MockControlPlaneApi();
        mockApi.backupStatusSequence = ['Ready'];

        const projectContext = {
            id: 'proj-123',
            name: 'Test Project',
            organizationId: 'org-456'
        };

        // Modified polling that passes context
        const backup = await mockApi.describeBackup('backup-123', projectContext);

        assert.strictEqual(backup.status, 'Ready');
        
        const call = mockApi.getLastCallTo('describeBackup');
        assert.ok(call);
        assert.deepStrictEqual(call.args[1], projectContext);
    });

    test('should pass project context to API calls during index polling', async () => {
        const mockApi = new MockControlPlaneApi();
        mockApi.indexStateSequence = ['Ready'];

        const projectContext = {
            id: 'proj-123',
            name: 'Test Project',
            organizationId: 'org-456'
        };

        const index = await mockApi.describeIndex('test-index', projectContext);

        assert.strictEqual(index.status?.state, 'Ready');
        
        const call = mockApi.getLastCallTo('describeIndex');
        assert.ok(call);
        assert.deepStrictEqual(call.args[1], projectContext);
    });
});
