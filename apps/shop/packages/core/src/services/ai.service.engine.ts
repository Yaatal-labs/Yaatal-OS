/**
 * AI Service - Engine SDK Version
 *
 * Backed by Engine search, AI chat, and voice transcription endpoints.
 * - Product search via /api/search/products
 * - AI chat (non-streaming) via /api/ai/chat/sync
 * - Voice transcription via /api/voice/transcribe
 */

import type { Product } from '../types/models'
import { engineRequest, getYaatalClient } from './engine.client'
import { mapEngineProductToProduct } from './products.service.engine'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProductSearchResult {
  product: Product
  score?: number
}

interface EngineSearchProductsResponse {
  products: any[]
  total?: number
  page?: number
  per_page?: number
}

interface EngineAiChatResponse {
  response?: string
  text?: string
  content?: string
  message?: string
}

interface EngineVoiceTranscribeResponse {
  text?: string
  transcription?: string
  transcript?: string
}

interface AiChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AIServiceEngine {
  async search(query: string): Promise<ProductSearchResult[]> {
    try {
      const searchClient = (getYaatalClient() as any).search
      if (searchClient?.products) {
        const response = await searchClient.products({
          q: query,
          query,
        })
        const products = (response as EngineSearchProductsResponse).products || []
        return products.map((product: any) => ({
          product: mapEngineProductToProduct(product),
          score: (product as any).score,
        }))
      }

      const params = new URLSearchParams({ q: query })
      const response = await engineRequest<EngineSearchProductsResponse>(
        `/api/search/products?${params.toString()}`
      )
      const products = response.products || []
      return products.map((product: any) => ({
        product: mapEngineProductToProduct(product),
        score: (product as any).score,
      }))
    } catch (error) {
      console.warn('AIService.search: Engine unreachable', error)
      return []
    }
  }

  async chat(messages: AiChatMessage[], model?: string): Promise<string> {
    try {
      const response = await engineRequest<EngineAiChatResponse>(
        '/api/ai/chat/sync',
        {
          method: 'POST',
          body: JSON.stringify({
            messages,
            ...(model ? { model } : {}),
          }),
        }
      )

      return response.response || response.text || response.content || response.message || ''
    } catch (error) {
      console.warn('AIService.chat: Engine unreachable', error)
      return ''
    }
  }

  async voiceSearch(audio: Blob | ArrayBuffer | string): Promise<string> {
    try {
      let body: BodyInit

      if (typeof audio === 'string') {
        // Treat as base64-encoded audio
        body = JSON.stringify({ audio_base64: audio })
      } else if (audio instanceof Blob) {
        body = audio
      } else {
        // ArrayBuffer
        body = audio
      }

      const headers: Record<string, string> = {}
      if (typeof audio === 'string') {
        headers['Content-Type'] = 'application/json'
      }

      const response = await engineRequest<EngineVoiceTranscribeResponse>(
        '/api/voice/transcribe',
        {
          method: 'POST',
          body,
          headers: Object.keys(headers).length ? headers : undefined,
        }
      )

      return response.text || response.transcription || response.transcript || ''
    } catch (error) {
      console.warn('AIService.voiceSearch: Engine unreachable', error)
      return ''
    }
  }

  async visualSearch(): Promise<ProductSearchResult[]> {
    throw new Error('AIService.visualSearch: not implemented')
  }
}

export const aiServiceEngine = new AIServiceEngine()
export const aiService = aiServiceEngine
export default aiServiceEngine