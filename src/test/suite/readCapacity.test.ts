import * as assert from 'assert';
import { IndexModel } from '../../api/types';
import {
    getReadCapacityTransitionState,
    normalizeServerlessReadCapacity,
    parseReadCapacityPayload,
    summarizeReadCapacity
} from '../../utils/readCapacity';

suite('Read Capacity Helpers', () => {
    test('parseReadCapacityPayload defaults to OnDemand', () => {
        const parsed = parseReadCapacityPayload(undefined);
        assert.strictEqual(parsed.error, undefined);
        assert.deepStrictEqual(parsed.value, { mode: 'OnDemand' });
    });

    test('parseReadCapacityPayload parses Dedicated manual configuration', () => {
        const parsed = parseReadCapacityPayload({
            mode: 'Dedicated',
            nodeType: 'b1',
            replicas: '2',
            shards: '3'
        });

        assert.strictEqual(parsed.error, undefined);
        assert.deepStrictEqual(parsed.value, {
            mode: 'Dedicated',
            dedicated: {
                node_type: 'b1',
                scaling: 'Manual',
                manual: {
                    replicas: 2,
                    shards: 3
                }
            }
        });
    });

    test('parseReadCapacityPayload rejects Dedicated when disallowed', () => {
        const parsed = parseReadCapacityPayload({
            mode: 'Dedicated',
            nodeType: 'b1',
            replicas: '2',
            shards: '2'
        }, { allowDedicated: false });

        assert.ok(parsed.error);
        assert.strictEqual(parsed.value, undefined);
    });

    test('normalizeServerlessReadCapacity falls back to OnDemand for invalid Dedicated payload', () => {
        const normalized = normalizeServerlessReadCapacity({
            serverless: {
                cloud: 'aws',
                region: 'us-east-1',
                read_capacity: {
                    mode: 'Dedicated',
                    dedicated: {
                        node_type: 'invalid' as 'b1',
                        scaling: 'Manual',
                        manual: {
                            replicas: 0,
                            shards: 0
                        }
                    }
                }
            }
        });

        assert.deepStrictEqual(normalized, { mode: 'OnDemand' });
    });

    test('summarizeReadCapacity includes desired and runtime dedicated details', () => {
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
                    current_replicas: 4,
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
                            node_type: 't1',
                            scaling: 'Manual',
                            manual: {
                                replicas: 3,
                                shards: 2
                            }
                        }
                    }
                }
            },
            deletion_protection: 'disabled'
        };

        const summary = summarizeReadCapacity(index);
        assert.strictEqual(summary.mode, 'Dedicated');
        assert.strictEqual(summary.nodeType, 't1');
        assert.strictEqual(summary.desiredReplicas, 3);
        assert.strictEqual(summary.desiredShards, 2);
        assert.strictEqual(summary.currentReplicas, 4);
        assert.strictEqual(summary.currentShards, 2);
        assert.strictEqual(summary.status, 'Ready');
    });

    test('getReadCapacityTransitionState detects DRN scaling state', () => {
        const index: IndexModel = {
            name: 'drn-scaling',
            metric: 'cosine',
            dimension: 1536,
            host: 'drn-scaling.svc.us-east-1.pinecone.io',
            status: {
                ready: true,
                state: 'Ready',
                read_capacity: {
                    mode: 'Dedicated',
                    status: 'Scaling'
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

        const transition = getReadCapacityTransitionState(index);
        assert.strictEqual(transition.transitioning, true);
        assert.strictEqual(transition.phase, 'Scaling');
    });

    test('detects Dedicated mode from non-canonical runtime mode strings', () => {
        const index: IndexModel = {
            name: 'drn-runtime-string',
            metric: 'cosine',
            dimension: 1536,
            host: 'drn-runtime-string.svc.us-east-1.pinecone.io',
            status: {
                ready: true,
                state: 'Ready',
                read_capacity: {
                    mode: 'Dedicated (Scaling)' as unknown as 'Dedicated'
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

        const summary = summarizeReadCapacity(index);
        const transition = getReadCapacityTransitionState(index);
        assert.strictEqual(summary.mode, 'Dedicated');
        assert.strictEqual(transition.transitioning, true);
        assert.strictEqual(transition.phase, 'Scaling');
    });

    test('treats dedicated migrating mode text as transitioning even when spec is OnDemand', () => {
        const index: IndexModel = {
            name: 'drn-migrating-mode-signal',
            metric: 'cosine',
            dimension: 1536,
            host: 'drn-migrating-mode-signal.svc.us-east-1.pinecone.io',
            status: {
                ready: true,
                state: 'Ready',
                read_capacity: {
                    status: 'Dedicated (Migrating)'
                }
            },
            spec: {
                serverless: {
                    cloud: 'aws',
                    region: 'us-east-1'
                }
            },
            deletion_protection: 'disabled'
        };

        const transition = getReadCapacityTransitionState(index);
        assert.strictEqual(transition.transitioning, true);
        assert.strictEqual(transition.phase, 'Migrating');
    });

    test('requires exact Dedicated mode before marking DRN as ready', () => {
        const index: IndexModel = {
            name: 'drn-scaling-mode',
            metric: 'cosine',
            dimension: 1536,
            host: 'drn-scaling-mode.svc.us-east-1.pinecone.io',
            status: {
                ready: true,
                state: 'Ready',
                read_capacity: {
                    mode: 'Dedicated (Scaling)' as unknown as 'Dedicated',
                    status: 'Ready'
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
                                replicas: 1,
                                shards: 1
                            }
                        }
                    }
                }
            },
            deletion_protection: 'disabled'
        };

        const transition = getReadCapacityTransitionState(index);
        assert.strictEqual(transition.transitioning, true);
        assert.strictEqual(transition.phase, 'Scaling');
    });

    test('getReadCapacityTransitionState is false for OnDemand indexes', () => {
        const index: IndexModel = {
            name: 'ondemand',
            metric: 'cosine',
            dimension: 1536,
            host: 'ondemand.svc.us-east-1.pinecone.io',
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

        const transition = getReadCapacityTransitionState(index);
        assert.strictEqual(transition.transitioning, false);
    });
});
