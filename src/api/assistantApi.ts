/**
 * Pinecone Assistant API Client
 * 
 * Provides methods for managing Pinecone Assistants and their files.
 * Assistants enable RAG (Retrieval-Augmented Generation) over uploaded documents.
 * 
 * The Assistant API has two components:
 * 1. Control Plane (api.pinecone.io/assistant/*) - CRUD operations for assistants
 * 2. Data Plane (assistant host) - Chat and file operations
 * 
 * Control plane paths use the /assistant prefix (e.g., /assistant/assistants).
 * Data plane operations use the assistant's dedicated host URL.
 * 
 * @see https://docs.pinecone.io/guides/assistant/understanding-assistant
 */

import { PineconeClient, ProjectContext } from './client';
import { 
    AssistantModel, 
    FileModel, 
    ChatResponse, 
    Metadata,
    UpdateAssistantRequest,
    AssistantContextRequest,
    AssistantContextResponse,
    AssistantEvaluationRequest,
    AssistantEvaluationResponse,
    StreamChunk,
    StreamMessageStart,
    StreamContentDelta,
    StreamCitation,
    StreamMessageEnd,
    Citation
} from './types';
import FormData from 'form-data';
import fetch from 'node-fetch';
import * as fs from 'fs';
import { createComponentLogger } from '../utils/logger';
import * as https from 'https';
import { normalizeHost } from './host';

/** Logger for AssistantApi operations */
const log = createComponentLogger('AssistantApi');

// ============================================================================
// Type Guards for SSE Stream Parsing
// ============================================================================

/**
 * Checks if the given data object has all specified properties as strings.
 * 
 * This utility function is used to validate SSE (Server-Sent Events) chunk
 * structure before performing type assertions. It ensures type safety when
 * parsing dynamic JSON data from streaming responses.
 * 
 * @param data - The object to check for string properties
 * @param props - The property names that must exist and be strings
 * @returns true if all specified properties exist and are strings, false otherwise
 * 
 * @example
 * ```typescript
 * const chunk = { type: 'message', id: '123', count: 5 };
 * hasStringProps(chunk, 'type', 'id');  // true
 * hasStringProps(chunk, 'type', 'count');  // false (count is number)
 * hasStringProps(chunk, 'missing');  // false
 * ```
 */
function hasStringProps(data: Record<string, unknown>, ...props: string[]): boolean {
    return props.every(prop => typeof data[prop] === 'string');
}

/**
 * Type guard for StreamMessageStart chunks.
 * Validates that the data has the required structure for a message_start event.
 */
function isValidMessageStart(data: Record<string, unknown>): data is { 
    type: 'message_start'; model: string; role: string 
} {
    return data.type === 'message_start' && hasStringProps(data, 'model', 'role');
}

/**
 * Type guard for StreamContentDelta chunks.
 * Validates that the data has the required structure for a content_chunk event.
 */
function isValidContentDelta(data: Record<string, unknown>): data is { 
    type: 'content_chunk'; id: string; model: string; delta: { content: string } 
} {
    return data.type === 'content_chunk' && 
           hasStringProps(data, 'id', 'model') &&
           typeof data.delta === 'object' && 
           data.delta !== null &&
           typeof (data.delta as Record<string, unknown>).content === 'string';
}

/**
 * Type guard for StreamCitation chunks.
 * Validates that the data has the required structure for a citation event.
 */
function isValidCitation(data: Record<string, unknown>): data is { 
    type: 'citation'; id: string; model: string; citation: Citation 
} {
    return data.type === 'citation' && 
           hasStringProps(data, 'id', 'model') &&
           typeof data.citation === 'object' && 
           data.citation !== null;
}

/**
 * Type guard for StreamMessageEnd chunks.
 * Validates that the data has the required structure for a message_end event.
 */
function isValidMessageEnd(data: Record<string, unknown>): data is { 
    type: 'message_end'; id: string; model: string; usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } 
} {
    if (data.type !== 'message_end' || !hasStringProps(data, 'id', 'model')) {
        return false;
    }
    const usage = data.usage as Record<string, unknown> | undefined;
    return typeof usage === 'object' && 
           usage !== null &&
           typeof usage.prompt_tokens === 'number' &&
           typeof usage.completion_tokens === 'number' &&
           typeof usage.total_tokens === 'number';
}

/**
 * Coerces unknown usage payloads into a valid token usage object.
 */
function coerceUsage(usage: unknown): { prompt_tokens: number; completion_tokens: number; total_tokens: number } {
    const source = (typeof usage === 'object' && usage !== null)
        ? usage as Record<string, unknown>
        : {};

    const prompt = typeof source.prompt_tokens === 'number' ? source.prompt_tokens : 0;
    const completion = typeof source.completion_tokens === 'number' ? source.completion_tokens : 0;
    const total = typeof source.total_tokens === 'number' ? source.total_tokens : (prompt + completion);

    return {
        prompt_tokens: prompt,
        completion_tokens: completion,
        total_tokens: total
    };
}

/**
 * Extracts content text from legacy or variant chunk shapes.
 */
function extractChunkContent(data: Record<string, unknown>): string | null {
    if (typeof data.content === 'string') {
        return data.content;
    }

    if (typeof data.delta === 'string') {
        return data.delta;
    }

    if (typeof data.delta === 'object' && data.delta !== null) {
        const delta = data.delta as Record<string, unknown>;
        if (typeof delta.content === 'string') {
            return delta.content;
        }
        if (typeof delta.text === 'string') {
            return delta.text;
        }
    }

    if (typeof data.message === 'object' && data.message !== null) {
        const message = data.message as Record<string, unknown>;
        if (typeof message.content === 'string') {
            return message.content;
        }
    }

    return null;
}

import { AuthService } from '../services/authService';
import { API_VERSION, AUTH_CONTEXTS } from '../utils/constants';

/**
 * Chat message in a conversation.
 */
export interface ChatMessage {
    /** Role of the message sender ('user' or 'assistant') */
    role: 'user' | 'assistant';
    /** Message content */
    content: string;
}

/**
 * Options for chat requests.
 */
export interface ChatOptions {
    /** Model to use for generation (e.g., 'gpt-4o') */
    model?: string;
    /** Whether to stream the response */
    stream?: boolean;
    /** Temperature for response generation (0-2) */
    temperature?: number;
    /** Whether to include highlighted text in citations */
    include_highlights?: boolean;
    /** Filter to apply to document search */
    filter?: Record<string, unknown>;
}

/**
 * Options for streaming chat requests.
 */
export interface StreamChatOptions extends ChatOptions {
    /** Callback for each received chunk */
    onChunk: (chunk: StreamChunk) => void;
    /** Callback for errors during streaming */
    onError: (error: Error) => void;
    /** Callback when streaming completes */
    onComplete: () => void;
    /** Optional project context for per-request auth (avoids race conditions) */
    projectContext?: ProjectContext;
}

/**
 * Controller for aborting a streaming chat request.
 */
export interface StreamController {
    /** Aborts the streaming request */
    abort: () => void;
}

/**
 * Client for Pinecone Assistant API operations.
 * 
 * Handles assistant CRUD operations, file management, and chat interactions.
 * File operations and chat requests are made to the assistant's dedicated host.
 * 
 * @example
 * ```typescript
 * const assistantApi = new AssistantApi(client);
 * const assistants = await assistantApi.listAssistants();
 * const response = await assistantApi.chat(
 *   assistant.host,
 *   'my-assistant',
 *   [{ role: 'user', content: 'What is in my documents?' }]
 * );
 * ```
 */
export class AssistantApi {
    private authService?: AuthService;

    /**
     * Creates a new AssistantApi instance.
     * @param client - Authenticated PineconeClient for making requests
     * @param authService - Optional AuthService for streaming chat (uses native HTTP)
     */
    constructor(private client: PineconeClient, authService?: AuthService) {
        this.authService = authService;
    }

    /**
     * Sets the AuthService for streaming chat support.
     * Required for chatStream() method.
     */
    setAuthService(authService: AuthService): void {
        this.authService = authService;
    }

    /**
     * Lists all assistants in the current project.
     * 
     * Control plane operation - uses /assistant/assistants endpoint.
     * 
     * @param projectContext - Optional project context for per-request auth (avoids race conditions)
     * @returns Array of assistant models with their status and configuration
     * @throws {PineconeApiError} When the request fails
     */
    async listAssistants(projectContext?: ProjectContext): Promise<AssistantModel[]> {
        // Control plane: /assistant/assistants (note: /assistant prefix required)
        const response = await this.client.request<{ assistants: AssistantModel[] }>('GET', '/assistant/assistants', {
            projectContext
        });
        return response.assistants || [];
    }

    /**
     * Creates a new assistant.
     * 
     * @param name - Unique name for the assistant (lowercase alphanumeric and hyphens)
     * @param region - Deployment region ('us' or 'eu', defaults to 'us')
     * @param instructions - System instructions for the assistant's behavior
     * @param metadata - Optional metadata key-value pairs
     * @param projectContext - Optional project context for per-request auth (required for JWT auth)
     * @returns The created assistant model
     * @throws {PineconeApiError} When creation fails
     * 
     * @example
     * ```typescript
     * const assistant = await assistantApi.createAssistant(
     *   'my-assistant',
     *   'us',
     *   'You are a helpful assistant that answers questions about our documentation.',
     *   undefined,
     *   projectContext
     * );
     * ```
     */
    async createAssistant(
        name: string, 
        region: string = 'us', 
        instructions?: string, 
        metadata?: Metadata,
        projectContext?: ProjectContext
    ): Promise<AssistantModel> {
        // Control plane: /assistant/assistants (note: /assistant prefix required)
        return this.client.request<AssistantModel>('POST', '/assistant/assistants', {
            body: { name, region, instructions, metadata },
            projectContext
        });
    }

    /**
     * Deletes an assistant and all its files.
     * 
     * This operation is irreversible. Control plane operation.
     * 
     * @param name - Name of the assistant to delete
     * @param projectContext - Optional project context for per-request auth (required for JWT auth)
     * @throws {PineconeApiError} When deletion fails
     */
    async deleteAssistant(name: string, projectContext?: ProjectContext): Promise<void> {
        // Control plane: /assistant/assistants/{name}
        return this.client.request<void>('DELETE', `/assistant/assistants/${name}`, {
            projectContext
        });
    }

    /**
     * Gets detailed information about a specific assistant.
     * 
     * Control plane operation.
     * 
     * @param name - Name of the assistant to describe
     * @param projectContext - Optional project context for per-request auth (required for JWT auth)
     * @returns Full assistant model with status and configuration
     * @throws {PineconeApiError} When the assistant doesn't exist
     */
    async describeAssistant(name: string, projectContext?: ProjectContext): Promise<AssistantModel> {
        // Control plane: /assistant/assistants/{name}
        return this.client.request<AssistantModel>('GET', `/assistant/assistants/${name}`, {
            projectContext
        });
    }

    /**
     * Updates an assistant's instructions or metadata.
     *
     * Control plane operation.
     */
    async updateAssistant(
        name: string,
        request: UpdateAssistantRequest,
        projectContext?: ProjectContext
    ): Promise<AssistantModel> {
        return this.client.request<AssistantModel>('PATCH', `/assistant/assistants/${name}`, {
            body: request,
            projectContext
        });
    }

    /**
     * Sends a chat message to an assistant and receives a response.
     * 
     * The assistant will use uploaded files as context for answering questions.
     * Returns citations linking the response to source documents.
     * 
     * IMPORTANT: The Assistant Data Plane API requires API key authentication,
     * not Bearer tokens. For OAuth users, this method uses a managed API key.
     * 
     * @param host - Assistant host URL (from AssistantModel.host)
     * @param assistantName - Name of the assistant
     * @param messages - Conversation history including the new user message
     * @param options - Optional chat configuration (model, streaming, etc.)
     * @returns Chat response with message content and citations
     * @throws {PineconeApiError} When the chat request fails
     * 
     * @example
     * ```typescript
     * const response = await assistantApi.chat(
     *   assistant.host,
     *   'my-assistant',
     *   [
     *     { role: 'user', content: 'What are the main features?' }
     *   ],
     *   { model: 'gpt-4' }
     * );
     * console.log(response.message.content);
     * console.log('Citations:', response.citations);
     * ```
     */
    async chat(
        host: string,
        assistantName: string,
        messages: ChatMessage[],
        options?: ChatOptions,
        projectContext?: ProjectContext
    ): Promise<ChatResponse> {
        if (!this.authService) {
            throw new Error('AuthService required for chat. Call setAuthService() first.');
        }
        
        // Get API key for data plane authentication
        // The Assistant Data Plane API only accepts Api-Key auth, not Bearer tokens
        const apiKey = await this.getDataPlaneApiKey(projectContext);
        
        // Make request with Api-Key auth
        const url = `${normalizeHost(host)}/assistant/chat/${assistantName}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Pinecone-Api-Version': API_VERSION,
                'Api-Key': apiKey
            },
            body: JSON.stringify({ messages, ...options })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        return response.json() as Promise<ChatResponse>;
    }
    
    /**
     * Gets an API key for data plane authentication.
     * 
     * For OAuth/JWT users, returns a managed API key.
     * For API key users, returns the configured API key.
     * 
     * @param projectContext - Optional project context for getting the correct managed API key
     * @returns API key for data plane requests
     */
    private async getDataPlaneApiKey(projectContext?: ProjectContext): Promise<string> {
        const authContext = this.authService!.getAuthContext();
        
        if (authContext === AUTH_CONTEXTS.USER_TOKEN || authContext === AUTH_CONTEXTS.SERVICE_ACCOUNT) {
            // Prefer explicit project context if provided (avoids race conditions)
            if (projectContext) {
                return this.authService!.getOrCreateManagedKey(
                    projectContext.id,
                    projectContext.name,
                    projectContext.organizationId
                );
            }
            
            // Fall back to global target project
            const configService = this.authService!.getConfigService();
            const targetOrg = configService.getTargetOrganization();
            const targetProject = configService.getTargetProject();
            
            if (!targetProject || !targetOrg) {
                throw new Error('No target project selected. Please select a project in the Pinecone Explorer.');
            }
            
            return this.authService!.getOrCreateManagedKey(
                targetProject.id,
                targetProject.name,
                targetOrg.id
            );
        } else if (authContext === AUTH_CONTEXTS.API_KEY) {
            return this.authService!.getAccessToken();
        }
        
        throw new Error('Not authenticated. Please log in to use Assistant chat.');
    }

    /**
     * Sends a streaming chat request to an assistant.
     * 
     * Uses Server-Sent Events (SSE) to stream response chunks in real-time.
     * Chunks include message content, citations, and completion status.
     * 
     * Requires AuthService to be set (either via constructor or setAuthService).
     * 
     * @param host - Assistant host URL (from AssistantModel.host)
     * @param assistantName - Name of the assistant
     * @param messages - Conversation history including the new user message
     * @param options - Streaming options with callbacks for chunks, errors, and completion
     * @returns StreamController with abort() method to cancel the request
     * @throws {Error} When AuthService is not configured
     * 
     * @example
     * ```typescript
     * const controller = assistantApi.chatStream(
     *   assistant.host,
     *   'my-assistant',
     *   [{ role: 'user', content: 'What is in my documents?' }],
     *   {
     *     model: 'gpt-4o',
     *     onChunk: (chunk) => {
     *       if (chunk.type === 'content_chunk') {
     *         process.stdout.write(chunk.delta.content);
     *       }
     *     },
     *     onError: (error) => console.error('Stream error:', error),
     *     onComplete: () => console.log('\n--- Stream complete ---')
     *   }
     * );
     * 
     * // To abort the stream:
     * // controller.abort();
     * ```
     */
    chatStream(
        host: string,
        assistantName: string,
        messages: ChatMessage[],
        options: StreamChatOptions
    ): StreamController {
        if (!this.authService) {
            throw new Error('AuthService required for streaming chat. Call setAuthService() first.');
        }

        // Build request body
        const body = JSON.stringify({
            messages,
            stream: true,
            model: options.model,
            temperature: options.temperature,
            include_highlights: options.include_highlights,
            filter: options.filter
        });

        // Parse host URL - data plane uses /assistant prefix
        // Note: normalizeHost handles cases where host may already include https://
        const url = new URL(`${normalizeHost(host)}/assistant/chat/${assistantName}`);
        
        // Create abort controller
        let currentRequest: ReturnType<typeof https.request> | null = null;

        // Start the streaming request asynchronously
        this.startStreamingRequest(url, body, options, (req) => {
            currentRequest = req;
        }).catch(options.onError);

        // Return controller for aborting
        return {
            abort: () => {
                if (currentRequest) {
                    currentRequest.destroy();
                }
            }
        };
    }

    /**
     * Internal method to start the streaming HTTP request.
     * 
     * IMPORTANT: The Assistant Data Plane API requires API key authentication,
     * not Bearer tokens. For OAuth users, we use a managed API key that is
     * automatically created and stored for the current project.
     * 
     * This matches the pattern used by the Pinecone CLI, which creates managed
     * API keys for data plane operations when using OAuth login.
     */
    private async startStreamingRequest(
        url: URL,
        body: string,
        options: StreamChatOptions,
        onRequest: (req: ReturnType<typeof https.request>) => void
    ): Promise<void> {
        // Build headers - using Api-Key auth for data plane requests
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-Pinecone-Api-Version': API_VERSION,
            'Accept': 'text/event-stream'
        };

        // Get the API key for data plane authentication, using projectContext if provided
        const apiKey = await this.getDataPlaneApiKey(options.projectContext);
        
        // Use Api-Key header for data plane authentication
        headers['Api-Key'] = apiKey;

        return new Promise((resolve, reject) => {
            const req = https.request(
                {
                    hostname: url.hostname,
                    port: 443,
                    path: url.pathname,
                    method: 'POST',
                    headers
                },
                (res) => {
                    // Check for error status
                    if (res.statusCode && res.statusCode >= 400) {
                        let errorBody = '';
                        res.on('data', (chunk) => { errorBody += chunk; });
                        res.on('end', () => {
                            reject(new Error(`HTTP ${res.statusCode}: ${errorBody}`));
                        });
                        return;
                    }

                    // Avoid indefinite hangs if the stream stalls.
                    res.setTimeout(120000, () => {
                        req.destroy(new Error('Streaming chat timed out while waiting for data.'));
                    });

                    const contentType = String(res.headers['content-type'] || '').toLowerCase();
                    const expectsSse = contentType.includes('text/event-stream');

                    // Buffer for incomplete lines
                    let buffer = '';
                    let rawBody = '';
                    let emittedContent = false;

                    res.on('data', (chunk: Buffer) => {
                        const text = chunk.toString();
                        rawBody += text;

                        if (expectsSse) {
                            buffer += text;
                            
                            // Process complete lines
                            const lines = buffer.split('\n');
                            buffer = lines.pop() || ''; // Keep incomplete line in buffer

                            for (const line of lines) {
                                const before = emittedContent;
                                this.processSSELine(line.trim(), options);
                                emittedContent = before || line.trim().startsWith('data:');
                            }
                        }
                    });

                    res.on('end', () => {
                        if (expectsSse) {
                            // Process any remaining data
                            if (buffer.trim()) {
                                const line = buffer.trim();
                                this.processSSELine(line, options);
                                emittedContent = emittedContent || line.startsWith('data:');
                            }
                        }

                        // Fallback: Some environments return standard JSON even when stream=true.
                        // Convert that JSON response into stream callbacks so the UI still resolves.
                        if (!emittedContent && rawBody.trim().startsWith('{')) {
                            try {
                                const json = JSON.parse(rawBody) as Record<string, unknown>;
                                const message = json.message as Record<string, unknown> | undefined;
                                const content = typeof message?.content === 'string'
                                    ? message.content
                                    : undefined;
                                if (content) {
                                    options.onChunk({
                                        type: 'content_chunk',
                                        id: 'json-fallback',
                                        model: typeof json.model === 'string' ? json.model : 'unknown',
                                        delta: { content }
                                    } as StreamContentDelta);
                                }
                            } catch (error: unknown) {
                                log.warn('Failed JSON fallback parse for streaming chat response:', error);
                            }
                        }
                        options.onComplete();
                        resolve();
                    });

                    res.on('error', (error) => {
                        reject(error);
                    });
                }
            );

            // Notify caller of the request object (for abort)
            onRequest(req);

            // Connection-level timeout before/while establishing stream.
            req.setTimeout(120000, () => {
                req.destroy(new Error('Streaming chat request timed out.'));
            });

            req.on('error', (error) => {
                reject(error);
            });

            // Send the request body
            req.write(body);
            req.end();
        });
    }

    /**
     * Processes a single SSE line and emits the appropriate chunk.
     */
    private processSSELine(line: string, options: StreamChatOptions): void {
        // Skip empty lines and comments
        if (!line || line.startsWith(':')) {
            return;
        }

        // Accept both strict SSE `data:` lines and plain JSON line payloads.
        const payload = line.startsWith('data:')
            ? line.slice(5).trim()
            : line.trim();

        if (!line.startsWith('data:') && !(payload.startsWith('{') || payload === '[DONE]')) {
            return;
        }

        if (!payload) {
            return;
        }

        if (payload === '[DONE]') {
            options.onChunk({
                type: 'message_end',
                id: 'done',
                model: 'unknown',
                usage: coerceUsage(undefined)
            } as StreamMessageEnd);
            return;
        }

        // ─────────────────────────────────────────────────────────────────
        // SSE Chunk Parsing with Error Recovery
        // ─────────────────────────────────────────────────────────────────
        // 
        // Error Recovery Strategy:
        // - Log parse errors but continue processing the stream
        // - A single malformed chunk should not abort the entire chat session
        //
        // Rationale: SSE streams can occasionally have malformed chunks due to:
        // 1. Network issues causing partial data
        // 2. API bugs in specific edge cases
        // 3. Encoding issues with special characters
        //
        // By logging errors and continuing, users still receive the majority
        // of the response even if one chunk fails. The logged error helps
        // debugging without disrupting the user experience.
        // ─────────────────────────────────────────────────────────────────
        try {
            const data = JSON.parse(payload) as Record<string, unknown>;
            const chunk = this.parseStreamChunk(data);
            if (chunk) {
                options.onChunk(chunk);
            }
        } catch (e: unknown) {
            // Error Recovery: Continue stream even if one chunk fails to parse
            log.error('Failed to parse SSE chunk:', e, 'Line:', line);
        }
    }

    /**
     * Parses a raw SSE data object into a typed StreamChunk.
     * 
     * Uses type guards to validate the structure before returning,
     * ensuring type safety without unsafe casts.
     */
    private parseStreamChunk(data: Record<string, unknown>): StreamChunk | null {
        const type = data.type;
        const fallbackContent = extractChunkContent(data);

        // Defensive fallback: tolerate chunks that omit "type" but include content.
        if (fallbackContent && isValidContentDelta({
            type: 'content_chunk',
            id: typeof data.id === 'string' ? data.id : 'fallback',
            model: typeof data.model === 'string' ? data.model : 'unknown',
            delta: { content: fallbackContent }
        })) {
            return {
                type: 'content_chunk',
                id: typeof data.id === 'string' ? data.id : 'fallback',
                model: typeof data.model === 'string' ? data.model : 'unknown',
                delta: { content: fallbackContent }
            } as StreamContentDelta;
        }

        if (type === 'done' || type === 'completed' || type === 'message_stop') {
            return {
                type: 'message_end',
                id: typeof data.id === 'string' ? data.id : 'done',
                model: typeof data.model === 'string' ? data.model : 'unknown',
                usage: coerceUsage(data.usage)
            } as StreamMessageEnd;
        }

        switch (type) {
            case 'message_start':
                if (isValidMessageStart(data)) {
                    return {
                        type: 'message_start',
                        model: data.model,
                        role: data.role
                    } as StreamMessageStart;
                }
                log.warn('Invalid message_start chunk structure:', data);
                return null;

            case 'content_chunk':
                if (isValidContentDelta(data)) {
                    return {
                        type: 'content_chunk',
                        id: data.id,
                        model: data.model,
                        delta: data.delta
                    } as StreamContentDelta;
                }
                log.warn('Invalid content_chunk structure:', data);
                return null;

            case 'citation':
                if (isValidCitation(data)) {
                    return {
                        type: 'citation',
                        id: data.id,
                        model: data.model,
                        citation: data.citation
                    } as StreamCitation;
                }
                log.warn('Invalid citation chunk structure:', data);
                return null;

            case 'message_end':
                if (isValidMessageEnd(data)) {
                    return {
                        type: 'message_end',
                        model: data.model,
                        id: data.id,
                        usage: data.usage
                    } as StreamMessageEnd;
                }
                log.warn('Invalid message_end chunk structure:', data);
                return null;

            default:
                // Unknown chunk type - log but don't fail
                log.warn('Unknown stream chunk type:', type);
                return null;
        }
    }

    /**
     * Lists all files uploaded to an assistant.
     * 
     * Data plane operation - uses assistant's dedicated host.
     * 
     * @param host - Assistant host URL (from AssistantModel.host)
     * @param assistantName - Name of the assistant
     * @returns Array of file models with processing status
     * @throws {PineconeApiError} When the request fails
     */
    async listFiles(
        host: string,
        assistantName: string,
        projectContext?: ProjectContext,
        metadataFilter?: Record<string, unknown>
    ): Promise<FileModel[]> {
        // Data plane: https://{host}/assistant/files/{assistantName}
        // Note: normalizeHost handles cases where host may already include https://
        const queryParams = metadataFilter ? { metadata: JSON.stringify(metadataFilter) } : undefined;
        const response = await this.client.request<{ files: FileModel[] }>('GET', `/assistant/files/${assistantName}`, {
            host: normalizeHost(host),
            queryParams,
            projectContext
        });
        return response.files || [];
    }

    /**
     * Describes one assistant file.
     */
    async describeFile(
        host: string,
        assistantName: string,
        fileId: string,
        projectContext?: ProjectContext,
        includeUrl: boolean = false
    ): Promise<FileModel> {
        const queryParams = includeUrl ? { include_url: 'true' } : undefined;
        return this.client.request<FileModel>('GET', `/assistant/files/${assistantName}/${fileId}`, {
            host: normalizeHost(host),
            queryParams,
            projectContext
        });
    }

    /**
     * Deletes a file from an assistant.
     * 
     * Data plane operation - uses assistant's dedicated host.
     * 
     * @param host - Assistant host URL (from AssistantModel.host)
     * @param assistantName - Name of the assistant
     * @param fileId - ID of the file to delete
     * @param projectContext - Optional project context for per-request auth
     * @throws {PineconeApiError} When deletion fails
     */
    async deleteFile(host: string, assistantName: string, fileId: string, projectContext?: ProjectContext): Promise<void> {
        // Data plane: https://{host}/assistant/files/{assistantName}/{fileId}
        // Note: normalizeHost handles cases where host may already include https://
        return this.client.request<void>('DELETE', `/assistant/files/${assistantName}/${fileId}`, {
            host: normalizeHost(host),
            projectContext
        });
    }

    /**
     * Uploads a file to an assistant for RAG processing.
     * 
     * Supported file types include PDF, TXT, DOCX, and more.
     * Files are processed asynchronously; check FileModel.status for progress.
     * 
     * @param host - Assistant host URL (from AssistantModel.host)
     * @param assistantName - Name of the assistant
     * @param filePath - Local path to the file to upload
     * @param metadata - Optional metadata to associate with the file
     * @param multimodal - Optional flag to ingest document as multimodal
     * @param projectContext - Optional project context for per-request auth (required for JWT auth)
     * @returns The created file model (status will be 'Processing' initially)
     * @throws {PineconeApiError} When upload fails
     * @throws {Error} When the local file cannot be read
     * 
     * @example
     * ```typescript
     * const file = await assistantApi.uploadFile(
     *   assistant.host,
     *   'my-assistant',
     *   '/path/to/document.pdf',
     *   { category: 'documentation' },
     *   true,
     *   projectContext
     * );
     * console.log(`Uploaded ${file.name}, status: ${file.status}`);
     * ```
     */
    async uploadFile(
        host: string, 
        assistantName: string, 
        filePath: string, 
        metadata?: Record<string, unknown>,
        multimodal?: boolean,
        projectContext?: ProjectContext
    ): Promise<FileModel> {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(filePath));
        
        if (metadata) {
            formData.append('metadata', JSON.stringify(metadata));
        }
        
        // Data plane: https://{host}/assistant/files/{assistantName}
        // Note: normalizeHost handles cases where host may already include https://
        return this.client.request<FileModel>('POST', `/assistant/files/${assistantName}`, {
            host: normalizeHost(host),
            body: formData,
            queryParams: multimodal ? { multimodal: 'true' } : undefined,
            projectContext
        });
    }

    /**
     * Retrieves context snippets for an assistant query.
     */
    async retrieveContext(
        host: string,
        assistantName: string,
        request: AssistantContextRequest,
        projectContext?: ProjectContext
    ): Promise<AssistantContextResponse> {
        return this.client.request<AssistantContextResponse>('POST', `/assistant/chat/${assistantName}/context`, {
            host: normalizeHost(host),
            body: request,
            projectContext
        });
    }

    /**
     * Evaluates an assistant answer.
     */
    async evaluateAnswer(
        host: string,
        _assistantName: string,
        request: AssistantEvaluationRequest,
        projectContext?: ProjectContext
    ): Promise<AssistantEvaluationResponse> {
        return this.client.request<AssistantEvaluationResponse>('POST', '/assistant/evaluation/metrics/alignment', {
            host: normalizeHost(host),
            body: request,
            projectContext
        });
    }
}
