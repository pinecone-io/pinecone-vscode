import * as assert from 'assert';
import { IndexModel, IndexStats } from '../../api/types';
import { formatIndexStatsMessage } from '../../commands/index.commands';

suite('Index Stats Formatting', () => {
    test('includes dedicated read node summary lines', () => {
        const stats: IndexStats = {
            totalVectorCount: 1234,
            dimension: 1536,
            indexFullness: 0.15,
            namespaces: {
                '': { vectorCount: 1200 },
                docs: { vectorCount: 34 }
            }
        };
        const index: IndexModel = {
            name: 'drn-index',
            metric: 'cosine',
            dimension: 1536,
            host: 'drn-index.svc.us-east-1.pinecone.io',
            status: {
                ready: true,
                state: 'Ready',
                read_capacity: {
                    mode: 'Dedicated',
                    status: 'Ready',
                    current_replicas: 3,
                    current_shards: 2
                }
            },
            spec: {
                serverless: {
                    cloud: 'aws',
                    region: 'us-east-1',
                    read_capacity: {
                        mode: 'Dedicated',
                        dedicated: {
                            node_type: 'b1',
                            scaling: 'Manual',
                            manual: {
                                replicas: 2,
                                shards: 2
                            }
                        }
                    }
                }
            },
            deletion_protection: 'disabled'
        };

        const message = formatIndexStatsMessage('drn-index', stats, index);
        assert.ok(message.includes('Read Capacity Mode: Dedicated'));
        assert.ok(message.includes('Read Node Type: b1'));
        assert.ok(message.includes('Desired Read Capacity: 2 replicas, 2 shards'));
        assert.ok(message.includes('Current Read Capacity: 3 replicas, 2 shards'));
        assert.ok(message.includes('Read Capacity Status: Ready'));
    });
});
