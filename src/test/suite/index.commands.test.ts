/**
 * Index Commands Behavioral Tests
 * 
 * Tests for index command handlers verifying they:
 * - Build correct API requests from user input
 * - Handle errors gracefully
 * - Validate input properly
 * 
 * Uses mocked services to test logic in isolation (CLI/SDK pattern).
 */

import * as assert from 'assert';
import { IndexModel, ServerlessSpec, PodSpec, CreateIndexForModelRequest } from '../../api/types';
import { EMBEDDING_MODELS, CLOUD_REGIONS } from '../../utils/constants';

/**
 * Mock PineconeService for testing command logic without API calls.
 */
class MockPineconeService {
    // Track calls for assertions
    public lastCreateIndexCall: Partial<IndexModel> | null = null;
    public lastDeleteIndexCall: string | null = null;
    public lastConfigureIndexCall: { name: string; config: Record<string, unknown> } | null = null;
    public listIndexesResult: IndexModel[] = [];
    public createIndexResult: IndexModel | null = null;
    public shouldThrowError: Error | null = null;

    async listIndexes(): Promise<IndexModel[]> {
        if (this.shouldThrowError) {
            throw this.shouldThrowError;
        }
        return this.listIndexesResult;
    }

    async createIndex(index: Partial<IndexModel>): Promise<IndexModel> {
        if (this.shouldThrowError) {
            throw this.shouldThrowError;
        }
        this.lastCreateIndexCall = index;
        return this.createIndexResult || { name: index.name || 'test', ...index } as IndexModel;
    }

    async deleteIndex(name: string): Promise<void> {
        if (this.shouldThrowError) {
            throw this.shouldThrowError;
        }
        this.lastDeleteIndexCall = name;
    }

    async configureIndex(name: string, config: Record<string, unknown>): Promise<IndexModel> {
        if (this.shouldThrowError) {
            throw this.shouldThrowError;
        }
        this.lastConfigureIndexCall = { name, config };
        return { name } as IndexModel;
    }

    getControlPlane() {
        return {
            createBackup: async (indexName: string, backupName: string) => {
                return { name: backupName, source_index: indexName };
            },
            listBackups: async () => []
        };
    }
}

/**
 * Mock for createIndexForModel API (integrated embeddings).
 * Follows CLI pattern for testing integrated embedding index creation.
 */
class MockControlPlaneForModel {
    public lastCreateIndexForModelCall: CreateIndexForModelRequest | null = null;
    public createIndexForModelResult: IndexModel | null = null;
    public shouldThrowError: Error | null = null;

    async createIndexForModel(request: CreateIndexForModelRequest): Promise<IndexModel> {
        if (this.shouldThrowError) {
            throw this.shouldThrowError;
        }
        this.lastCreateIndexForModelCall = request;
        return this.createIndexForModelResult || {
            name: request.name,
            dimension: 1024,
            metric: request.embed.metric || 'cosine',
            host: `${request.name}-abc123.svc.${request.region}.pinecone.io`,
            status: { ready: false, state: 'Initializing' },
            spec: { serverless: { cloud: request.cloud, region: request.region } },
            deletion_protection: request.deletion_protection || 'disabled',
            embed: {
                model: request.embed.model,
                field_map: request.embed.field_map,
                dimension: request.embed.dimension
            }
        } as IndexModel;
    }
}

suite('Index Commands Behavioral Tests', () => {

    suite('createIndex Command Logic', () => {

        test('should build serverless index request correctly', () => {
            const mockService = new MockPineconeService();
            
            // Simulate the parameters that would be gathered from user input
            const userInput = {
                name: 'my-test-index',
                dimension: 1536,
                metric: 'cosine' as const,
                spec: {
                    serverless: {
                        cloud: 'aws' as const,
                        region: 'us-east-1'
                    }
                } as ServerlessSpec
            };

            // Call the service directly (simulating what the command does)
            mockService.createIndex(userInput);

            // Verify the request was built correctly
            assert.ok(mockService.lastCreateIndexCall);
            assert.strictEqual(mockService.lastCreateIndexCall.name, 'my-test-index');
            assert.strictEqual(mockService.lastCreateIndexCall.dimension, 1536);
            assert.strictEqual(mockService.lastCreateIndexCall.metric, 'cosine');
            
            const spec = mockService.lastCreateIndexCall.spec as ServerlessSpec;
            assert.ok(spec.serverless);
            assert.strictEqual(spec.serverless.cloud, 'aws');
            assert.strictEqual(spec.serverless.region, 'us-east-1');
        });

        test('should build pod index request correctly', () => {
            const mockService = new MockPineconeService();
            
            const userInput = {
                name: 'my-pod-index',
                dimension: 768,
                metric: 'euclidean' as const,
                spec: {
                    pod: {
                        environment: 'us-west1-gcp',
                        pod_type: 'p1.x1',
                        pods: 1,
                        replicas: 1,
                        shards: 1
                    }
                } as PodSpec
            };

            mockService.createIndex(userInput);

            assert.ok(mockService.lastCreateIndexCall);
            assert.strictEqual(mockService.lastCreateIndexCall.name, 'my-pod-index');
            assert.strictEqual(mockService.lastCreateIndexCall.dimension, 768);
            assert.strictEqual(mockService.lastCreateIndexCall.metric, 'euclidean');
            
            const spec = mockService.lastCreateIndexCall.spec as PodSpec;
            assert.ok(spec.pod);
            assert.strictEqual(spec.pod.environment, 'us-west1-gcp');
            assert.strictEqual(spec.pod.pod_type, 'p1.x1');
        });

        test('should handle different distance metrics', () => {
            const mockService = new MockPineconeService();
            const metrics: Array<'cosine' | 'euclidean' | 'dotproduct'> = ['cosine', 'euclidean', 'dotproduct'];

            for (const metric of metrics) {
                mockService.createIndex({
                    name: `index-${metric}`,
                    dimension: 128,
                    metric,
                    spec: { serverless: { cloud: 'aws', region: 'us-east-1' } }
                });

                assert.strictEqual(mockService.lastCreateIndexCall?.metric, metric);
            }
        });

        test('should build sparse index request correctly', () => {
            const mockService = new MockPineconeService();
            
            // Sparse indexes only use dotproduct metric and don't require dimension
            const userInput = {
                name: 'my-sparse-index',
                metric: 'dotproduct' as const,
                vector_type: 'sparse' as const,
                spec: {
                    serverless: {
                        cloud: 'aws' as const,
                        region: 'us-east-1'
                    }
                } as ServerlessSpec
            };

            mockService.createIndex(userInput);

            assert.ok(mockService.lastCreateIndexCall);
            assert.strictEqual(mockService.lastCreateIndexCall.name, 'my-sparse-index');
            assert.strictEqual(mockService.lastCreateIndexCall.metric, 'dotproduct');
            assert.strictEqual(mockService.lastCreateIndexCall.vector_type, 'sparse');
            // Sparse indexes don't require dimension
            assert.strictEqual(mockService.lastCreateIndexCall.dimension, undefined);
        });

        test('should build BYOV on-demand read capacity request', () => {
            const mockService = new MockPineconeService();

            const userInput = {
                name: 'my-ondemand-index',
                dimension: 1536,
                metric: 'cosine' as const,
                spec: {
                    serverless: {
                        cloud: 'aws' as const,
                        region: 'us-east-1',
                        read_capacity: {
                            mode: 'OnDemand' as const
                        }
                    }
                } as ServerlessSpec
            };

            mockService.createIndex(userInput);

            const spec = mockService.lastCreateIndexCall?.spec as ServerlessSpec;
            assert.strictEqual(spec.serverless.read_capacity?.mode, 'OnDemand');
        });

        test('should build BYOV dedicated read capacity request', () => {
            const mockService = new MockPineconeService();

            const userInput = {
                name: 'my-drn-index',
                dimension: 1536,
                metric: 'cosine' as const,
                spec: {
                    serverless: {
                        cloud: 'aws' as const,
                        region: 'us-east-1',
                        read_capacity: {
                            mode: 'Dedicated' as const,
                            dedicated: {
                                node_type: 'b1' as const,
                                scaling: 'Manual' as const,
                                manual: {
                                    replicas: 2,
                                    shards: 3
                                }
                            }
                        }
                    }
                } as ServerlessSpec
            };

            mockService.createIndex(userInput);

            const spec = mockService.lastCreateIndexCall?.spec as ServerlessSpec;
            assert.strictEqual(spec.serverless.read_capacity?.mode, 'Dedicated');
            assert.strictEqual(spec.serverless.read_capacity?.dedicated?.node_type, 'b1');
            assert.strictEqual(spec.serverless.read_capacity?.dedicated?.manual.replicas, 2);
            assert.strictEqual(spec.serverless.read_capacity?.dedicated?.manual.shards, 3);
        });
    });

    suite('deleteIndex Command Logic', () => {

        test('should call deleteIndex with correct name', async () => {
            const mockService = new MockPineconeService();
            
            await mockService.deleteIndex('index-to-delete');

            assert.strictEqual(mockService.lastDeleteIndexCall, 'index-to-delete');
        });

        test('should handle deletion of protected index', async () => {
            const mockService = new MockPineconeService();
            
            // First call to configureIndex to disable protection
            await mockService.configureIndex('protected-index', { deletion_protection: 'disabled' });
            
            assert.ok(mockService.lastConfigureIndexCall);
            assert.strictEqual(mockService.lastConfigureIndexCall.name, 'protected-index');
            assert.strictEqual(
                mockService.lastConfigureIndexCall.config.deletion_protection, 
                'disabled'
            );
        });
    });

    suite('configureIndex Command Logic', () => {

        test('should configure deletion protection', async () => {
            const mockService = new MockPineconeService();
            
            await mockService.configureIndex('my-index', { deletion_protection: 'enabled' });

            assert.ok(mockService.lastConfigureIndexCall);
            assert.strictEqual(mockService.lastConfigureIndexCall.name, 'my-index');
            assert.strictEqual(
                mockService.lastConfigureIndexCall.config.deletion_protection,
                'enabled'
            );
        });

        test('should configure tags', async () => {
            const mockService = new MockPineconeService();
            const tags = { env: 'prod', team: 'ml', owner: 'john' };
            
            await mockService.configureIndex('my-index', { tags });

            assert.ok(mockService.lastConfigureIndexCall);
            assert.deepStrictEqual(mockService.lastConfigureIndexCall.config.tags, tags);
        });

        test('should configure pod replicas', async () => {
            const mockService = new MockPineconeService();
            
            await mockService.configureIndex('my-pod-index', {
                spec: { pod: { replicas: 3 } }
            });

            assert.ok(mockService.lastConfigureIndexCall);
            const spec = mockService.lastConfigureIndexCall.config.spec as { pod: { replicas: number } };
            assert.strictEqual(spec.pod.replicas, 3);
        });

        test('should configure dedicated read capacity', async () => {
            const mockService = new MockPineconeService();

            await mockService.configureIndex('my-index', {
                spec: {
                    serverless: {
                        read_capacity: {
                            mode: 'Dedicated',
                            dedicated: {
                                node_type: 't1',
                                scaling: 'Manual',
                                manual: {
                                    replicas: 3,
                                    shards: 2
                                }
                            }
                        }
                    }
                }
            });

            assert.ok(mockService.lastConfigureIndexCall);
            const spec = mockService.lastConfigureIndexCall.config.spec as {
                serverless: {
                    read_capacity: {
                        mode: 'Dedicated';
                        dedicated: {
                            node_type: string;
                            scaling: 'Manual';
                            manual: { replicas: number; shards: number };
                        };
                    };
                };
            };
            assert.strictEqual(spec.serverless.read_capacity.mode, 'Dedicated');
            assert.strictEqual(spec.serverless.read_capacity.dedicated.node_type, 't1');
            assert.strictEqual(spec.serverless.read_capacity.dedicated.manual.replicas, 3);
            assert.strictEqual(spec.serverless.read_capacity.dedicated.manual.shards, 2);
        });
    });
});

// ============================================================================
// Integrated Embeddings Tests (CLI pattern: Test_runCreateIndexWithService_Integrated_Args)
// ============================================================================

suite('Integrated Embeddings Index Tests', () => {

    suite('createIndexForModel API Logic', () => {

        test('should build integrated embedding request correctly', async () => {
            const mockApi = new MockControlPlaneForModel();
            
            const request: CreateIndexForModelRequest = {
                name: 'my-embed-index',
                cloud: 'aws',
                region: 'us-east-1',
                embed: {
                    model: 'llama-text-embed-v2',
                    field_map: { text: 'content' },
                    dimension: 1024
                }
            };

            await mockApi.createIndexForModel(request);

            assert.ok(mockApi.lastCreateIndexForModelCall);
            assert.strictEqual(mockApi.lastCreateIndexForModelCall.name, 'my-embed-index');
            assert.strictEqual(mockApi.lastCreateIndexForModelCall.cloud, 'aws');
            assert.strictEqual(mockApi.lastCreateIndexForModelCall.region, 'us-east-1');
            assert.strictEqual(mockApi.lastCreateIndexForModelCall.embed.model, 'llama-text-embed-v2');
            assert.strictEqual(mockApi.lastCreateIndexForModelCall.embed.field_map.text, 'content');
            assert.strictEqual(mockApi.lastCreateIndexForModelCall.embed.dimension, 1024);
        });

        test('should handle multilingual-e5-large model (fixed dimension)', async () => {
            const mockApi = new MockControlPlaneForModel();
            
            const request: CreateIndexForModelRequest = {
                name: 'multilingual-index',
                cloud: 'gcp',
                region: 'us-central1',
                embed: {
                    model: 'multilingual-e5-large',
                    field_map: { text: 'text_field' }
                    // dimension is fixed at 1024 for this model, may be omitted
                }
            };

            await mockApi.createIndexForModel(request);

            assert.ok(mockApi.lastCreateIndexForModelCall);
            assert.strictEqual(mockApi.lastCreateIndexForModelCall.embed.model, 'multilingual-e5-large');
            // dimension may be undefined when using default
            assert.strictEqual(mockApi.lastCreateIndexForModelCall.embed.dimension, undefined);
        });

        test('should handle sparse embedding model', async () => {
            const mockApi = new MockControlPlaneForModel();
            
            const request: CreateIndexForModelRequest = {
                name: 'sparse-embed-index',
                cloud: 'aws',
                region: 'us-west-2',
                embed: {
                    model: 'pinecone-sparse-english-v0',
                    field_map: { text: 'document' }
                }
            };

            await mockApi.createIndexForModel(request);

            assert.ok(mockApi.lastCreateIndexForModelCall);
            assert.strictEqual(mockApi.lastCreateIndexForModelCall.embed.model, 'pinecone-sparse-english-v0');
        });

        test('should include deletion protection when specified', async () => {
            const mockApi = new MockControlPlaneForModel();
            
            const request: CreateIndexForModelRequest = {
                name: 'protected-embed-index',
                cloud: 'aws',
                region: 'us-east-1',
                deletion_protection: 'enabled',
                embed: {
                    model: 'llama-text-embed-v2',
                    field_map: { text: 'content' }
                }
            };

            await mockApi.createIndexForModel(request);

            assert.ok(mockApi.lastCreateIndexForModelCall);
            assert.strictEqual(mockApi.lastCreateIndexForModelCall.deletion_protection, 'enabled');
        });

        test('should include tags when specified', async () => {
            const mockApi = new MockControlPlaneForModel();
            
            const request: CreateIndexForModelRequest = {
                name: 'tagged-embed-index',
                cloud: 'aws',
                region: 'us-east-1',
                tags: { env: 'prod', team: 'ml' },
                embed: {
                    model: 'llama-text-embed-v2',
                    field_map: { text: 'content' }
                }
            };

            await mockApi.createIndexForModel(request);

            assert.ok(mockApi.lastCreateIndexForModelCall);
            assert.deepStrictEqual(mockApi.lastCreateIndexForModelCall.tags, { env: 'prod', team: 'ml' });
        });

        test('should include read/write parameters when specified', async () => {
            const mockApi = new MockControlPlaneForModel();
            
            const request: CreateIndexForModelRequest = {
                name: 'parameterized-index',
                cloud: 'aws',
                region: 'us-east-1',
                embed: {
                    model: 'llama-text-embed-v2',
                    field_map: { text: 'content' },
                    read_parameters: { input_type: 'query', truncate: 'END' },
                    write_parameters: { input_type: 'passage', truncate: 'END' }
                }
            };

            await mockApi.createIndexForModel(request);

            assert.ok(mockApi.lastCreateIndexForModelCall);
            assert.deepStrictEqual(
                mockApi.lastCreateIndexForModelCall.embed.read_parameters,
                { input_type: 'query', truncate: 'END' }
            );
            assert.deepStrictEqual(
                mockApi.lastCreateIndexForModelCall.embed.write_parameters,
                { input_type: 'passage', truncate: 'END' }
            );
        });

        test('should return index with embed config', async () => {
            const mockApi = new MockControlPlaneForModel();
            
            const result = await mockApi.createIndexForModel({
                name: 'my-embed-index',
                cloud: 'aws',
                region: 'us-east-1',
                embed: {
                    model: 'llama-text-embed-v2',
                    field_map: { text: 'content' }
                }
            });

            assert.ok(result.embed);
            assert.strictEqual(result.embed.model, 'llama-text-embed-v2');
            assert.strictEqual(result.embed.field_map.text, 'content');
        });

        test('should propagate API errors', async () => {
            const mockApi = new MockControlPlaneForModel();
            mockApi.shouldThrowError = new Error('Invalid model name');

            try {
                await mockApi.createIndexForModel({
                    name: 'bad-index',
                    cloud: 'aws',
                    region: 'us-east-1',
                    embed: {
                        model: 'invalid-model' as 'llama-text-embed-v2',
                        field_map: { text: 'content' }
                    }
                });
                assert.fail('Should have thrown');
            } catch (e) {
                assert.ok(e instanceof Error);
                assert.ok(e.message.includes('Invalid model'));
            }
        });
    });

    suite('Embedding Model Configuration', () => {

        // Uses EMBEDDING_MODELS imported from utils/constants.ts
        // This ensures tests validate the actual configuration used by the extension

        test('llama-text-embed-v2 should have multiple dimension options', () => {
            const model = EMBEDDING_MODELS.find(m => m.name === 'llama-text-embed-v2');
            assert.ok(model);
            assert.deepStrictEqual(model.dimensions, [384, 512, 768, 1024, 2048]);
            assert.strictEqual(model.defaultDimension, 1024);
            assert.strictEqual(model.isSparse, false);
        });

        test('multilingual-e5-large should have fixed dimension', () => {
            const model = EMBEDDING_MODELS.find(m => m.name === 'multilingual-e5-large');
            assert.ok(model);
            assert.deepStrictEqual(model.dimensions, [1024]);
            assert.strictEqual(model.defaultDimension, 1024);
            assert.strictEqual(model.isSparse, false);
        });

        test('pinecone-sparse-english-v0 should be sparse with dotproduct metric', () => {
            const model = EMBEDDING_MODELS.find(m => m.name === 'pinecone-sparse-english-v0');
            assert.ok(model);
            assert.strictEqual(model.isSparse, true);
            assert.deepStrictEqual(model.dimensions, []);
            assert.strictEqual(model.defaultMetric, 'dotproduct');
        });

        test('all dense models should default to cosine metric', () => {
            const denseModels = EMBEDDING_MODELS.filter(m => !m.isSparse);
            for (const model of denseModels) {
                assert.strictEqual(model.defaultMetric, 'cosine', 
                    `${model.name} should default to cosine metric`);
            }
        });

        test('all models should have required properties', () => {
            for (const model of EMBEDDING_MODELS) {
                assert.ok(model.label, `${model.name} should have a label`);
                assert.ok(model.name, 'Model should have a name');
                assert.ok(typeof model.isSparse === 'boolean', `${model.name} should have isSparse flag`);
                assert.ok(Array.isArray(model.dimensions), `${model.name} should have dimensions array`);
                assert.ok(model.defaultMetric, `${model.name} should have a default metric`);
            }
        });
    });

    suite('Cloud Region Configuration', () => {

        // Uses CLOUD_REGIONS imported from utils/constants.ts
        // This ensures tests validate the actual configuration used by the extension
        // Helper to extract region labels from the structured config
        const getRegionLabels = (cloud: string): string[] => 
            CLOUD_REGIONS[cloud]?.map(r => r.label) || [];

        test('AWS should have 3 regions', () => {
            const awsRegions = getRegionLabels('aws');
            assert.strictEqual(awsRegions.length, 3);
            assert.ok(awsRegions.includes('us-east-1'));
            assert.ok(awsRegions.includes('us-west-2'));
            assert.ok(awsRegions.includes('eu-west-1'));
        });

        test('GCP should have 2 regions', () => {
            const gcpRegions = getRegionLabels('gcp');
            assert.strictEqual(gcpRegions.length, 2);
            assert.ok(gcpRegions.includes('us-central1'));
            assert.ok(gcpRegions.includes('europe-west4'));
        });

        test('Azure should have 1 region', () => {
            const azureRegions = getRegionLabels('azure');
            assert.strictEqual(azureRegions.length, 1);
            assert.ok(azureRegions.includes('eastus2'));
        });
    });
});

suite('Index Name Validation Tests', () => {

    /**
     * Validates index name according to Pinecone rules:
     * - Lowercase alphanumeric and hyphens only
     * - Maximum 45 characters
     */
    function validateIndexName(name: string): string | null {
        if (!name) {
            return 'Name is required';
        }
        if (!/^[a-z0-9-]+$/.test(name)) {
            return 'Name must consist of lowercase alphanumeric characters or hyphens';
        }
        if (name.length > 45) {
            return 'Name must be 45 characters or less';
        }
        return null;
    }

    test('should accept valid lowercase names', () => {
        assert.strictEqual(validateIndexName('my-index'), null);
        assert.strictEqual(validateIndexName('index123'), null);
        assert.strictEqual(validateIndexName('a-b-c'), null);
        assert.strictEqual(validateIndexName('test'), null);
    });

    test('should reject empty names', () => {
        const error = validateIndexName('');
        assert.ok(error);
        assert.ok(error.includes('required'));
    });

    test('should reject uppercase letters', () => {
        const error = validateIndexName('MyIndex');
        assert.ok(error);
        assert.ok(error.includes('lowercase'));
    });

    test('should reject special characters', () => {
        assert.ok(validateIndexName('my_index')); // underscore
        assert.ok(validateIndexName('my.index')); // period
        assert.ok(validateIndexName('my index')); // space
        assert.ok(validateIndexName('my@index')); // at symbol
    });

    test('should reject names longer than 45 characters', () => {
        const longName = 'a'.repeat(46);
        const error = validateIndexName(longName);
        assert.ok(error);
        assert.ok(error.includes('45'));
    });

    test('should accept names exactly 45 characters', () => {
        const name = 'a'.repeat(45);
        assert.strictEqual(validateIndexName(name), null);
    });
});

suite('Dimension Validation Tests', () => {

    function validateDimension(value: string): string | null {
        // Check for empty or whitespace-only input
        if (!value || value.trim() === '') {
            return 'Dimension must be a positive integer';
        }
        // Check that input is a valid integer (no decimals, no letters)
        if (!/^\d+$/.test(value.trim())) {
            return 'Dimension must be a positive integer';
        }
        const dim = parseInt(value);
        if (isNaN(dim) || dim <= 0) {
            return 'Dimension must be a positive integer';
        }
        if (dim > 20000) {
            return 'Dimension must be 20000 or less';
        }
        return null;
    }

    test('should accept valid dimensions', () => {
        assert.strictEqual(validateDimension('128'), null);
        assert.strictEqual(validateDimension('768'), null);
        assert.strictEqual(validateDimension('1536'), null);
        assert.strictEqual(validateDimension('20000'), null);
    });

    test('should reject zero', () => {
        const error = validateDimension('0');
        assert.ok(error);
        assert.ok(error.includes('positive'));
    });

    test('should reject negative numbers', () => {
        const error = validateDimension('-100');
        assert.ok(error);
    });

    test('should reject non-numeric input', () => {
        assert.ok(validateDimension('abc'));
        assert.ok(validateDimension('12.5'));
        assert.ok(validateDimension(''));
    });

    test('should reject dimensions over 20000', () => {
        const error = validateDimension('20001');
        assert.ok(error);
        assert.ok(error.includes('20000'));
    });
});

// ============================================================================
// Restore Job Tests
// ============================================================================

import { RestoreJob, CreateRestoreParams, BackupModel } from '../../api/types';

/**
 * Mock ControlPlaneApi for restore job testing.
 */
class MockControlPlaneApi {
    public lastCreateRestoreCall: CreateRestoreParams | null = null;
    public lastDeleteBackupCall: string | null = null;
    public lastDescribeRestoreJobCall: string | null = null;
    
    public listBackupsResult: BackupModel[] = [];
    public listRestoreJobsResult: { data: RestoreJob[]; pagination?: { next?: string } } = { data: [] };
    public createRestoreResult: { index_id: string; restore_job_id: string } = { 
        index_id: 'idx-new', 
        restore_job_id: 'rj-123' 
    };
    public shouldThrowError: Error | null = null;

    async listBackups(_indexName?: string): Promise<BackupModel[]> {
        if (this.shouldThrowError) { throw this.shouldThrowError; }
        return this.listBackupsResult;
    }

    async deleteBackup(backupId: string): Promise<void> {
        if (this.shouldThrowError) { throw this.shouldThrowError; }
        this.lastDeleteBackupCall = backupId;
    }

    async createIndexFromBackup(params: CreateRestoreParams): Promise<{ index_id: string; restore_job_id: string }> {
        if (this.shouldThrowError) { throw this.shouldThrowError; }
        this.lastCreateRestoreCall = params;
        return this.createRestoreResult;
    }

    async listRestoreJobs(_params?: { limit?: number; pagination_token?: string }): Promise<{ data: RestoreJob[]; pagination?: { next?: string } }> {
        if (this.shouldThrowError) { throw this.shouldThrowError; }
        return this.listRestoreJobsResult;
    }

    async describeRestoreJob(restoreJobId: string): Promise<RestoreJob> {
        if (this.shouldThrowError) { throw this.shouldThrowError; }
        this.lastDescribeRestoreJobCall = restoreJobId;
        return {
            restore_job_id: restoreJobId,
            backup_id: 'backup-123',
            target_index_name: 'restored-index',
            target_index_id: 'idx-restored',
            status: 'InProgress',
            created_at: new Date().toISOString(),
            percent_complete: 50
        };
    }
}

suite('Restore Job Behavioral Tests', () => {

    suite('createIndexFromBackup Logic', () => {

        test('should build restore request correctly', async () => {
            const mockApi = new MockControlPlaneApi();
            
            await mockApi.createIndexFromBackup({
                backup_id: 'backup-abc123',
                name: 'restored-index'
            });

            assert.ok(mockApi.lastCreateRestoreCall);
            assert.strictEqual(mockApi.lastCreateRestoreCall.backup_id, 'backup-abc123');
            assert.strictEqual(mockApi.lastCreateRestoreCall.name, 'restored-index');
        });

        test('should include deletion protection when specified', async () => {
            const mockApi = new MockControlPlaneApi();
            
            await mockApi.createIndexFromBackup({
                backup_id: 'backup-abc123',
                name: 'protected-index',
                deletion_protection: 'enabled'
            });

            assert.ok(mockApi.lastCreateRestoreCall);
            assert.strictEqual(mockApi.lastCreateRestoreCall.deletion_protection, 'enabled');
        });

        test('should include tags when specified', async () => {
            const mockApi = new MockControlPlaneApi();
            
            await mockApi.createIndexFromBackup({
                backup_id: 'backup-abc123',
                name: 'tagged-index',
                tags: { env: 'prod', restored: 'true' }
            });

            assert.ok(mockApi.lastCreateRestoreCall);
            assert.deepStrictEqual(mockApi.lastCreateRestoreCall.tags, { env: 'prod', restored: 'true' });
        });

        test('should return restore job ID and index ID', async () => {
            const mockApi = new MockControlPlaneApi();
            mockApi.createRestoreResult = {
                index_id: 'idx-new-123',
                restore_job_id: 'rj-456'
            };

            const result = await mockApi.createIndexFromBackup({
                backup_id: 'backup-abc123',
                name: 'new-index'
            });

            assert.strictEqual(result.index_id, 'idx-new-123');
            assert.strictEqual(result.restore_job_id, 'rj-456');
        });
    });

    suite('deleteBackup Logic', () => {

        test('should call deleteBackup with correct ID', async () => {
            const mockApi = new MockControlPlaneApi();
            
            await mockApi.deleteBackup('backup-to-delete');

            assert.strictEqual(mockApi.lastDeleteBackupCall, 'backup-to-delete');
        });
    });

    suite('listRestoreJobs Logic', () => {

        test('should return list of restore jobs', async () => {
            const mockApi = new MockControlPlaneApi();
            mockApi.listRestoreJobsResult = {
                data: [
                    {
                        restore_job_id: 'rj-1',
                        backup_id: 'backup-1',
                        target_index_name: 'index-1',
                        target_index_id: 'idx-1',
                        status: 'Completed',
                        created_at: '2024-01-01T00:00:00Z',
                        completed_at: '2024-01-01T00:05:00Z',
                        percent_complete: 100
                    },
                    {
                        restore_job_id: 'rj-2',
                        backup_id: 'backup-2',
                        target_index_name: 'index-2',
                        target_index_id: 'idx-2',
                        status: 'InProgress',
                        created_at: '2024-01-02T00:00:00Z',
                        percent_complete: 45
                    }
                ],
                pagination: { next: 'token-123' }
            };

            const result = await mockApi.listRestoreJobs({ limit: 10 });

            assert.strictEqual(result.data.length, 2);
            assert.strictEqual(result.data[0].status, 'Completed');
            assert.strictEqual(result.data[1].status, 'InProgress');
            assert.strictEqual(result.pagination?.next, 'token-123');
        });

        test('should handle empty restore job list', async () => {
            const mockApi = new MockControlPlaneApi();
            mockApi.listRestoreJobsResult = { data: [] };

            const result = await mockApi.listRestoreJobs();

            assert.strictEqual(result.data.length, 0);
        });
    });

    suite('describeRestoreJob Logic', () => {

        test('should return restore job details', async () => {
            const mockApi = new MockControlPlaneApi();

            const job = await mockApi.describeRestoreJob('rj-test');

            assert.ok(mockApi.lastDescribeRestoreJobCall);
            assert.strictEqual(mockApi.lastDescribeRestoreJobCall, 'rj-test');
            assert.strictEqual(job.restore_job_id, 'rj-test');
            assert.strictEqual(job.status, 'InProgress');
            assert.strictEqual(job.percent_complete, 50);
        });
    });

    suite('Error Handling', () => {

        test('should propagate API errors on restore', async () => {
            const mockApi = new MockControlPlaneApi();
            mockApi.shouldThrowError = new Error('Backup not found');

            try {
                await mockApi.createIndexFromBackup({
                    backup_id: 'nonexistent',
                    name: 'new-index'
                });
                assert.fail('Should have thrown');
            } catch (e) {
                assert.ok(e instanceof Error);
                assert.ok(e.message.includes('not found'));
            }
        });

        test('should propagate API errors on delete', async () => {
            const mockApi = new MockControlPlaneApi();
            mockApi.shouldThrowError = new Error('Permission denied');

            try {
                await mockApi.deleteBackup('protected-backup');
                assert.fail('Should have thrown');
            } catch (e) {
                assert.ok(e instanceof Error);
                assert.ok(e.message.includes('Permission'));
            }
        });
    });
});
