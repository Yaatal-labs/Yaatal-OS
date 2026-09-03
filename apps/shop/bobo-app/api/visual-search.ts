/**
 * Visual Search API - Vercel Edge Function
 * Uses Vercel AI SDK with Vision models for image-based search
 */

import { createGroq } from '@ai-sdk/groq'
import { generateText } from 'ai'

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
})

export const config = {
  runtime: 'edge',
}

interface VisualSearchRequest {
  imageBase64: string
  userId?: string
}

interface VisualSearchResult {
  category: 'fashion' | 'electronics' | 'beauty' | 'food' | 'home' | 'other'
  keywords: string[]
  colors: string[]
  description: string
  suggestedSearchQuery: string
}

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const { imageBase64, userId }: VisualSearchRequest = await req.json()

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: 'Image is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Use Groq's vision model (llama-3.2-11b-vision-preview)
    const { text } = await generateText({
      model: groq('llama-3.2-11b-vision-preview'),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this image for product search in a Senegalese e-commerce app called BOBO.

Identify:
1. Category (fashion, electronics, beauty, food, home, other)
2. Keywords (main objects, styles, features)
3. Dominant colors
4. Detailed description in French
5. Suggested search query in French/Wolof

Focus on Senegalese context: traditional clothing (boubou, kaftan, wax fabric), local electronics preferences, beauty products popular in West Africa.

Respond ONLY with valid JSON matching this structure:
{
  "category": "fashion",
  "keywords": ["robe", "rouge", "élégant"],
  "colors": ["rouge", "noir"],
  "description": "Une belle robe rouge élégante...",
  "suggestedSearchQuery": "robe rouge élégante soirée"
}`,
            },
            {
              type: 'image',
              image: imageBase64,
            },
          ],
        },
      ],
      temperature: 0.4,
    })

    // Parse the AI response
    let result: VisualSearchResult
    try {
      const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      result = JSON.parse(cleanText)
    } catch (parseError) {
      console.error('Failed to parse vision AI response:', text)
      // Fallback
      result = {
        category: 'other',
        keywords: ['produit'],
        colors: [],
        description: 'Produit détecté',
        suggestedSearchQuery: 'produit',
      }
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Visual search error:', error)
    return new Response(
      JSON.stringify({
        error: 'Visual search failed',
        message: error.message,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}
