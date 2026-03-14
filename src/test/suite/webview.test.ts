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
 * Parses comma-separated values used for query fields/rerank rank_fields.
 */
function parseCsvValues(input: string | undefined): string[] {
    return (input || '')
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
}

function normalizeInferenceEntries(values: unknown[]): Array<Record<string, unknown>> {
    const normalized: Array<Record<string, unknown>> = [];
    for (const entry of values) {
        if (typeof entry === 'string') {
            const text = entry.trim();
            if (text) {
                normalized.push({ text });
            }
            continue;
        }
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
            normalized.push(entry as Record<string, unknown>);
            continue;
        }
        throw new Error('Invalid entry');
    }
    return normalized;
}

function parseInferenceEmbedInputs(raw: string): Array<Record<string, unknown>> {
    const trimmed = raw.trim();
    if (!trimmed) {
        throw new Error('Embed inputs are required.');
    }
    try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
            return normalizeInferenceEntries(parsed);
        }
    } catch {
        // ignore and fallback to newline
    }
    return trimmed.split('\n').map(v => v.trim()).filter(Boolean).map(text => ({ text }));
}

function parseInferenceRerankDocuments(raw: string): Array<Record<string, unknown>> {
    const trimmed = raw.trim();
    if (!trimmed) {
        throw new Error('At least one document is required for rerank.');
    }
    try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
            return normalizeInferenceEntries(parsed);
        }
    } catch {
        // ignore and fallback to newline
    }
    const docs = trimmed.split('\n').map(v => v.trim()).filter(Boolean).map(text => ({ text }));
    if (!docs.length) {
        throw new Error('At least one document is required for rerank.');
    }
    return docs;
}

function buildTextPreviewState(fullText: string, maxLength: number = 300): {
    fullText: string;
    collapsedText: string;
    isExpandable: boolean;
    isExpanded: boolean;
} {
    const isExpandable = fullText.length > maxLength;
    return {
        fullText,
        collapsedText: isExpandable ? `${fullText.slice(0, maxLength)}...` : fullText,
        isExpandable,
        isExpanded: false
    };
}

function toggleTextPreview(state: {
    fullText: string;
    collapsedText: string;
    isExpandable: boolean;
    isExpanded: boolean;
}): string {
    if (!state.isExpandable) {
        return state.fullText;
    }
    state.isExpanded = !state.isExpanded;
    return state.isExpanded ? state.fullText : state.collapsedText;
}

const API_KEY_ROLE = {
    projectEditor: 'ProjectEditor',
    projectViewer: 'ProjectViewer',
    controlPlaneEditor: 'ControlPlaneEditor',
    controlPlaneViewer: 'ControlPlaneViewer',
    dataPlaneEditor: 'DataPlaneEditor',
    dataPlaneViewer: 'DataPlaneViewer'
} as const;

type ApiKeyRole = typeof API_KEY_ROLE[keyof typeof API_KEY_ROLE];

function normalizeApiKeyRoles(currentRoles: ApiKeyRole[], previousRoles: ApiKeyRole[]): ApiKeyRole[] {
    const selection = new Set<ApiKeyRole>(currentRoles);
    const previous = new Set<ApiKeyRole>(previousRoles);
    const preferredRole = currentRoles.find(role => !previous.has(role));

    const resolveExclusive = (a: ApiKeyRole, b: ApiKeyRole): void => {
        if (!selection.has(a) || !selection.has(b)) {
            return;
        }
        if (preferredRole === b) {
            selection.delete(a);
            return;
        }
        selection.delete(b);
    };

    resolveExclusive(API_KEY_ROLE.projectEditor, API_KEY_ROLE.projectViewer);
    resolveExclusive(API_KEY_ROLE.controlPlaneEditor, API_KEY_ROLE.controlPlaneViewer);
    resolveExclusive(API_KEY_ROLE.dataPlaneEditor, API_KEY_ROLE.dataPlaneViewer);

    const projectSelected = selection.has(API_KEY_ROLE.projectEditor) || selection.has(API_KEY_ROLE.projectViewer);
    const controlPlaneSelected = selection.has(API_KEY_ROLE.controlPlaneEditor) || selection.has(API_KEY_ROLE.controlPlaneViewer);
    const dataPlaneSelected = selection.has(API_KEY_ROLE.dataPlaneEditor) || selection.has(API_KEY_ROLE.dataPlaneViewer);
    const planeSelected = controlPlaneSelected || dataPlaneSelected;

    if (projectSelected && planeSelected) {
        const preferredIsProject = preferredRole === API_KEY_ROLE.projectEditor || preferredRole === API_KEY_ROLE.projectViewer;
        if (preferredIsProject) {
            selection.delete(API_KEY_ROLE.controlPlaneEditor);
            selection.delete(API_KEY_ROLE.controlPlaneViewer);
            selection.delete(API_KEY_ROLE.dataPlaneEditor);
            selection.delete(API_KEY_ROLE.dataPlaneViewer);
        } else {
            selection.delete(API_KEY_ROLE.projectEditor);
            selection.delete(API_KEY_ROLE.projectViewer);
        }
    }

    if (selection.size === 0) {
        selection.add(API_KEY_ROLE.projectEditor);
    }

    return Array.from(selection);
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

    suite('Query Advanced Options Parsing', () => {
        test('should parse comma-separated fields', () => {
            assert.deepStrictEqual(parseCsvValues('title, url , text'), ['title', 'url', 'text']);
        });
    });

    suite('Query Result Text Preview Actions', () => {
        test('should collapse long preview text and append ellipsis', () => {
            const longText = 'x'.repeat(350);
            const state = buildTextPreviewState(longText);
            assert.strictEqual(state.isExpandable, true);
            assert.strictEqual(state.collapsedText.length, 303);
            assert.ok(state.collapsedText.endsWith('...'));
        });

        test('should toggle between collapsed and full text', () => {
            const longText = 'x'.repeat(350);
            const state = buildTextPreviewState(longText);

            const expanded = toggleTextPreview(state);
            assert.strictEqual(expanded, longText);
            assert.strictEqual(state.isExpanded, true);

            const collapsed = toggleTextPreview(state);
            assert.strictEqual(collapsed, state.collapsedText);
            assert.strictEqual(state.isExpanded, false);
        });

        test('copy payload should always use full text, not truncated preview', () => {
            const longText = 'x'.repeat(350);
            const state = buildTextPreviewState(longText);
            assert.notStrictEqual(state.collapsedText, longText);
            assert.strictEqual(state.fullText, longText);
        });
    });

    suite('Inference Payload Parsing', () => {
        test('embed input newline text maps to object array', () => {
            const parsed = parseInferenceEmbedInputs('hello\nworld');
            assert.deepStrictEqual(parsed, [{ text: 'hello' }, { text: 'world' }]);
        });

        test('embed input JSON string array maps to object array', () => {
            const parsed = parseInferenceEmbedInputs('["hello"]');
            assert.deepStrictEqual(parsed, [{ text: 'hello' }]);
        });

        test('rerank documents newline text maps to object array', () => {
            const parsed = parseInferenceRerankDocuments('doc one\ndoc two');
            assert.deepStrictEqual(parsed, [{ text: 'doc one' }, { text: 'doc two' }]);
        });

        test('rerank documents JSON object array is preserved', () => {
            const parsed = parseInferenceRerankDocuments('[{"text":"doc one","id":"1"}]');
            assert.deepStrictEqual(parsed, [{ text: 'doc one', id: '1' }]);
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

suite('API Key Role Selection Rules', () => {
    function asSorted(roles: ApiKeyRole[]): string[] {
        return [...roles].sort();
    }

    test('defaults to ProjectEditor role set when no roles are selected', () => {
        const normalized = normalizeApiKeyRoles([], []);
        assert.deepStrictEqual(asSorted(normalized), [API_KEY_ROLE.projectEditor]);
    });

    test('project role mode keeps only a project role', () => {
        const normalized = normalizeApiKeyRoles([API_KEY_ROLE.projectEditor], []);
        assert.deepStrictEqual(asSorted(normalized), [API_KEY_ROLE.projectEditor]);
    });

    test('project viewer mode keeps only ProjectViewer', () => {
        const normalized = normalizeApiKeyRoles([API_KEY_ROLE.projectViewer], []);
        assert.deepStrictEqual(asSorted(normalized), [API_KEY_ROLE.projectViewer]);
    });

    test('control-plane and data-plane roles can be selected without project role', () => {
        const normalized = normalizeApiKeyRoles([
            API_KEY_ROLE.controlPlaneViewer,
            API_KEY_ROLE.dataPlaneEditor
        ], []);
        assert.deepStrictEqual(asSorted(normalized), asSorted([
            API_KEY_ROLE.controlPlaneViewer,
            API_KEY_ROLE.dataPlaneEditor
        ]));
    });

    test('pairwise editor/viewer conflicts keep the newest role in that pair', () => {
        const normalized = normalizeApiKeyRoles([
            API_KEY_ROLE.controlPlaneEditor,
            API_KEY_ROLE.controlPlaneViewer
        ], [API_KEY_ROLE.controlPlaneEditor]);
        assert.deepStrictEqual(normalized, [API_KEY_ROLE.controlPlaneViewer]);
    });

    test('selecting a project role clears control/data role mode', () => {
        const normalized = normalizeApiKeyRoles([
            API_KEY_ROLE.controlPlaneViewer,
            API_KEY_ROLE.dataPlaneEditor,
            API_KEY_ROLE.projectViewer
        ], [API_KEY_ROLE.controlPlaneViewer, API_KEY_ROLE.dataPlaneEditor]);
        assert.deepStrictEqual(asSorted(normalized), [API_KEY_ROLE.projectViewer]);
    });

    test('selecting control/data roles clears project role mode', () => {
        const normalized = normalizeApiKeyRoles([
            API_KEY_ROLE.projectEditor,
            API_KEY_ROLE.controlPlaneViewer,
            API_KEY_ROLE.dataPlaneEditor
        ], [API_KEY_ROLE.projectEditor]);
        assert.deepStrictEqual(asSorted(normalized), asSorted([
            API_KEY_ROLE.controlPlaneViewer,
            API_KEY_ROLE.dataPlaneEditor
        ]));
    });
});
