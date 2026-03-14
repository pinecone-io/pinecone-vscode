import * as assert from 'assert';
import { resolveUploadMetadataPayload } from '../../webview/uploadMetadataDialog';

suite('Upload Metadata Dialog Parsing', () => {
    test('applies batch metadata to all files', () => {
        const parsed = resolveUploadMetadataPayload({
            batchMetadata: '{"team":"search","source":"batch"}',
            batchMultimodal: true,
            files: [
                { filePath: '/tmp/a.pdf', metadata: '{"ignored":true}', multimodal: false },
                { filePath: '/tmp/b.txt', metadata: '', multimodal: false }
            ]
        });

        assert.strictEqual(parsed.error, undefined);
        assert.ok(parsed.value);
        assert.strictEqual(parsed.value?.length, 2);
        assert.deepStrictEqual(parsed.value?.[0], {
            filePath: '/tmp/a.pdf',
            metadata: { team: 'search', source: 'batch' },
            multimodal: true
        });
        assert.deepStrictEqual(parsed.value?.[1], {
            filePath: '/tmp/b.txt',
            metadata: { team: 'search', source: 'batch' },
            multimodal: true
        });
    });

    test('supports per-file metadata when batch metadata is empty', () => {
        const parsed = resolveUploadMetadataPayload({
            batchMetadata: '',
            files: [
                { filePath: '/tmp/a.pdf', metadata: '{"kind":"guide"}' },
                { filePath: '/tmp/b.txt', metadata: '', multimodal: true }
            ]
        });

        assert.strictEqual(parsed.error, undefined);
        assert.ok(parsed.value);
        assert.deepStrictEqual(parsed.value?.[0], {
            filePath: '/tmp/a.pdf',
            metadata: { kind: 'guide' },
            multimodal: false
        });
        assert.deepStrictEqual(parsed.value?.[1], {
            filePath: '/tmp/b.txt',
            metadata: undefined,
            multimodal: true
        });
    });

    test('applies list-level multimodal flag when requested', () => {
        const parsed = resolveUploadMetadataPayload({
            batchMultimodal: true,
            files: [{ filePath: '/tmp/a.pdf', metadata: '', multimodal: false }]
        });

        assert.strictEqual(parsed.error, undefined);
        assert.ok(parsed.value);
        assert.deepStrictEqual(parsed.value?.[0], {
            filePath: '/tmp/a.pdf',
            metadata: undefined,
            multimodal: true
        });
    });

    test('supports legacy top-level multimodal flag', () => {
        const parsed = resolveUploadMetadataPayload({
            multimodal: true,
            files: [{ filePath: '/tmp/a.pdf', metadata: '' }]
        });

        assert.strictEqual(parsed.error, undefined);
        assert.ok(parsed.value);
        assert.strictEqual(parsed.value?.[0].multimodal, true);
    });

    test('returns validation error for invalid batch metadata', () => {
        const parsed = resolveUploadMetadataPayload({
            batchMetadata: '{"team":"search"',
            files: [{ filePath: '/tmp/a.pdf', metadata: '' }]
        });

        assert.strictEqual(parsed.value, undefined);
        assert.strictEqual(parsed.error, 'Batch metadata must be a valid JSON object.');
    });

    test('returns validation error for invalid per-file metadata', () => {
        const parsed = resolveUploadMetadataPayload({
            files: [{ filePath: '/tmp/a.pdf', metadata: '{"bad":' }]
        });

        assert.strictEqual(parsed.value, undefined);
        assert.ok(parsed.error?.includes('Metadata for "a.pdf"'));
    });
});
