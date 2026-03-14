/**
 * API Client Tests
 * 
 * Unit tests for the Pinecone API client, error handling,
 * and request formatting.
 */

import * as assert from 'assert';
import { PineconeApiError } from '../../api/client';
import { IndexModel, AssistantModel, QueryResponse, ChatResponse } from '../../api/types';
import { API_VERSION } from '../../utils/constants';

suite('API Types Test Suite', () => {

    test('IndexModel should have required properties', () => {
        const index: IndexModel = {
            name: 'test-index',
            dimension: 1536,
            metric: 'cosine',
            host: 'test-index-abc123.svc.us-east-1.pinecone.io',
            status: {
                ready: true,
                state: 'Ready'
            },
            spec: {
                serverless: {
                    cloud: 'aws',
                    region: 'us-east-1'
                }
            },
            deletion_protection: 'disabled'
        };

        assert.strictEqual(index.name, 'test-index');
        assert.strictEqual(index.dimension, 1536);
        assert.strictEqual(index.metric, 'cosine');
        assert.strictEqual(index.status.ready, true);
        assert.strictEqual(index.deletion_protection, 'disabled');
    });

    test('IndexModel with pod spec', () => {
        const index: IndexModel = {
            name: 'pod-index',
            dimension: 768,
            metric: 'dotproduct',
            host: 'pod-index.svc.us-west1-gcp.pinecone.io',
            status: { ready: true, state: 'Ready' },
            spec: {
                pod: {
                    environment: 'us-west1-gcp',
                    pod_type: 'p1.x1',
                    pods: 1,
                    replicas: 2,
                    shards: 1
                }
            },
            deletion_protection: 'enabled'
        };

        assert.ok('pod' in index.spec);
        if ('pod' in index.spec) {
            assert.strictEqual(index.spec.pod.replicas, 2);
            assert.strictEqual(index.spec.pod.pod_type, 'p1.x1');
        }
    });

    test('AssistantModel should have required properties', () => {
        const assistant: AssistantModel = {
            name: 'test-assistant',
            status: 'Ready',
            host: 'test-assistant.assistant.pinecone.io',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z'
        };

        assert.strictEqual(assistant.name, 'test-assistant');
        assert.strictEqual(assistant.status, 'Ready');
    });

    test('QueryResponse should parse matches correctly', () => {
        const response: QueryResponse = {
            matches: [
                { id: 'vec-1', score: 0.95, metadata: { category: 'A' } },
                { id: 'vec-2', score: 0.85, metadata: { category: 'B' } }
            ],
            namespace: 'default',
            usage: { read_units: 5 }
        };

        assert.strictEqual(response.matches.length, 2);
        assert.strictEqual(response.matches[0].id, 'vec-1');
        assert.strictEqual(response.matches[0].score, 0.95);
        assert.strictEqual(response.namespace, 'default');
    });

    test('ChatResponse should include citations', () => {
        const response: ChatResponse = {
            id: 'chat-123',
            model: 'gpt-4',
            message: { role: 'assistant', content: 'Here is the answer.' },
            finish_reason: 'stop',
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
            citations: []
        };

        assert.strictEqual(response.message.role, 'assistant');
        assert.strictEqual(response.finish_reason, 'stop');
    });
});

suite('PineconeApiError Test Suite', () => {

    test('should create error with status and message', () => {
        const error = new PineconeApiError(401, 'Unauthorized');
        
        assert.strictEqual(error.status, 401);
        // The message property contains the full formatted error
        assert.ok(error.message.includes('401'));
        assert.ok(error.message.includes('Unauthorized'));
        // The apiMessage property contains just the raw API message
        assert.strictEqual(error.apiMessage, 'Unauthorized');
        assert.strictEqual(error.name, 'PineconeApiError');
    });

    test('should format error message correctly', () => {
        const error = new PineconeApiError(404, 'Index not found');
        
        // Both toString() and message should include the status code
        assert.ok(error.toString().includes('404'));
        assert.ok(error.toString().includes('Index not found'));
        assert.ok(error.message.includes('404'));
        assert.ok(error.message.includes('Index not found'));
    });

    test('should be instanceof Error', () => {
        const error = new PineconeApiError(500, 'Internal error');
        
        assert.ok(error instanceof Error);
        assert.ok(error instanceof PineconeApiError);
    });
});

suite('API Versioning', () => {
    test('should pin current API version header value', () => {
        assert.strictEqual(API_VERSION, '2025-10');
    });
});
