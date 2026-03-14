/**
 * Pinecone Inference API Client
 *
 * Provides embedding and reranking operations plus model discovery.
 */

import { PineconeClient, ProjectContext } from './client';
import {
    EmbedRequest,
    EmbedResponse,
    RerankRequest,
    RerankResponse,
    InferenceModel,
    ListInferenceModelsResponse
} from './types';

/**
 * Client for Pinecone Inference API operations.
 */
export class InferenceApi {
    /**
     * Creates a new InferenceApi instance.
     * @param client - Authenticated PineconeClient
     */
    constructor(private client: PineconeClient) {}

    /**
     * Generates embeddings for input data.
     */
    async embed(request: EmbedRequest, projectContext?: ProjectContext): Promise<EmbedResponse> {
        return this.client.request<EmbedResponse>('POST', '/embed', {
            body: request,
            projectContext
        });
    }

    /**
     * Reranks documents for a query.
     */
    async rerank(request: RerankRequest, projectContext?: ProjectContext): Promise<RerankResponse> {
        return this.client.request<RerankResponse>('POST', '/rerank', {
            body: request,
            projectContext
        });
    }

    /**
     * Lists available inference models.
     */
    async listModels(type?: 'embed' | 'rerank', projectContext?: ProjectContext): Promise<InferenceModel[]> {
        const response = await this.client.request<ListInferenceModelsResponse>('GET', '/models', {
            queryParams: type ? { type } : undefined,
            projectContext
        });
        return response.data || response.models || [];
    }

    /**
     * Describes one inference model by name.
     */
    async describeModel(modelName: string, projectContext?: ProjectContext): Promise<InferenceModel> {
        const encodedName = encodeURIComponent(modelName);
        return this.client.request<InferenceModel>('GET', `/models/${encodedName}`, {
            projectContext
        });
    }
}
