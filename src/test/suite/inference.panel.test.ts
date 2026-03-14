import * as assert from 'assert';
import { InferencePanel } from '../../webview/inferencePanel';

suite('InferencePanel helpers', () => {
    interface InferencePanelTestHarness {
        modelsByName: Map<string, Record<string, unknown>>;
        applyRerankTokenBudget: (
            model: string,
            query: string,
            documents: Array<Record<string, unknown>>,
            tokenLimitOverride?: number
        ) => { documents: Array<Record<string, unknown>>; truncatedDocuments: number; tokenLimit: number };
        estimateTokenCount: (text: string) => number;
        resolveRerankPairTokenLimit: (model: string) => number;
        buildEmbedParameters: (model: string, inputType: string) => Record<string, unknown> | undefined;
        extractEmbedInputText: (input: Record<string, unknown>) => string;
        extractTokenLimitFromError: (error: unknown) => number | undefined;
    }

    function createPanelLike(models?: Array<{ name: string; maxTokens?: number; contextLength?: number }>): InferencePanelTestHarness {
        const panelLike = Object.create(InferencePanel.prototype) as InferencePanelTestHarness;
        const map = new Map<string, Record<string, unknown>>();
        (models || []).forEach(model => {
            map.set(model.name.toLowerCase(), {
                max_tokens_per_query_document_pair: model.maxTokens,
                context_length: model.contextLength
            });
        });
        panelLike.modelsByName = map;
        return panelLike;
    }

    test('applyRerankTokenBudget truncates oversized documents to fit pair token limit', () => {
        const panelLike = createPanelLike([{ name: 'bge-reranker-v2-m3', maxTokens: 1024 }]);
        const query = Array.from({ length: 32 }).map((_, i) => `q${i}`).join(' ');
        const longDocument = Array.from({ length: 4000 }).map((_, i) => `token${i}`).join(' ');

        const result = panelLike.applyRerankTokenBudget('bge-reranker-v2-m3', query, [{ text: longDocument }]);
        const truncated = String(result.documents[0].text || '');

        assert.strictEqual(result.tokenLimit, 1024);
        assert.strictEqual(result.truncatedDocuments, 1);
        assert.ok(truncated.length < longDocument.length);

        const pairEstimate = panelLike.estimateTokenCount(query) + panelLike.estimateTokenCount(truncated);
        assert.ok(pairEstimate <= 1024);
    });

    test('applyRerankTokenBudget respects an explicit token limit override', () => {
        const panelLike = createPanelLike([{ name: 'bge-reranker-v2-m3', maxTokens: 1024 }]);
        const query = Array.from({ length: 40 }).map((_, i) => `q${i}`).join(' ');
        const longDocument = Array.from({ length: 6000 }).map((_, i) => `piece${i}`).join(' ');

        const result = panelLike.applyRerankTokenBudget('bge-reranker-v2-m3', query, [{ text: longDocument }], 512);
        assert.strictEqual(result.tokenLimit, 512);

        const truncated = String(result.documents[0].text || '');
        const pairEstimate = panelLike.estimateTokenCount(query) + panelLike.estimateTokenCount(truncated);
        assert.ok(pairEstimate <= 512);
    });

    test('applyRerankTokenBudget keeps short documents unchanged', () => {
        const panelLike = createPanelLike([{ name: 'cohere-rerank-3.5', maxTokens: 1024 }]);
        const query = 'cozy games with pixel art';
        const shortDocument = 'A short document that should not be truncated.';

        const result = panelLike.applyRerankTokenBudget('cohere-rerank-3.5', query, [{ text: shortDocument }]);
        assert.strictEqual(result.truncatedDocuments, 0);
        assert.strictEqual(result.documents[0].text, shortDocument);
    });

    test('resolveRerankPairTokenLimit falls back to default when metadata is missing', () => {
        const panelLike = createPanelLike();
        const limit = panelLike.resolveRerankPairTokenLimit('unknown-reranker');
        assert.strictEqual(limit, 1024);
    });

    test('resolveRerankPairTokenLimit applies known pinecone rerank fallback', () => {
        const panelLike = createPanelLike();
        const limit = panelLike.resolveRerankPairTokenLimit('pinecone-rerank-v0');
        assert.strictEqual(limit, 512);
    });

    test('buildEmbedParameters defaults input_type to query when omitted', () => {
        const panelLike = createPanelLike();
        const parameters = panelLike.buildEmbedParameters('llama-text-embed-v2', '');
        assert.deepStrictEqual(parameters, { input_type: 'query' });
    });

    test('buildEmbedParameters preserves explicit input_type', () => {
        const panelLike = createPanelLike();
        const parameters = panelLike.buildEmbedParameters('llama-text-embed-v2', 'passage');
        assert.deepStrictEqual(parameters, { input_type: 'passage' });
    });

    test('buildEmbedParameters forces sparse models to passage', () => {
        const panelLike = createPanelLike();
        const parameters = panelLike.buildEmbedParameters('pinecone-sparse-english-v0', 'query');
        assert.deepStrictEqual(parameters, { input_type: 'passage' });
    });

    test('extractEmbedInputText prefers text field and falls back to first string', () => {
        const panelLike = createPanelLike();
        assert.strictEqual(panelLike.extractEmbedInputText({ text: 'hello world' }), 'hello world');
        assert.strictEqual(panelLike.extractEmbedInputText({ content: 'fallback text' }), 'fallback text');
    });

    test('extractTokenLimitFromError parses strict token limit from API error text', () => {
        const panelLike = createPanelLike();
        const limit = panelLike.extractTokenLimitFromError(
            '{"error":{"code":"INVALID_ARGUMENT","message":"Request contains a query+document pair with 1012 tokens, which exceeds the maximum token limit of 512 for each query+document pair."},"status":400}'
        );
        assert.strictEqual(limit, 512);
    });

    test('getPanelKey prefers current project context over target project', () => {
        const panelClass = InferencePanel as unknown as {
            getPanelKey: (service: {
                getCurrentProjectContext: () => { id: string };
                getTargetProject: () => { id: string };
            }) => string;
        };
        const key = panelClass.getPanelKey({
            getCurrentProjectContext: () => ({ id: 'Project-A' }),
            getTargetProject: () => ({ id: 'Project-B' })
        });

        assert.strictEqual(key, 'project-a');
    });
});
