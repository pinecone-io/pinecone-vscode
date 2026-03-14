/**
 * Input validation helpers shared across commands and panels.
 */

/**
 * Parses an optional JSON object string.
 *
 * Returns undefined when the input is empty.
 */
export function parseOptionalJsonObject(
    input: string | undefined,
    invalidMessage: string
): { value?: Record<string, unknown>; error?: string } {
    if (!input || !input.trim()) {
        return { value: undefined };
    }

    try {
        const parsed = JSON.parse(input);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return { error: invalidMessage };
        }
        return { value: parsed as Record<string, unknown> };
    } catch {
        return { error: invalidMessage };
    }
}

/**
 * Parses a JSON array of numbers from an optional string.
 */
export function parseOptionalNumberArray(
    input: string | undefined,
    invalidMessage: string
): { value?: number[]; error?: string } {
    if (!input || !input.trim()) {
        return { value: undefined };
    }

    try {
        const parsed = JSON.parse(input);
        if (!Array.isArray(parsed) || !parsed.every(n => typeof n === 'number')) {
            return { error: invalidMessage };
        }
        return { value: parsed as number[] };
    } catch {
        return { error: invalidMessage };
    }
}

