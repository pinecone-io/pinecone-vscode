/**
 * WebView Message Handling Tests
 * 
 * Tests for the message handling logic in QueryPanel and ChatPanel.
 * These tests verify the core logic without requiring VSCode webview dependencies
 * by extracting and testing the pure functions that handle:
 * 
 * - Query parameter validation and parsing
 * - Text vs vector query routing
 * - Authentication error detection
 * - Streaming message handling
 * - Abort handling
 * 
 * @module test/suite/webview.test
 */

import * as assert from 'assert';
import { StreamChunk, StreamContentDelta, StreamCitation, StreamMessageEnd, Citation } from '../../api/types';

// ============================================================================
// Query Panel Logic Tests
// ============================================================================

/**
 * Validates vector input string and parses it to a number array.
 * Mirrors the validation logic in QueryPanel.handleVectorQuery().
 */
function parseVectorInput(vectorStr: string): { vector?: number[]; error?: string } {
    if (!vectorStr || !vectorStr.trim()) {
        return { vector: undefined };
    }
    
    try {
        const vector = JSON.parse(vectorStr);
        if (!Array.isArray(vector) || !vector.every(n => typeof n === 'number')) {
            return { error: 'Vector must be an array of numbers' };
        }
        return { vector };
    } catch (e) {
        return { error: 'Invalid vector format. Must be a JSON array of numbers (e.g., [0.1, 0.2, 0.3]).' };
    }
}

/**
 * Validates and parses filter JSON string.
 * Mirrors the validation logic in QueryPanel.handleQuery().
 */
function parseFilterInput(filterStr: string): { filter?: Record<string, unknown>; error?: string } {
    if (!filterStr || !filterStr.trim()) {
        return { filter: undefined };
    }
    
    try {
        const filter = JSON.parse(filterStr);
        return { filter };
    } catch (e) {
        return { error: 'Invalid filter JSON. Please check the syntax.' };
    }
}

/**
 * Determines if a query should use text search (integrated embeddings) or vector search.
 * Mirrors the routing logic in QueryPanel.handleQuery().
 */
function shouldUseTextSearch(
    textQuery: string | undefined,
    hasIntegratedEmbeddings: boolean
): boolean {
    return !!(textQuery && textQuery.trim() && hasIntegratedEmbeddings);
}

/**
 * Checks if an error message indicates an authentication problem.
 * Shared between QueryPanel and ChatPanel.
 */
function isAuthError(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    return lowerMessage.includes('401') ||
           lowerMessage.includes('unauthorized') ||
           lowerMessage.includes('token expired') ||
           lowerMessage.includes('authentication failed') ||
           lowerMessage.includes('not authenticated');
}

suite('Query Panel Message Handling Tests', () => {

    suite('Vector Input Parsing', () => {

        test('should parse valid vector array', () => {
            const result = parseVectorInput('[0.1, 0.2, 0.3]');
            assert.ok(result.vector);
            assert.deepStrictEqual(result.vector, [0.1, 0.2, 0.3]);
            assert.strictEqual(result.error, undefined);
        });

        test('should parse valid integer vector', () => {
            const result = parseVectorInput('[1, 2, 3]');
            assert.ok(result.vector);
            assert.deepStrictEqual(result.vector, [1, 2, 3]);
        });

        test('should reject non-array input', () => {
            const result = parseVectorInput('{"not": "array"}');
            assert.strictEqual(result.vector, undefined);
            assert.ok(result.error?.includes('array of numbers'));
        });

        test('should reject array with non-numbers', () => {
            const result = parseVectorInput('[0.1, "text", 0.3]');
            assert.strictEqual(result.vector, undefined);
            assert.ok(result.error?.includes('array of numbers'));
        });

        test('should reject malformed JSON', () => {
            const result = parseVectorInput('[0.1, 0.2, 0.3');
            assert.strictEqual(result.vector, undefined);
            assert.ok(result.error?.includes('Invalid vector format'));
        });

        test('should return undefined for empty string', () => {
            const result = parseVectorInput('');
            assert.strictEqual(result.vector, undefined);
            assert.strictEqual(result.error, undefined);
        });

        test('should return undefined for whitespace only', () => {
            const result = parseVectorInput('   ');
            assert.strictEqual(result.vector, undefined);
            assert.strictEqual(result.error, undefined);
        });
    });

    suite('Filter Input Parsing', () => {

        test('should parse valid filter object', () => {
            const result = parseFilterInput('{"category": "tech"}');
            assert.ok(result.filter);
            assert.deepStrictEqual(result.filter, { category: 'tech' });
        });

        test('should parse complex filter with operators', () => {
            const input = '{"$and": [{"category": "tech"}, {"year": {"$gte": 2020}}]}';
            const result = parseFilterInput(input);
            assert.ok(result.filter);
            assert.ok(result.filter.$and);
        });

        test('should reject malformed JSON', () => {
            const result = parseFilterInput('{category: tech}');
            assert.strictEqual(result.filter, undefined);
            assert.ok(result.error?.includes('Invalid filter JSON'));
        });

        test('should return undefined for empty string', () => {
            const result = parseFilterInput('');
            assert.strictEqual(result.filter, undefined);
            assert.strictEqual(result.error, undefined);
        });
    });

    suite('Query Type Routing', () => {

        test('should use text search when text provided and embeddings available', () => {
            assert.strictEqual(shouldUseTextSearch('search query', true), true);
        });

        test('should not use text search when text empty', () => {
            assert.strictEqual(shouldUseTextSearch('', true), false);
        });

        test('should not use text search when only whitespace', () => {
            assert.strictEqual(shouldUseTextSearch('   ', true), false);
        });

        test('should not use text search when no integrated embeddings', () => {
            assert.strictEqual(shouldUseTextSearch('search query', false), false);
        });

        test('should not use text search when text undefined', () => {
            assert.strictEqual(shouldUseTextSearch(undefined, true), false);
        });
    });
});

// ============================================================================
// Chat Panel Logic Tests
// ============================================================================

/**
 * Simulates the streaming content accumulator from ChatPanel.
 */
class StreamingContentAccumulator {
    private content: string = '';
    private citations: Citation[] = [];
    private usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null = null;

    processChunk(chunk: StreamChunk): void {
        switch (chunk.type) {
            case 'content_chunk':
                this.content += (chunk as StreamContentDelta).delta.content;
                break;
            case 'citation':
                this.citations.push((chunk as StreamCitation).citation);
                break;
            case 'message_end':
                this.usage = (chunk as StreamMessageEnd).usage;
                break;
        }
    }

    getContent(): string { return this.content; }
    getCitations(): Citation[] { return this.citations; }
    getUsage() { return this.usage; }
    
    /**
     * Simulates abort behavior - appends abort message to content.
     */
    abort(): string {
        if (this.content) {
            return this.content + '\n\n[Response stopped by user]';
        }
        return '';
    }
    
    reset(): void {
        this.content = '';
        this.citations = [];
        this.usage = null;
    }
}

/**
 * Simulates message history management from ChatPanel.
 */
class MessageHistory {
    private messages: Array<{ role: string; content: string }> = [];

    addUserMessage(content: string): void {
        this.messages.push({ role: 'user', content });
    }

    addAssistantMessage(content: string): void {
        this.messages.push({ role: 'assistant', content });
    }

    removeLastMessage(): void {
        this.messages.pop();
    }

    getMessages(): Array<{ role: string; content: string }> {
        return [...this.messages];
    }

    clear(): void {
        this.messages = [];
    }
}

suite('Chat Panel Message Handling Tests', () => {

    suite('Authentication Error Detection', () => {

        test('should detect 401 status code', () => {
            assert.ok(isAuthError('Error 401: Unauthorized'));
        });

        test('should detect unauthorized keyword', () => {
            assert.ok(isAuthError('Request unauthorized'));
        });

        test('should detect token expired', () => {
            assert.ok(isAuthError('Your token expired'));
        });

        test('should detect authentication failed', () => {
            assert.ok(isAuthError('Authentication failed for user'));
        });

        test('should detect not authenticated', () => {
            assert.ok(isAuthError('User is not authenticated'));
        });

        test('should be case insensitive', () => {
            assert.ok(isAuthError('UNAUTHORIZED'));
            assert.ok(isAuthError('Token EXPIRED'));
        });

        test('should not flag regular errors', () => {
            assert.strictEqual(isAuthError('Network timeout'), false);
            assert.strictEqual(isAuthError('Internal server error'), false);
            assert.strictEqual(isAuthError('Index not found'), false);
        });
    });

    suite('Streaming Content Accumulation', () => {
        let accumulator: StreamingContentAccumulator;

        setup(() => {
            accumulator = new StreamingContentAccumulator();
        });

        test('should accumulate content chunks', () => {
            accumulator.processChunk({
                type: 'content_chunk',
                id: 'c1',
                model: 'gpt-4o',
                delta: { content: 'Hello ' }
            } as StreamContentDelta);

            accumulator.processChunk({
                type: 'content_chunk',
                id: 'c2',
                model: 'gpt-4o',
                delta: { content: 'world!' }
            } as StreamContentDelta);

            assert.strictEqual(accumulator.getContent(), 'Hello world!');
        });

        test('should collect citations', () => {
            const citation: Citation = {
                position: 10,
                references: [{
                    file: {
                        id: 'file-1',
                        name: 'document.pdf',
                        status: 'Available',
                        percent_done: 100,
                        created_on: '2024-01-01',
                        updated_on: '2024-01-01',
                        size: 1024,
                        multimodal: false
                    },
                    pages: [1, 2]
                }]
            };

            accumulator.processChunk({
                type: 'citation',
                id: 'cit-1',
                model: 'gpt-4o',
                citation
            } as StreamCitation);

            const citations = accumulator.getCitations();
            assert.strictEqual(citations.length, 1);
            assert.strictEqual(citations[0].position, 10);
        });

        test('should capture usage on message_end', () => {
            accumulator.processChunk({
                type: 'message_end',
                id: 'msg-1',
                model: 'gpt-4o',
                usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
            } as StreamMessageEnd);

            const usage = accumulator.getUsage();
            assert.ok(usage);
            assert.strictEqual(usage!.total_tokens, 150);
        });

        test('should handle complete stream sequence', () => {
            // Message start (ignored by accumulator)
            accumulator.processChunk({
                type: 'message_start',
                model: 'gpt-4o',
                role: 'assistant'
            });

            // Content chunks
            accumulator.processChunk({
                type: 'content_chunk',
                id: 'c1',
                model: 'gpt-4o',
                delta: { content: 'The answer is ' }
            } as StreamContentDelta);

            accumulator.processChunk({
                type: 'content_chunk',
                id: 'c2',
                model: 'gpt-4o',
                delta: { content: '42.' }
            } as StreamContentDelta);

            // Message end
            accumulator.processChunk({
                type: 'message_end',
                id: 'msg-1',
                model: 'gpt-4o',
                usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
            } as StreamMessageEnd);

            assert.strictEqual(accumulator.getContent(), 'The answer is 42.');
            assert.ok(accumulator.getUsage());
        });
    });

    suite('Stream Abort Handling', () => {
        let accumulator: StreamingContentAccumulator;

        setup(() => {
            accumulator = new StreamingContentAccumulator();
        });

        test('should append abort message to partial content', () => {
            accumulator.processChunk({
                type: 'content_chunk',
                id: 'c1',
                model: 'gpt-4o',
                delta: { content: 'Partial response' }
            } as StreamContentDelta);

            const abortedContent = accumulator.abort();
            assert.ok(abortedContent.includes('Partial response'));
            assert.ok(abortedContent.includes('[Response stopped by user]'));
        });

        test('should return empty string if no content on abort', () => {
            const abortedContent = accumulator.abort();
            assert.strictEqual(abortedContent, '');
        });
    });

    suite('Message History Management', () => {
        let history: MessageHistory;

        setup(() => {
            history = new MessageHistory();
        });

        test('should add user and assistant messages', () => {
            history.addUserMessage('Hello');
            history.addAssistantMessage('Hi there!');

            const messages = history.getMessages();
            assert.strictEqual(messages.length, 2);
            assert.strictEqual(messages[0].role, 'user');
            assert.strictEqual(messages[1].role, 'assistant');
        });

        test('should remove last message on error', () => {
            history.addUserMessage('First');
            history.addUserMessage('Failed message');
            
            // Simulate error - remove the failed message
            history.removeLastMessage();

            const messages = history.getMessages();
            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].content, 'First');
        });

        test('should clear all messages', () => {
            history.addUserMessage('Message 1');
            history.addAssistantMessage('Response 1');
            
            history.clear();

            assert.strictEqual(history.getMessages().length, 0);
        });

        test('should return copy of messages', () => {
            history.addUserMessage('Test');
            const messages = history.getMessages();
            
            // Modifying returned array should not affect internal state
            messages.push({ role: 'user', content: 'External' });
            
            assert.strictEqual(history.getMessages().length, 1);
        });
    });
});

// ============================================================================
// TopK Parsing Tests
// ============================================================================

suite('Query Parameter Parsing Tests', () => {

    /**
     * Parses topK parameter with default fallback.
     * Mirrors logic in QueryPanel.handleQuery().
     */
    function parseTopK(topKStr: string | undefined): number {
        return parseInt(topKStr || '10', 10) || 10;
    }

    test('should parse valid topK number', () => {
        assert.strictEqual(parseTopK('5'), 5);
        assert.strictEqual(parseTopK('100'), 100);
    });

    test('should use default for empty string', () => {
        assert.strictEqual(parseTopK(''), 10);
    });

    test('should use default for undefined', () => {
        assert.strictEqual(parseTopK(undefined), 10);
    });

    test('should use default for non-numeric string', () => {
        assert.strictEqual(parseTopK('invalid'), 10);
    });
});
