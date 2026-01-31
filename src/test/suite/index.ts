/**
 * Test Suite Index
 * 
 * Entry point for the VSCode extension test runner.
 * This file is required by the VSCode test infrastructure to discover
 * and run all test files in the suite.
 */

import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

/**
 * Runs the test suite.
 * 
 * @returns Promise that resolves when all tests complete
 */
export async function run(): Promise<void> {
    // Create the mocha test runner
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 30000
    });

    const testsRoot = path.resolve(__dirname, '.');

    // Find all test files
    const files = await glob('**/*.test.js', { cwd: testsRoot });

    // Add files to the test suite
    files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

    // Run the mocha test
    return new Promise((resolve, reject) => {
        try {
            mocha.run((failures: number) => {
                if (failures > 0) {
                    reject(new Error(`${failures} tests failed.`));
                } else {
                    resolve();
                }
            });
        } catch (err) {
            reject(err);
        }
    });
}
