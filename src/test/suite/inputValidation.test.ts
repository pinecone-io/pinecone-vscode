import * as assert from 'assert';
import { parseOptionalJsonObject, parseOptionalNumberArray } from '../../utils/inputValidation';

suite('Input Validation Helpers', () => {
    test('parseOptionalJsonObject returns undefined for empty input', () => {
        const parsed = parseOptionalJsonObject('', 'invalid');
        assert.strictEqual(parsed.value, undefined);
        assert.strictEqual(parsed.error, undefined);
    });

    test('parseOptionalJsonObject parses object JSON', () => {
        const parsed = parseOptionalJsonObject('{"team":"docs","active":true}', 'invalid');
        assert.ok(parsed.value);
        assert.strictEqual(parsed.value?.team, 'docs');
    });

    test('parseOptionalJsonObject rejects arrays', () => {
        const parsed = parseOptionalJsonObject('[1,2,3]', 'invalid');
        assert.strictEqual(parsed.value, undefined);
        assert.strictEqual(parsed.error, 'invalid');
    });

    test('parseOptionalNumberArray parses number arrays', () => {
        const parsed = parseOptionalNumberArray('[0.1,0.2,0.3]', 'invalid');
        assert.ok(parsed.value);
        assert.strictEqual(parsed.value?.length, 3);
    });

    test('parseOptionalNumberArray rejects malformed values', () => {
        const parsed = parseOptionalNumberArray('[0.1,"x"]', 'invalid');
        assert.strictEqual(parsed.value, undefined);
        assert.strictEqual(parsed.error, 'invalid');
    });
});

