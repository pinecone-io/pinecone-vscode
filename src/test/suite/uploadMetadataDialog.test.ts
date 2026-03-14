import * as assert from 'assert';
import { resolveUploadMetadataPayload } from '../../webview/uploadMetadataDialog';

suite('Upload Metadata Dialog Parsing', () => {
    test('applies batch metadata to all files', () => {
        const parsed = resolveUploadMetadataPayload({
            batchMetadata: '{"team":"search","source":"batch"}',
            files: [
                { filePath: '/tmp/a.pdf', metadata: '{"ignored":true}' },
                { filePath: '/tmp/b.txt', metadata: '' }
            ]
        });

        assert.strictEqual(parsed.error, undefined);
        assert.ok(parsed.value);
        assert.strictEqual(parsed.value?.length, 2);
        assert.deepStrictEqual(parsed.value?.[0].metadata, { team: 'search', source: 'batch' });
        assert.deepStrictEqual(parsed.value?.[1].metadata, { team: 'search', source: 'batch' });
    });

    test('supports per-file metadata when batch metadata is empty', () => {
        const parsed = resolveUploadMetadataPayload({
            batchMetadata: '',
            files: [
                { filePath: '/tmp/a.pdf', metadata: '{"kind":"guide"}' },
                { filePath: '/tmp/b.txt', metadata: '' }
            ]
        });

        assert.strictEqual(parsed.error, undefined);
        assert.ok(parsed.value);
        assert.deepStrictEqual(parsed.value?.[0].metadata, { kind: 'guide' });
        assert.strictEqual(parsed.value?.[1].metadata, undefined);
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
