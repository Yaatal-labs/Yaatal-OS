/**
 * AI Service Tests
 * Testing NLP parsing, language detection, and category detection
 */

import { NLPEngine } from '@njooba/core'

describe('NLPEngine', () => {
  describe('parseQuery - Basic Keyword Extraction', () => {
    it('should extract keywords from simple query', () => {
      const intent = NLPEngine.parseQuery('robe rouge')

      expect(intent.keywords).toContain('robe')
      expect(intent.keywords).toContain('rouge')
      expect(intent.isQuestion).toBe(false)
    })

    it('should handle empty/whitespace-only queries', () => {
      const intent = NLPEngine.parseQuery('   ')

      expect(intent.keywords).toEqual([])
      expect(intent.language).toBe('fr')
    })

    it('should remove stop words from keywords', () => {
      const intent = NLPEngine.parseQuery('je cherche une robe rouge')

      // Should not include stop words like 'je', 'une', 'cherche'
      expect(intent.keywords).not.toContain('je')
      expect(intent.keywords).not.toContain('une')
      expect(intent.keywords).not.toContain('cherche')
      // But should include content words
      expect(intent.keywords).toContain('robe')
      expect(intent.keywords).toContain('rouge')
    })

    it('should limit keywords to 5', () => {
      const intent = NLPEngine.parseQuery('grande petite rouge bleu jaune vert noir blanc')

      expect(intent.keywords.length).toBeLessThanOrEqual(5)
    })

    it('should ignore numeric-only tokens', () => {
      const intent = NLPEngine.parseQuery('robe 123 rouge 456')

      expect(intent.keywords).not.toContain('123')
      expect(intent.keywords).not.toContain('456')
      expect(intent.keywords).toContain('robe')
      expect(intent.keywords).toContain('rouge')
    })
  })

  describe('parseQuery - Price Extraction', () => {
    it('should extract max price from "moins de" pattern', () => {
      const intent = NLPEngine.parseQuery('robe rouge moins de 10000')

      expect(intent.maxPrice).toBe(10000)
      expect(intent.minPrice).toBeUndefined()
    })

    it('should extract max price from "max" pattern', () => {
      const intent = NLPEngine.parseQuery('téléphone max 50000')

      expect(intent.maxPrice).toBe(50000)
    })

    it('should extract max price from "jusqu\'à" pattern', () => {
      const intent = NLPEngine.parseQuery('ordinateur jusqu\'à 500000')

      expect(intent.maxPrice).toBe(500000)
    })

    it('should extract min price from "plus de" pattern', () => {
      const intent = NLPEngine.parseQuery('robe plus de 5000')

      expect(intent.minPrice).toBe(5000)
      expect(intent.maxPrice).toBeUndefined()
    })

    it('should extract min price from "à partir de" pattern', () => {
      const intent = NLPEngine.parseQuery('tissu à partir de 2000')

      expect(intent.minPrice).toBe(2000)
    })

    it('should extract price range from "entre X et Y" pattern', () => {
      const intent = NLPEngine.parseQuery('robe entre 5000 et 10000')

      expect(intent.minPrice).toBe(5000)
      expect(intent.maxPrice).toBe(10000)
    })

    it('should extract price range from "X-Y" pattern', () => {
      const intent = NLPEngine.parseQuery('téléphone 20000-50000')

      expect(intent.minPrice).toBe(20000)
      expect(intent.maxPrice).toBe(50000)
    })

    it('should handle complex query with price and keywords', () => {
      const intent = NLPEngine.parseQuery('robe rouge moins de 10000')

      expect(intent.maxPrice).toBe(10000)
      expect(intent.keywords).toContain('robe')
      expect(intent.keywords).toContain('rouge')
    })
  })

  describe('parseQuery - Category Detection', () => {
    it('should detect fashion category from keywords', () => {
      const intent = NLPEngine.parseQuery('robe wax')

      expect(intent.category).toBe('fashion')
    })

    it('should detect electronics category', () => {
      const intent = NLPEngine.parseQuery('téléphone moderne')

      expect(intent.category).toBe('electronics')
    })

    it('should detect beauty category', () => {
      const intent = NLPEngine.parseQuery('maquillage rafet')

      expect(intent.category).toBe('beauty')
    })

    it('should detect food category', () => {
      const intent = NLPEngine.parseQuery('thiéboudienne délicieuse')

      expect(intent.category).toBe('food')
    })

    it('should detect home category', () => {
      const intent = NLPEngine.parseQuery('décoration kër')

      expect(intent.category).toBe('home')
    })

    it('should return undefined category for unrecognized keywords', () => {
      const intent = NLPEngine.parseQuery('xyz abc def')

      expect(intent.category).toBeUndefined()
    })
  })

  describe('parseQuery - Language Detection', () => {
    it('should detect French language by default', () => {
      const intent = NLPEngine.parseQuery('robe rouge')

      expect(intent.language).toBe('fr')
    })

    it('should detect Wolof language from Wolof keywords', () => {
      const intent = NLPEngine.parseQuery('waxoon na téléphone bu rafet')

      expect(intent.language).toBe('wo')
    })

    it('should detect English language from English keywords', () => {
      const intent = NLPEngine.parseQuery('beautiful phone')

      expect(intent.language).toBe('en')
    })

    it('should detect Wolof from "waxoon" keyword', () => {
      const intent = NLPEngine.parseQuery('waxoon na robe')

      expect(intent.language).toBe('wo')
    })

    it('should detect Wolof from "rafet" keyword', () => {
      const intent = NLPEngine.parseQuery('rafet yéré')

      expect(intent.language).toBe('wo')
    })

    it('should detect Wolof from "baax" keyword', () => {
      const intent = NLPEngine.parseQuery('baax lekk')

      expect(intent.language).toBe('wo')
    })
  })

  describe('parseQuery - Wolof Translation', () => {
    it('should translate Wolof "rafet" to French', () => {
      const intent = NLPEngine.parseQuery('waxoon na rafet')

      // "rafet" should be translated to "beau" and included in keywords
      expect(intent.keywords).toContain('beau')
    })

    it('should translate Wolof "baax" to French', () => {
      const intent = NLPEngine.parseQuery('baax yéré')

      expect(intent.keywords).toContain('bon')
    })

    it('should translate Wolof "lekk" to French', () => {
      const intent = NLPEngine.parseQuery('lekk thiéboudienne')

      expect(intent.keywords).toContain('manger')
    })

    it('should translate Wolof "kër" to French', () => {
      const intent = NLPEngine.parseQuery('décor kër')

      expect(intent.keywords).toContain('maison')
    })

    it('should translate Wolof "yéré" to French', () => {
      const intent = NLPEngine.parseQuery('yéré bleu')

      expect(intent.keywords).toContain('vêtement')
    })

    it('should handle multiple Wolof terms in one query', () => {
      const intent = NLPEngine.parseQuery('waxoon na rafet baax yéré')

      expect(intent.language).toBe('wo')
      expect(intent.keywords.length).toBeGreaterThan(0)
    })
  })

  describe('parseQuery - Question Detection', () => {
    it('should detect question from "?" symbol', () => {
      const intent = NLPEngine.parseQuery('robe rouge?')

      expect(intent.isQuestion).toBe(true)
    })

    it('should detect question starting with "quoi"', () => {
      const intent = NLPEngine.parseQuery('quoi pour un mariage?')

      expect(intent.isQuestion).toBe(true)
    })

    it('should detect question starting with "où"', () => {
      const intent = NLPEngine.parseQuery('où trouver une robe?')

      expect(intent.isQuestion).toBe(true)
    })

    it('should not mark statement as question', () => {
      const intent = NLPEngine.parseQuery('robe rouge élégante')

      expect(intent.isQuestion).toBe(false)
    })
  })

  describe('parseQuery - Complex Real-World Scenarios', () => {
    it('should handle complex fashion query with price', () => {
      const intent = NLPEngine.parseQuery('je cherche une belle robe rouge entre 5000 et 15000')

      expect(intent.category).toBe('fashion')
      expect(intent.minPrice).toBe(5000)
      expect(intent.maxPrice).toBe(15000)
      expect(intent.keywords).toContain('belle')
      expect(intent.keywords).toContain('robe')
      expect(intent.keywords).toContain('rouge')
    })

    it('should handle electronics query with Wolof and price', () => {
      const intent = NLPEngine.parseQuery('waxoon na telefon baax moins de 100000')

      expect(intent.language).toBe('wo')
      expect(intent.category).toBe('electronics')
      expect(intent.maxPrice).toBe(100000)
    })

    it('should handle occasion-based fashion query', () => {
      const intent = NLPEngine.parseQuery('robe pour mariage pas cher')

      expect(intent.category).toBe('fashion')
      expect(intent.keywords).toContain('mariage')
      expect(intent.keywords).toContain('pas')
    })

    it('should preserve case-insensitive parsing', () => {
      const intent1 = NLPEngine.parseQuery('ROBE ROUGE')
      const intent2 = NLPEngine.parseQuery('robe rouge')

      expect(intent1.keywords).toEqual(intent2.keywords)
      expect(intent1.category).toEqual(intent2.category)
    })

    it('should handle extra whitespace', () => {
      const intent1 = NLPEngine.parseQuery('robe   rouge   moins   de   10000')
      const intent2 = NLPEngine.parseQuery('robe rouge moins de 10000')

      expect(intent1.maxPrice).toEqual(intent2.maxPrice)
      expect(intent1.category).toEqual(intent2.category)
    })
  })

  describe('parseQuery - Edge Cases', () => {
    it('should handle null/undefined gracefully', () => {
      // @ts-ignore - testing runtime error handling
      const intent = NLPEngine.parseQuery(null)
      expect(intent.keywords).toEqual([])
      expect(intent.query).toBe('')
    })

    it('should handle very long queries', () => {
      const longQuery = 'robe ' + 'rouge '.repeat(50)
      const intent = NLPEngine.parseQuery(longQuery)

      expect(intent.keywords).toBeDefined()
      expect(intent.keywords.length).toBeLessThanOrEqual(5)
    })

    it('should handle queries with special characters', () => {
      const intent = NLPEngine.parseQuery('robe@#$%rouge')

      expect(intent.keywords).toBeDefined()
    })

    it('should handle mixed language query', () => {
      const intent = NLPEngine.parseQuery('beautiful robe waxoon na')

      // Should detect mixed language
      expect(['en', 'fr', 'wo']).toContain(intent.language)
    })
  })

  describe('parseQuery - Maintain Original Query', () => {
    it('should preserve original query in intent', () => {
      const originalQuery = 'Robe ROUGE Moins De 10000'
      const intent = NLPEngine.parseQuery(originalQuery)

      expect(intent.query).toBe(originalQuery)
    })

    it('should not modify query for keywords', () => {
      const query = 'Find me a robe'
      const intent = NLPEngine.parseQuery(query)

      expect(intent.query).toBe(query)
      expect(intent.keywords).not.toContain(query.toLowerCase())
    })
  })
})
