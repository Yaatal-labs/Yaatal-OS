/**
 * Adinkra Symbols - West African Cultural Icons
 * Used throughout BOBO for trust badges, achievements, and cultural authenticity
 */

export const adinkraSymbols = {
  sankofa: {
    name: 'Sankofa',
    meaning: 'Learn from the past',
    usage: 'saved_products_purchase_history',
    symbol: '⟲',
    description: 'Return and retrieve - looking back to learn from the past',
  },
  gyeNyame: {
    name: 'Gye Nyame',
    meaning: 'Supremacy of God / Community',
    usage: 'community_marketplace_badge',
    symbol: '✧',
    description: 'Except for God - the supreme importance of community',
  },
  dwennimmen: {
    name: 'Dwennimmen',
    meaning: 'Strength & Humility',
    usage: 'seller_achievements_reputation',
    symbol: '⚛',
    description: 'Ram\'s horns - strength balanced with humility',
  },
  fihankra: {
    name: 'Fihankra',
    meaning: 'Security & Safety',
    usage: 'verified_sellers_secure_payments',
    symbol: '◈',
    description: 'House with compound - security and safety',
  },
  mpatapo: {
    name: 'Mpatapo',
    meaning: 'Reconciliation',
    usage: 'dispute_resolution_returns',
    symbol: '⚯',
    description: 'Knot of reconciliation - peacemaking and unity',
  },
} as const

// Achievement Icons (mapped to Adinkra symbols)
export const achievementIcons = {
  first_sale: {
    symbol: adinkraSymbols.dwennimmen.symbol,
    title: 'Premier Vendeur',
    description: 'Première vente réalisée',
    adinkra: 'dwennimmen',
  },
  verified_seller: {
    symbol: adinkraSymbols.fihankra.symbol,
    title: 'Vendeur Vérifié',
    description: 'Compte vérifié et sécurisé',
    adinkra: 'fihankra',
  },
  community_star: {
    symbol: adinkraSymbols.gyeNyame.symbol,
    title: 'Étoile Communautaire',
    description: 'Membre actif de la communauté',
    adinkra: 'gyenyame',
  },
  hundred_sales: {
    symbol: adinkraSymbols.dwennimmen.symbol,
    title: 'Centurion',
    description: '100 ventes réussies',
    adinkra: 'dwennimmen',
  },
  trusted_buyer: {
    symbol: adinkraSymbols.fihankra.symbol,
    title: 'Acheteur de Confiance',
    description: 'Historique d\'achat fiable',
    adinkra: 'fihankra',
  },
  repeat_customer: {
    symbol: adinkraSymbols.sankofa.symbol,
    title: 'Client Fidèle',
    description: '10 achats complétés',
    adinkra: 'sankofa',
  },
  peacemaker: {
    symbol: adinkraSymbols.mpatapo.symbol,
    title: 'Pacificateur',
    description: 'Résolution réussie de litiges',
    adinkra: 'mpatapo',
  },
} as const

// Trust Badge Types
export type TrustBadgeType = 'verified' | 'trusted' | 'new' | 'star'

export const trustBadges = {
  verified: {
    label: 'Vérifié',
    symbol: adinkraSymbols.fihankra.symbol,
    color: '#1B4D3E',  // Forest green
  },
  trusted: {
    label: 'De Confiance',
    symbol: adinkraSymbols.dwennimmen.symbol,
    color: '#F2A541',  // Savanna gold
  },
  new: {
    label: 'Nouveau',
    symbol: '🌱',
    color: '#E07856',  // Terracotta
  },
  star: {
    label: 'Étoile',
    symbol: adinkraSymbols.gyeNyame.symbol,
    color: '#F2A541',  // Savanna gold
  },
} as const
