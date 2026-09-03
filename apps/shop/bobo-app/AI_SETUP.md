# AI-Powered Search Setup Guide

> ⚠️ **STALE:** This document references Supabase, which has been removed. The Engine API is now the backend. AI search is now Engine-backed via `ai.service.engine.ts`.

BOBO features AI search powered by Vercel AI SDK + Groq.

## Features

### 1. Hybrid Smart Search
- **Simple queries**: Instant local NLP (free, offline) - e.g., "robe rouge"
- **Complex queries**: AI-powered understanding (Groq LLM) - e.g., "quoi pour un mariage traditionnel?"
- Automatically chooses the best approach

### 2. Visual Search
- Upload photo from gallery or take new photo
- AI vision model identifies products
- Finds similar items in catalog
- Uses Groq's Llama 3.2 Vision model

### 3. Multi-language Support
- **French**: "robe rouge moins de 10000 CFA"
- **Wolof**: "waxoon na telephone bu rafet"
- **English**: "beautiful dress under 20 dollars"

### 4. Smart Understanding
- Price extraction: "moins de 10000" -> maxPrice: 10000
- Category detection: "telephone" -> electronics
- Intent recognition: "pour un mariage" -> wedding outfits

## Architecture

```
React Native (BOBO App)
        |
   Hybrid Decision
   Simple? -> Local NLP
   Complex? -> Vercel
        |
   Vercel Edge Functions
        |
   Groq AI (Llama 3)
        |
   Engine API (engine.njooba.com)
```

## Setup Instructions

### Step 1: Get Groq API Key (FREE)

1. Go to https://console.groq.com
2. Sign up (GitHub login works)
3. Create API key
4. **Cost**: FREE tier includes 14,400 requests/day
5. Copy your API key

### Step 2: Deploy to Vercel

```bash
cd bobo-app

# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy API endpoints
vercel --prod

# Set environment variable
vercel env add GROQ_API_KEY
# Paste your Groq API key when prompted
```

### Step 3: Update App Environment

```bash
# Copy example env file
cp .env.example .env

# Edit .env
EXPO_PUBLIC_ENGINE_API_URL=https://engine.njooba.com
EXPO_PUBLIC_VERCEL_API_URL=https://your-deployment.vercel.app
```

### Step 4: Test AI Search

```bash
# Start app
pnpm start

# Try these searches:
# Simple (uses local NLP):
"robe rouge"

# Complex (uses AI):
"quoi pour un mariage traditionnel senegalais?"

# Visual search:
Tap camera button -> Select image of clothing
```

## Cost Breakdown

| Feature | Provider | Cost | Free Tier |
|---------|----------|------|-----------|
| Smart Text Search | Groq | $0.10 per 1M tokens | 14,400 requests/day FREE |
| Visual Search | Groq Vision | $0.20 per 1M tokens | Included in free tier |
| API Hosting | Vercel | $0 | 100GB bandwidth FREE |
| Local NLP | On-device | $0 | Unlimited |

**Total estimated cost**: $0-2/month for 10,000 users

## How It Works

### Hybrid Decision Logic

```typescript
// Automatically chooses best approach
isComplexQuery =
  query.length > 30 ||           // Long query
  query.includes('?') ||          // Question
  query.split(' ').length > 5 ||  // Many words
  /quoi|quel|comment/.test(query) // Question words

if (isComplexQuery) {
  // Use Vercel AI (Groq LLM)
} else {
  // Use local NLP (instant, free, offline)
}
```

### Models Used

1. **Text Search**: `llama-3.3-70b-versatile`
   - Fastest Llama model
   - Great at structured output (JSON)
   - Understands French/Wolof/English

2. **Visual Search**: `llama-3.2-11b-vision-preview`
   - Multimodal (text + images)
   - Identifies objects, colors, styles
   - Understands Senegalese context

## Customization

### Adjust Complexity Threshold

Edit `/bobo-app/src/services/ai.service.ts`:

```typescript
static isComplexQuery(query: string): boolean {
  const complexityIndicators = [
    query.length > 20,  // Lower threshold -> more AI
    query.length > 40,  // Higher threshold -> more local
  ]
  return complexityIndicators.filter(Boolean).length >= 2
}
```

### Change AI Models

Edit `/bobo-app/api/smart-search.ts`:

```typescript
// Faster but less accurate
model: groq('llama-3.1-8b-instant')

// Current (recommended)
model: groq('llama-3.3-70b-versatile')

// More accurate but slower
model: groq('llama-3.1-70b-versatile')
```

## Monitoring

### Check AI Usage

- Groq dashboard: https://console.groq.com/usage
- Vercel analytics: https://vercel.com/dashboard/analytics

### Search History Analytics

Query search patterns via the Engine API or Supabase dashboard (legacy):

```sql
SELECT
  language,
  category,
  COUNT(*) as searches
FROM search_history
GROUP BY language, category
ORDER BY searches DESC
```

## Troubleshooting

### "AI search failed" error

**Cause**: Vercel endpoint not reachable or Groq API key invalid

**Fix**:
```bash
# Check .env
echo $EXPO_PUBLIC_VERCEL_API_URL

# Test endpoint
curl https://your-deployment.vercel.app/api/smart-search \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"test"}'

# Verify Groq key
vercel env ls
```

### Visual search not working

**Cause**: Missing camera/gallery permissions

**Fix**: Check app permissions in device settings

### Slow AI responses

**Cause**: Using slower model or network latency

**Fix**:
- Switch to `llama-3.1-8b-instant` for speed
- Increase local NLP threshold
- Check Vercel edge function region

## Performance Metrics

- **Local NLP**: <50ms response time
- **Groq AI**: 200-500ms response time
- **Visual Search**: 1-2s processing time
- **Accuracy**: 95%+ for French, 90%+ for Wolof

## Support

- Vercel AI SDK: https://sdk.vercel.ai
- Groq Docs: https://console.groq.com/docs
