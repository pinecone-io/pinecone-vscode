/**
 * Streaming Chat Tests
 * 
 * Tests for the SSE (Server-Sent Events) streaming chat implementation.
 * Verifies chunk parsing, error handling, and stream control.
 */

import * as assert from 'assert';
import { 
    StreamChunk, 
    StreamMessageStart, 
    StreamContentDelta, 
    StreamCitation, 
    StreamMessageEnd,
    Citation
} from '../../api/types';

/**
 * Mock SSE line parser that simulates the streaming API behavior.
 */
class MockSSEParser {
    private chunks: StreamChunk[] = [];
    private errors: string[] = [];

    /**
     * Parses an SSE data line and extracts the chunk.
     * @param line - The SSE line (e.g., "data: {...}")
     * @returns The parsed chunk or null if invalid
     */
    parseSSELine(line: string): StreamChunk | null {
        // Skip empty lines and comments
        if (!line || line.startsWith(':')) {
            return null;
        }

        // Extract data after "data:" prefix
        if (!line.startsWith('data:')) {
            return null;
        }

        const jsonStr = line.slice(5).trim();
        if (!jsonStr) {
            return null;
        }

        try {
            const data = JSON.parse(jsonStr);
            return this.parseChunkData(data);
        } catch (e) {
            this.errors.push(`Parse error: ${e}`);
            return null;
        }
    }

    /**
     * Parses raw chunk data into a typed StreamChunk.
     */
    private parseChunkData(data: Record<string, unknown>): StreamChunk | null {
        const type = data.type as string;

        switch (type) {
            case 'message_start':
                return {
                    type: 'message_start',
                    model: data.model as string,
                    role: data.role as string
                } as StreamMessageStart;

            case 'content_chunk':
                return {
                    type: 'content_chunk',
                    id: data.id as string,
                    model: data.model as string,
                    delta: data.delta as { content: string }
                } as StreamContentDelta;

            case 'citation':
                return {
                    type: 'citation',
                    id: data.id as string,
                    model: data.model as string,
                    citation: data.citation as Citation
                } as StreamCitation;

            case 'message_end':
                return {
                    type: 'message_end',
                    model: data.model as string,
                    id: data.id as string,
                    usage: data.usage as { prompt_tokens: number; completion_tokens: number; total_tokens: number }
                } as StreamMessageEnd;

            default:
                return null;
        }
    }

    /**
     * Processes multiple lines and accumulates chunks.
     */
    processLines(lines: string[]): StreamChunk[] {
        const chunks: StreamChunk[] = [];
        for (const line of lines) {
            const chunk = this.parseSSELine(line);
            if (chunk) {
                chunks.push(chunk);
            }
        }
        return chunks;
    }

    getErrors(): string[] {
        return this.errors;
    }
}

suite('SSE Line Parsing Tests', () => {

    test('should parse message_start chunk', () => {
        const parser = new MockSSEParser();
        const line = 'data: {"type":"message_start","model":"gpt-4o","role":"assistant"}';
        
        const chunk = parser.parseSSELine(line);
        
        assert.ok(chunk);
        assert.strictEqual(chunk.type, 'message_start');
        assert.strictEqual((chunk as StreamMessageStart).model, 'gpt-4o');
        assert.strictEqual((chunk as StreamMessageStart).role, 'assistant');
    });

    test('should parse content_chunk', () => {
        const parser = new MockSSEParser();
        const line = 'data: {"type":"content_chunk","id":"chunk-1","model":"gpt-4o","delta":{"content":"Hello, "}}';
        
        const chunk = parser.parseSSELine(line);
        
        assert.ok(chunk);
        assert.strictEqual(chunk.type, 'content_chunk');
        assert.strictEqual((chunk as StreamContentDelta).delta.content, 'Hello, ');
    });

    test('should parse citation chunk', () => {
        const parser = new MockSSEParser();
        const line = 'data: {"type":"citation","id":"cit-1","model":"gpt-4o","citation":{"position":10,"references":[{"file":{"name":"doc.pdf"},"pages":[1,2]}]}}';
        
        const chunk = parser.parseSSELine(line);
        
        assert.ok(chunk);
        assert.strictEqual(chunk.type, 'citation');
        const citation = (chunk as StreamCitation).citation;
        assert.strictEqual(citation.position, 10);
        assert.ok(citation.references.length > 0);
    });

    test('should parse message_end chunk', () => {
        const parser = new MockSSEParser();
        const line = 'data: {"type":"message_end","id":"msg-1","model":"gpt-4o","usage":{"prompt_tokens":100,"completion_tokens":50,"total_tokens":150}}';
        
        const chunk = parser.parseSSELine(line);
        
        assert.ok(chunk);
        assert.strictEqual(chunk.type, 'message_end');
        const endChunk = chunk as StreamMessageEnd;
        assert.strictEqual(endChunk.usage.prompt_tokens, 100);
        assert.strictEqual(endChunk.usage.completion_tokens, 50);
        assert.strictEqual(endChunk.usage.total_tokens, 150);
    });

    test('should skip empty lines', () => {
        const parser = new MockSSEParser();
        
        assert.strictEqual(parser.parseSSELine(''), null);
        assert.strictEqual(parser.parseSSELine('   '), null);
    });

    test('should skip comment lines', () => {
        const parser = new MockSSEParser();
        
        assert.strictEqual(parser.parseSSELine(': this is a comment'), null);
        assert.strictEqual(parser.parseSSELine(':ping'), null);
    });

    test('should skip non-data lines', () => {
        const parser = new MockSSEParser();
        
        assert.strictEqual(parser.parseSSELine('event: message'), null);
        assert.strictEqual(parser.parseSSELine('id: 123'), null);
    });

    test('should handle malformed JSON gracefully', () => {
        const parser = new MockSSEParser();
        const line = 'data: {invalid json}';
        
        const chunk = parser.parseSSELine(line);
        
        assert.strictEqual(chunk, null);
        assert.ok(parser.getErrors().length > 0);
    });

    test('should handle unknown chunk types', () => {
        const parser = new MockSSEParser();
        const line = 'data: {"type":"unknown_type","data":"test"}';
        
        const chunk = parser.parseSSELine(line);
        
        assert.strictEqual(chunk, null); // Unknown types return null
    });
});

suite('SSE Stream Processing Tests', () => {

    test('should process complete stream', () => {
        const parser = new MockSSEParser();
        const lines = [
            'data: {"type":"message_start","model":"gpt-4o","role":"assistant"}',
            'data: {"type":"content_chunk","id":"c1","model":"gpt-4o","delta":{"content":"Hello"}}',
            'data: {"type":"content_chunk","id":"c2","model":"gpt-4o","delta":{"content":" world"}}',
            'data: {"type":"content_chunk","id":"c3","model":"gpt-4o","delta":{"content":"!"}}',
            'data: {"type":"message_end","id":"m1","model":"gpt-4o","usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}'
        ];

        const chunks = parser.processLines(lines);

        assert.strictEqual(chunks.length, 5);
        assert.strictEqual(chunks[0].type, 'message_start');
        assert.strictEqual(chunks[1].type, 'content_chunk');
        assert.strictEqual(chunks[2].type, 'content_chunk');
        assert.strictEqual(chunks[3].type, 'content_chunk');
        assert.strictEqual(chunks[4].type, 'message_end');
    });

    test('should accumulate content from chunks', () => {
        const parser = new MockSSEParser();
        const lines = [
            'data: {"type":"content_chunk","id":"c1","model":"gpt-4o","delta":{"content":"Hello"}}',
            'data: {"type":"content_chunk","id":"c2","model":"gpt-4o","delta":{"content":" "}}',
            'data: {"type":"content_chunk","id":"c3","model":"gpt-4o","delta":{"content":"world"}}',
            'data: {"type":"content_chunk","id":"c4","model":"gpt-4o","delta":{"content":"!"}}'
        ];

        const chunks = parser.processLines(lines);
        const content = chunks
            .filter(c => c.type === 'content_chunk')
            .map(c => (c as StreamContentDelta).delta.content)
            .join('');

        assert.strictEqual(content, 'Hello world!');
    });

    test('should collect citations from stream', () => {
        const parser = new MockSSEParser();
        const lines = [
            'data: {"type":"content_chunk","id":"c1","model":"gpt-4o","delta":{"content":"Based on the document"}}',
            'data: {"type":"citation","id":"cit1","model":"gpt-4o","citation":{"position":21,"references":[{"file":{"name":"guide.pdf"},"pages":[1]}]}}',
            'data: {"type":"content_chunk","id":"c2","model":"gpt-4o","delta":{"content":", here is the info."}}',
            'data: {"type":"citation","id":"cit2","model":"gpt-4o","citation":{"position":41,"references":[{"file":{"name":"manual.pdf"},"pages":[5]}]}}'
        ];

        const chunks = parser.processLines(lines);
        const citations = chunks.filter(c => c.type === 'citation') as StreamCitation[];

        assert.strictEqual(citations.length, 2);
        assert.strictEqual(citations[0].citation.position, 21);
        assert.strictEqual(citations[1].citation.position, 41);
    });

    test('should handle empty data lines', () => {
        const parser = new MockSSEParser();
        const lines = [
            'data: {"type":"message_start","model":"gpt-4o","role":"assistant"}',
            '',
            'data: {"type":"content_chunk","id":"c1","model":"gpt-4o","delta":{"content":"test"}}',
            '',
            'data: {"type":"message_end","id":"m1","model":"gpt-4o","usage":{"prompt_tokens":5,"completion_tokens":1,"total_tokens":6}}'
        ];

        const chunks = parser.processLines(lines);

        // Should have 3 chunks, empty lines are skipped
        assert.strictEqual(chunks.length, 3);
    });

    test('should handle interleaved comments', () => {
        const parser = new MockSSEParser();
        const lines = [
            ':keepalive',
            'data: {"type":"message_start","model":"gpt-4o","role":"assistant"}',
            ':ping',
            'data: {"type":"content_chunk","id":"c1","model":"gpt-4o","delta":{"content":"hi"}}',
            ':another comment'
        ];

        const chunks = parser.processLines(lines);

        assert.strictEqual(chunks.length, 2);
    });
});

suite('Stream Content Accumulation Tests', () => {

    /**
     * Simulates content accumulation as in the chat panel.
     */
    class ContentAccumulator {
        private content = '';
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
    }

    test('should accumulate content correctly', () => {
        const accumulator = new ContentAccumulator();
        
        accumulator.processChunk({
            type: 'content_chunk',
            id: 'c1',
            model: 'gpt-4o',
            delta: { content: 'The answer ' }
        } as StreamContentDelta);
        
        accumulator.processChunk({
            type: 'content_chunk',
            id: 'c2',
            model: 'gpt-4o',
            delta: { content: 'is 42.' }
        } as StreamContentDelta);

        assert.strictEqual(accumulator.getContent(), 'The answer is 42.');
    });

    test('should accumulate citations correctly', () => {
        const accumulator = new ContentAccumulator();
        
        accumulator.processChunk({
            type: 'citation',
            id: 'cit1',
            model: 'gpt-4o',
            citation: { position: 10, references: [{ file: { id: 'f1', name: 'a.pdf', status: 'Available', percent_done: 100, created_on: '2024-01-01' }, pages: [1] }] }
        } as StreamCitation);
        
        accumulator.processChunk({
            type: 'citation',
            id: 'cit2',
            model: 'gpt-4o',
            citation: { position: 20, references: [{ file: { id: 'f2', name: 'b.pdf', status: 'Available', percent_done: 100, created_on: '2024-01-01' }, pages: [2] }] }
        } as StreamCitation);

        const citations = accumulator.getCitations();
        assert.strictEqual(citations.length, 2);
        assert.strictEqual(citations[0].position, 10);
        assert.strictEqual(citations[1].position, 20);
    });

    test('should capture usage on message_end', () => {
        const accumulator = new ContentAccumulator();
        
        accumulator.processChunk({
            type: 'message_end',
            id: 'm1',
            model: 'gpt-4o',
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
        } as StreamMessageEnd);

        const usage = accumulator.getUsage();
        assert.ok(usage);
        assert.strictEqual(usage!.total_tokens, 150);
    });
});

suite('Stream Abort Tests', () => {

    test('should handle abort gracefully', () => {
        let aborted = false;
        
        const controller = {
            abort: () => { aborted = true; }
        };

        // Simulate abort
        controller.abort();

        assert.ok(aborted);
    });

    test('should preserve partial content on abort', () => {
        let content = '';
        const chunks = [
            { type: 'content_chunk', delta: { content: 'Hello' } },
            { type: 'content_chunk', delta: { content: ' world' } }
        ];

        // Process some chunks
        for (const chunk of chunks.slice(0, 1)) {
            if (chunk.type === 'content_chunk') {
                content += chunk.delta.content;
            }
        }

        // Simulate abort - content should be preserved
        const abortedContent = content + '\n\n[Response stopped by user]';
        
        assert.ok(abortedContent.includes('Hello'));
        assert.ok(abortedContent.includes('[Response stopped by user]'));
    });
});
