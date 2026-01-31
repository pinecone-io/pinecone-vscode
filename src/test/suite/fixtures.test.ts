/**
 * Fixture-Based Tests
 * 
 * Tests that use fixture files for realistic data scenarios.
 * Demonstrates parameterized testing patterns for the Pinecone VSCode extension.
 * 
 * Fixture files are stored in /test-fixtures/ and contain sample API responses.
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';

// ============================================================================
// Fixture Loader Utility
// ============================================================================

/**
 * Loads a JSON fixture file from the test-fixtures directory.
 * 
 * @param name - Fixture filename (e.g., 'index-list.json')
 * @returns Parsed JSON content
 */
function loadFixture<T>(name: string): T {
    const fixturesPath = path.join(__dirname, '..', '..', '..', 'test-fixtures');
    const filePath = path.join(fixturesPath, name);
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content) as T;
}

// ============================================================================
// Fixture Types (matching fixture file structure)
// ============================================================================

interface IndexListFixture {
    indexes: Array<{
        name: string;
        dimension: number;
        metric: string;
        host: string;
        status: { ready: boolean; state: string };
        spec?: {
            serverless?: { cloud: string; region: string };
            pod?: { environment: string; pod_type: string; pods: number };
        };
        deletion_protection?: string;
        tags?: Record<string, string>;
    }>;
}

interface QueryResponseFixture {
    matches: Array<{
        id: string;
        score: number;
        values?: number[];
        metadata?: Record<string, unknown>;
    }>;
    namespace: string;
    usage?: { read_units: number };
}

interface AssistantListFixture {
    assistants: Array<{
        name: string;
        status: string;
        host: string;
        instructions?: string;
        metadata?: Record<string, string>;
    }>;
}

interface NamespaceListFixture {
    namespaces: Array<{
        name: string;
        record_count: number;
    }>;
}

// ============================================================================
// Parameterized Test Patterns
// ============================================================================

/**
 * Test case definition for parameterized tests.
 */
interface TestCase<TInput, TExpected> {
    name: string;
    input: TInput;
    expected: TExpected;
}

// ============================================================================
// Test Suites
// ============================================================================

suite('Fixture-Based Tests', () => {

    suite('Index List Fixture', () => {
        let indexList: IndexListFixture;

        setup(() => {
            indexList = loadFixture<IndexListFixture>('index-list.json');
        });

        test('should load fixture with multiple indexes', () => {
            assert.ok(indexList.indexes);
            assert.strictEqual(indexList.indexes.length, 3);
        });

        test('should contain serverless and pod indexes', () => {
            const serverlessIndexes = indexList.indexes.filter(i => i.spec?.serverless);
            const podIndexes = indexList.indexes.filter(i => i.spec?.pod);
            
            assert.strictEqual(serverlessIndexes.length, 2);
            assert.strictEqual(podIndexes.length, 1);
        });

        // Parameterized test: Index validation
        const indexValidationCases: Array<TestCase<number, { hasName: boolean; hasDimension: boolean }>> = [
            { name: 'production-index', input: 0, expected: { hasName: true, hasDimension: true } },
            { name: 'staging-index', input: 1, expected: { hasName: true, hasDimension: true } },
            { name: 'pod-index', input: 2, expected: { hasName: true, hasDimension: true } },
        ];

        for (const testCase of indexValidationCases) {
            test(`should validate ${testCase.name}`, () => {
                const index = indexList.indexes[testCase.input];
                assert.strictEqual(!!index.name, testCase.expected.hasName);
                assert.strictEqual(!!index.dimension, testCase.expected.hasDimension);
            });
        }

        // Parameterized test: Index types
        const indexTypeCases: Array<TestCase<string, 'serverless' | 'pod'>> = [
            { name: 'production-index', input: 'production-index', expected: 'serverless' },
            { name: 'staging-index', input: 'staging-index', expected: 'serverless' },
            { name: 'pod-index', input: 'pod-index', expected: 'pod' },
        ];

        for (const testCase of indexTypeCases) {
            test(`${testCase.name} should be ${testCase.expected}`, () => {
                const index = indexList.indexes.find(i => i.name === testCase.input);
                assert.ok(index);
                
                if (testCase.expected === 'serverless') {
                    assert.ok(index.spec?.serverless);
                    assert.ok(!index.spec?.pod);
                } else {
                    assert.ok(index.spec?.pod);
                    assert.ok(!index.spec?.serverless);
                }
            });
        }

        // Parameterized test: Dimension values
        const dimensionCases: Array<TestCase<string, number>> = [
            { name: 'production-index dimension', input: 'production-index', expected: 1536 },
            { name: 'staging-index dimension', input: 'staging-index', expected: 768 },
            { name: 'pod-index dimension', input: 'pod-index', expected: 256 },
        ];

        for (const testCase of dimensionCases) {
            test(testCase.name, () => {
                const index = indexList.indexes.find(i => i.name === testCase.input);
                assert.strictEqual(index?.dimension, testCase.expected);
            });
        }
    });

    suite('Query Response Fixture', () => {
        let queryResponse: QueryResponseFixture;

        setup(() => {
            queryResponse = loadFixture<QueryResponseFixture>('query-response.json');
        });

        test('should load fixture with matches', () => {
            assert.ok(queryResponse.matches);
            assert.strictEqual(queryResponse.matches.length, 3);
        });

        test('should have descending scores', () => {
            const scores = queryResponse.matches.map(m => m.score);
            for (let i = 1; i < scores.length; i++) {
                assert.ok(scores[i - 1] >= scores[i], 'Scores should be in descending order');
            }
        });

        // Parameterized test: Match validation
        const matchCases: Array<TestCase<number, { hasId: boolean; hasScore: boolean; hasMetadata: boolean }>> = [
            { name: 'match 1', input: 0, expected: { hasId: true, hasScore: true, hasMetadata: true } },
            { name: 'match 2', input: 1, expected: { hasId: true, hasScore: true, hasMetadata: true } },
            { name: 'match 3', input: 2, expected: { hasId: true, hasScore: true, hasMetadata: true } },
        ];

        for (const testCase of matchCases) {
            test(`should validate ${testCase.name}`, () => {
                const match = queryResponse.matches[testCase.input];
                assert.strictEqual(!!match.id, testCase.expected.hasId);
                assert.strictEqual(typeof match.score === 'number', testCase.expected.hasScore);
                assert.strictEqual(!!match.metadata, testCase.expected.hasMetadata);
            });
        }

        // Parameterized test: Score ranges
        const scoreCases: Array<TestCase<number, { min: number; max: number }>> = [
            { name: 'first match score', input: 0, expected: { min: 0.9, max: 1.0 } },
            { name: 'second match score', input: 1, expected: { min: 0.8, max: 0.9 } },
            { name: 'third match score', input: 2, expected: { min: 0.7, max: 0.9 } },
        ];

        for (const testCase of scoreCases) {
            test(`${testCase.name} should be in range`, () => {
                const score = queryResponse.matches[testCase.input].score;
                assert.ok(score >= testCase.expected.min, `Score ${score} should be >= ${testCase.expected.min}`);
                assert.ok(score <= testCase.expected.max, `Score ${score} should be <= ${testCase.expected.max}`);
            });
        }
    });

    suite('Assistant List Fixture', () => {
        let assistantList: AssistantListFixture;

        setup(() => {
            assistantList = loadFixture<AssistantListFixture>('assistant-list.json');
        });

        test('should load fixture with assistants', () => {
            assert.ok(assistantList.assistants);
            assert.ok(assistantList.assistants.length > 0);
        });

        // Parameterized test: Assistant validation
        for (const assistant of loadFixture<AssistantListFixture>('assistant-list.json').assistants) {
            test(`${assistant.name} should have required fields`, () => {
                assert.ok(assistant.name, 'Should have name');
                assert.ok(assistant.status, 'Should have status');
                assert.ok(assistant.host, 'Should have host');
            });
        }
    });

    suite('Namespace List Fixture', () => {
        let namespaceList: NamespaceListFixture;

        setup(() => {
            namespaceList = loadFixture<NamespaceListFixture>('namespace-list.json');
        });

        test('should load fixture with namespaces', () => {
            assert.ok(namespaceList.namespaces);
            assert.ok(namespaceList.namespaces.length > 0);
        });

        // Parameterized test: Record counts should be non-negative
        for (const ns of loadFixture<NamespaceListFixture>('namespace-list.json').namespaces) {
            test(`${ns.name || 'default'} should have non-negative record count`, () => {
                assert.ok(ns.record_count >= 0);
            });
        }
    });

    suite('Parameterized Validation Tests', () => {

        // Parameterized test: Index name validation
        const nameValidationCases: Array<TestCase<string, boolean>> = [
            { name: 'valid lowercase', input: 'my-index', expected: true },
            { name: 'valid with numbers', input: 'index-123', expected: true },
            { name: 'valid short', input: 'a', expected: true },
            { name: 'invalid uppercase', input: 'My-Index', expected: false },
            { name: 'invalid spaces', input: 'my index', expected: false },
            { name: 'invalid underscore', input: 'my_index', expected: false },
            { name: 'invalid empty', input: '', expected: false },
        ];

        for (const testCase of nameValidationCases) {
            test(`index name: ${testCase.name}`, () => {
                const isValid = /^[a-z0-9-]+$/.test(testCase.input) && testCase.input.length > 0;
                assert.strictEqual(isValid, testCase.expected);
            });
        }

        // Parameterized test: Dimension validation
        const dimensionValidationCases: Array<TestCase<number, boolean>> = [
            { name: 'valid small', input: 1, expected: true },
            { name: 'valid medium', input: 1536, expected: true },
            { name: 'valid large', input: 20000, expected: true },
            { name: 'invalid zero', input: 0, expected: false },
            { name: 'invalid negative', input: -1, expected: false },
            { name: 'invalid too large', input: 20001, expected: false },
        ];

        for (const testCase of dimensionValidationCases) {
            test(`dimension: ${testCase.name}`, () => {
                const isValid = testCase.input > 0 && testCase.input <= 20000;
                assert.strictEqual(isValid, testCase.expected);
            });
        }

        // Parameterized test: Metric validation
        const metricValidationCases: Array<TestCase<string, boolean>> = [
            { name: 'cosine', input: 'cosine', expected: true },
            { name: 'dotproduct', input: 'dotproduct', expected: true },
            { name: 'euclidean', input: 'euclidean', expected: true },
            { name: 'invalid manhattan', input: 'manhattan', expected: false },
            { name: 'invalid empty', input: '', expected: false },
        ];

        for (const testCase of metricValidationCases) {
            test(`metric: ${testCase.name}`, () => {
                const validMetrics = ['cosine', 'dotproduct', 'euclidean'];
                const isValid = validMetrics.includes(testCase.input);
                assert.strictEqual(isValid, testCase.expected);
            });
        }
    });

    suite('Error Message Extraction Tests', () => {

        // Parameterized test: Error message extraction
        const errorCases: Array<TestCase<unknown, string>> = [
            { name: 'Error object', input: new Error('Something failed'), expected: 'Something failed' },
            { name: 'string error', input: 'Direct string error', expected: 'Direct string error' },
            { name: 'object with message', input: { message: 'Object error' }, expected: 'Object error' },
            { name: 'number error', input: 404, expected: '404' },
            { name: 'null error', input: null, expected: 'null' },
            { name: 'undefined error', input: undefined, expected: 'undefined' },
        ];

        function extractErrorMessage(error: unknown): string {
            if (error instanceof Error) {
                return error.message;
            }
            if (typeof error === 'object' && error !== null && 'message' in error) {
                return String((error as { message: unknown }).message);
            }
            return String(error);
        }

        for (const testCase of errorCases) {
            test(`should extract message from ${testCase.name}`, () => {
                const message = extractErrorMessage(testCase.input);
                assert.ok(message.includes(testCase.expected) || message === testCase.expected);
            });
        }
    });
});
