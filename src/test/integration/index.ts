/**
 * Integration Test Suite Runner
 * 
 * Entry point for integration tests that require real API access.
 * These tests are skipped in CI environments unless credentials are configured.
 * 
 * ## Environment Variables
 * 
 * Integration tests require the following environment variables:
 * 
 * - `PINECONE_API_KEY`: API key for Pinecone (required)
 * - `PINECONE_INTEGRATION_TESTS`: Set to 'true' to enable (optional)
 * 
 * If `PINECONE_API_KEY` is not set, all integration tests are skipped.
 * 
 * ## Running Integration Tests
 * 
 * ```bash
 * # Set credentials
 * export PINECONE_API_KEY=your-api-key
 * export PINECONE_INTEGRATION_TESTS=true
 * 
 * # Run tests
 * npm test
 * ```
 * 
 * ## CI Configuration
 * 
 * In CI pipelines, integration tests should be run separately:
 * 
 * ```yaml
 * - name: Run integration tests
 *   env:
 *     PINECONE_API_KEY: ${{ secrets.PINECONE_API_KEY }}
 *     PINECONE_INTEGRATION_TESTS: true
 *   run: npm test
 * ```
 * 
 * @module test/integration
 */

import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

/**
 * Checks if integration tests should be run.
 * 
 * Tests are only run if:
 * 1. PINECONE_API_KEY is set, AND
 * 2. PINECONE_INTEGRATION_TESTS is 'true' (optional safety gate)
 */
export function shouldRunIntegrationTests(): boolean {
    const hasApiKey = !!process.env.PINECONE_API_KEY;
    const isEnabled = process.env.PINECONE_INTEGRATION_TESTS === 'true';
    
    // API key is required; the enable flag is an optional safety gate
    // In development, you might have an API key set but not want to run
    // integration tests every time
    return hasApiKey && (isEnabled || process.env.NODE_ENV === 'integration');
}

/**
 * Returns a message explaining why integration tests are skipped.
 */
export function getSkipReason(): string {
    if (!process.env.PINECONE_API_KEY) {
        return 'PINECONE_API_KEY environment variable is not set';
    }
    if (process.env.PINECONE_INTEGRATION_TESTS !== 'true') {
        return 'PINECONE_INTEGRATION_TESTS environment variable is not set to "true"';
    }
    return 'Unknown reason';
}

/**
 * Runs the integration test suite.
 * 
 * @returns Promise that resolves when all tests complete
 */
export async function run(): Promise<void> {
    // Check if we should run integration tests
    if (!shouldRunIntegrationTests()) {
        console.log(`\nSkipping integration tests: ${getSkipReason()}`);
        console.log('To run integration tests:');
        console.log('  export PINECONE_API_KEY=your-api-key');
        console.log('  export PINECONE_INTEGRATION_TESTS=true\n');
        return;
    }

    console.log('\nRunning integration tests with real API access...\n');

    // Create the mocha test runner with longer timeout for API calls
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 120000 // 2 minutes for slow API operations
    });

    const testsRoot = path.resolve(__dirname, '.');

    // Find all integration test files
    const files = await glob('**/*.integration.test.js', { cwd: testsRoot });

    // Add files to the test suite
    files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

    // Run the mocha test
    return new Promise((resolve, reject) => {
        try {
            mocha.run((failures: number) => {
                if (failures > 0) {
                    reject(new Error(`${failures} integration tests failed.`));
                } else {
                    resolve();
                }
            });
        } catch (err) {
            reject(err);
        }
    });
}
