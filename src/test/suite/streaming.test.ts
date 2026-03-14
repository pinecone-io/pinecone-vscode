import * as assert from 'assert';
import { AssistantApi, StreamChatOptions } from '../../api/assistantApi';
import { PineconeClient } from '../../api/client';
import { StreamChunk, StreamContentDelta, StreamCitation, StreamMessageEnd } from '../../api/types';

function createApi(): AssistantApi {
    const clientStub = {
        request: async (): Promise<unknown> => {
            throw new Error('request should not be used in parser tests');
        }
    };

    return new AssistantApi(clientStub as unknown as PineconeClient);
}

function createStreamOptions(chunks: StreamChunk[]): StreamChatOptions {
    return {
        onChunk: (chunk: StreamChunk) => chunks.push(chunk),
        onError: () => undefined,
        onComplete: () => undefined
    };
}

suite('AssistantApi Streaming Parser (Production Methods)', () => {
    test('processSSELine emits content_chunk for valid SSE data', () => {
        const api = createApi() as unknown as {
            processSSELine: (line: string, options: StreamChatOptions) => void;
        };
        const chunks: StreamChunk[] = [];

        api.processSSELine(
            'data: {"type":"content_chunk","id":"c1","model":"gpt-4o","delta":{"content":"hello"}}',
            createStreamOptions(chunks)
        );

        assert.strictEqual(chunks.length, 1);
        const chunk = chunks[0] as StreamContentDelta;
        assert.strictEqual(chunk.type, 'content_chunk');
        assert.strictEqual(chunk.delta.content, 'hello');
    });

    test('processSSELine emits citation and message_end chunks with valid payloads', () => {
        const api = createApi() as unknown as {
            processSSELine: (line: string, options: StreamChatOptions) => void;
        };
        const chunks: StreamChunk[] = [];

        api.processSSELine(
            'data: {"type":"citation","id":"cit-1","model":"gpt-4o","citation":{"position":12,"references":[]}}',
            createStreamOptions(chunks)
        );
        api.processSSELine(
            'data: {"type":"message_end","id":"m1","model":"gpt-4o","usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3}}',
            createStreamOptions(chunks)
        );

        assert.strictEqual(chunks.length, 2);
        const citation = chunks[0] as StreamCitation;
        const end = chunks[1] as StreamMessageEnd;

        assert.strictEqual(citation.type, 'citation');
        assert.strictEqual(citation.citation.position, 12);
        assert.strictEqual(end.type, 'message_end');
        assert.strictEqual(end.usage.total_tokens, 3);
    });

    test('processSSELine ignores malformed JSON without throwing', () => {
        const api = createApi() as unknown as {
            processSSELine: (line: string, options: StreamChatOptions) => void;
        };
        const chunks: StreamChunk[] = [];

        api.processSSELine('data: {invalid-json}', createStreamOptions(chunks));

        assert.strictEqual(chunks.length, 0);
    });

    test('parseStreamChunk returns null for unknown or invalid chunk shapes', () => {
        const api = createApi() as unknown as {
            parseStreamChunk: (data: Record<string, unknown>) => StreamChunk | null;
        };

        const unknownType = api.parseStreamChunk({ type: 'unknown_type' });
        const invalidContent = api.parseStreamChunk({ type: 'content_chunk', id: 'c1', model: 'gpt-4o' });

        assert.strictEqual(unknownType, null);
        assert.strictEqual(invalidContent, null);
    });

    test('parseStreamChunk tolerates content chunks without explicit type', () => {
        const api = createApi() as unknown as {
            parseStreamChunk: (data: Record<string, unknown>) => StreamChunk | null;
        };

        const chunk = api.parseStreamChunk({
            id: 'fallback-id',
            model: 'gpt-4o',
            delta: { content: 'fallback content' }
        });

        assert.ok(chunk);
        assert.strictEqual(chunk!.type, 'content_chunk');
        assert.strictEqual((chunk as StreamContentDelta).delta.content, 'fallback content');
    });

    test('processSSELine ignores comments and non-data lines', () => {
        const api = createApi() as unknown as {
            processSSELine: (line: string, options: StreamChatOptions) => void;
        };
        const chunks: StreamChunk[] = [];

        api.processSSELine(': keepalive', createStreamOptions(chunks));
        api.processSSELine('event: ping', createStreamOptions(chunks));
        api.processSSELine('', createStreamOptions(chunks));

        assert.strictEqual(chunks.length, 0);
    });

    test('processSSELine accepts raw JSON payload lines without data prefix', () => {
        const api = createApi() as unknown as {
            processSSELine: (line: string, options: StreamChatOptions) => void;
        };
        const chunks: StreamChunk[] = [];

        api.processSSELine(
            '{"type":"content_chunk","id":"c1","model":"gpt-4o","delta":{"content":"hello"}}',
            createStreamOptions(chunks)
        );

        assert.strictEqual(chunks.length, 1);
        const chunk = chunks[0] as StreamContentDelta;
        assert.strictEqual(chunk.type, 'content_chunk');
        assert.strictEqual(chunk.delta.content, 'hello');
    });

    test('processSSELine converts [DONE] sentinel to message_end', () => {
        const api = createApi() as unknown as {
            processSSELine: (line: string, options: StreamChatOptions) => void;
        };
        const chunks: StreamChunk[] = [];

        api.processSSELine('data: [DONE]', createStreamOptions(chunks));

        assert.strictEqual(chunks.length, 1);
        const chunk = chunks[0] as StreamMessageEnd;
        assert.strictEqual(chunk.type, 'message_end');
        assert.strictEqual(chunk.id, 'done');
    });

    test('parseStreamChunk maps variant done/content shapes to known chunk types', () => {
        const api = createApi() as unknown as {
            parseStreamChunk: (data: Record<string, unknown>) => StreamChunk | null;
        };

        const contentChunk = api.parseStreamChunk({
            type: 'message_delta',
            content: 'hello from variant'
        });
        const doneChunk = api.parseStreamChunk({ type: 'done' });

        assert.ok(contentChunk);
        assert.strictEqual(contentChunk!.type, 'content_chunk');
        assert.strictEqual((contentChunk as StreamContentDelta).delta.content, 'hello from variant');

        assert.ok(doneChunk);
        assert.strictEqual(doneChunk!.type, 'message_end');
    });
});
