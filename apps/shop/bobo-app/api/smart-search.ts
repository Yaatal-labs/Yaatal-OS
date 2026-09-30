/**
 * Smart Search API - Vercel Edge Function
 * Uses Vercel AI SDK with Groq for natural language search
 */

import { createGroq } from '@ai-sdk/groq'
import { generateText } from 'ai'

// Initialize Groq (fastest & cheapest LLM provider)
const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
})

export const config = {
  runtime: 'edge',
}

interface SearchRequest {
  query: string
  userId?: string
}

interface SearchIntent {
  keywords: string[]
  category?: 'fashion' | 'electronics' | 'beauty' | 'food' | 'home' | 'other'
  minPrice?: number
  maxPrice?: number
  language: 'fr' | 'wo' | 'en'
  intent: string
}

export default async function handler(req: Request) {
  // Only allow POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const { query, userId }: SearchRequest = await req.json()

    if (!query || query.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Query is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Use Vercel AI SDK with Groq to parse the search query
    const { text } = await generateText({
      model: groq('llama-3.3-70b-versatile'), // Fast, accurate, cheap
      system: `You are a smart search assistant for BOBO, a Senegalese e-commerce app.
Your job is to understand user search queries in French, Wolof, or English and extract:
1. Keywords (most important search terms)
2. Category (fashion, electronics, beauty, food, home, other)
3. Price constraints (min/max price in CFA francs)
4. User intent (what they're looking for)

Context about Senegal:
- Common searches include: wax fabric, téléphones, beauty products, traditional clothing
- Price ranges: budget items 1000-10000 CFA, mid-range 10000-50000 CFA, premium 50000+ CFA
- Languages: French (official), Wolof (most spoken), some English

Examples:
Query: "robe rouge moins de 10000"
Output: {"keywords":["robe","rouge"],"category":"fashion","maxPrice":10000,"language":"fr","intent":"Looking for affordable red dress"}

Query: "waxoon na téléphone bu rafet"
Output: {"keywords":["téléphone","beau"],"category":"electronics","language":"wo","intent":"Looking for a beautiful/nice phone"}

Query: "quoi pour un mariage traditionnel?"
Output: {"keywords":["mariage","traditionnel","cérémonie"],"category":"fashion","language":"fr","intent":"Looking for traditional wedding outfit"}

Respond ONLY with valid JSON matching the SearchIntent type. No markdown, no explanation.`,
      prompt: `Parse this search query: "${query}"`,
      temperature: 0.3, // Lower temperature for more consistent structured output
    })

    // Parse the AI response
    let searchIntent: SearchIntent
    try {
      // Remove markdown code blocks if present
      const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      searchIntent = JSON.parse(cleanText)
    } catch (parseError) {
      // Fallback to basic parsing if AI returns invalid JSON
      console.error('Failed to parse AI response:', text)
      searchIntent = {
        keywords: query.split(' ').filter((w) => w.length > 2),
        language: 'fr',
        intent: 'Basic search',
      }
    }

    // Return the parsed search intent
    return new Response(JSON.stringify(searchIntent), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Smart search error:', error)
    return new Response(
      JSON.stringify({
        error: 'Search failed',
        message: error.message,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}
