/**
 * Host URL helpers for data plane and assistant endpoints.
 */

/**
 * Normalizes a host value so it always includes a protocol.
 *
 * @param host - Host with or without protocol
 * @returns Host URL with protocol
 */
export function normalizeHost(host: string): string {
    if (host.startsWith('https://') || host.startsWith('http://')) {
        return host;
    }
    return `https://${host}`;
}
