/**
 * BOBO Gamification System
 * Adapted from NJOOBA for live commerce
 */

import { colors } from '../theme'

// XP Rewards for different actions
export const xpRewards = {
  // Customer actions
  scanQR: 5,
  viewProduct: 3,
  watchVideo: 10,
  followMerchant: 15,
  completePurchase: 100,
  leaveReview: 20,
  helpfulReview: 50,
  shareProduct: 15,
  firstPurchase: 50,
  repeatPurchase: 75,
  verifiedPurchase: 50,

  // Merchant actions
  listProduct: 25,
  uploadVideo: 30,
  firstSale: 150,
  completedOrder: 50,
  fiveStarReview: 100,
  respondToMessage: 10,
  quickResponse: 20,  // Respond within 1 hour

  // Engagement
  dailyLogin: 20,
  weeklyStreak: 100,
  monthlyGoal: 500,
  inviteFriend: 50,
  referralPurchase: 150,
} as const

// Level System
export interface Level {
  min: number
  max: number
  title: string
  emoji: string
  color: string
  benefits: string[]
}

export const boboLevels: Level[] = [
  {
    min: 0,
    max: 100,
    title: 'Newcomer',
    emoji: '🌱',
    color: colors.success,
    benefits: [
      'Accès au marketplace',
      'Scanner QR codes',
      'Acheter des produits',
    ],
  },
  {
    min: 101,
    max: 500,
    title: 'Shopper',
    emoji: '🛍️',
    color: colors.primary,
    benefits: [
      'Tous les avantages Newcomer',
      'Sauvegarder des produits',
      'Suivre des vendeurs',
      'Badge "Shopper"',
    ],
  },
  {
    min: 501,
    max: 1500,
    title: 'Seller',
    emoji: '🏪',
    color: colors.secondary,
    benefits: [
      'Tous les avantages Shopper',
      'Vendre des produits',
      'Générer des QR codes',
      'Messagerie clients',
    ],
  },
  {
    min: 1501,
    max: 5000,
    title: 'Merchant',
    emoji: '💼',
    color: colors.primary,
    benefits: [
      'Tous les avantages Seller',
      'Produits en vedette',
      'Vidéos de produits',
      'Support prioritaire',
    ],
  },
  {
    min: 5001,
    max: 15000,
    title: 'Mogul',
    emoji: '👑',
    color: colors.secondary,
    benefits: [
      'Tous les avantages Merchant',
      'Badge "Vérifié"',
      'Profil en vedette',
      'Analytics avancés',
    ],
  },
  {
    min: 15001,
    max: 999999,
    title: 'Market Leader',
    emoji: '🦁',
    color: colors.primary,
    benefits: [
      'Tous les avantages Mogul',
      'Badge "Market Leader"',
      'Placement prioritaire',
      'Partenariat BOBO',
    ],
  },
]

// Helper function to get level from XP
export const getLevelFromXP = (xp: number): Level => {
  return (
    boboLevels.find((level) => xp >= level.min && xp <= level.max) ||
    boboLevels[0]
  )
}

export const calculateLevel = getLevelFromXP

// Helper function to calculate progress to next level
export const getProgressToNextLevel = (xp: number): {
  current: Level
  next: Level | null
  progress: number
  remaining: number
} => {
  const current = getLevelFromXP(xp)
  const currentIndex = boboLevels.indexOf(current)
  const next = currentIndex < boboLevels.length - 1 ? boboLevels[currentIndex + 1] : null

  if (!next) {
    return {
      current,
      next: null,
      progress: 100,
      remaining: 0,
    }
  }

  const currentLevelXP = xp - current.min
  const nextLevelXP = next.min - current.min
  const progress = (currentLevelXP / nextLevelXP) * 100
  const remaining = next.min - xp

  return {
    current,
    next,
    progress: Math.min(progress, 100),
    remaining: Math.max(remaining, 0),
  }
}

// Streak milestones
export const streakMilestones = [
  { days: 3, reward: 50, title: '3 jours consécutifs' },
  { days: 7, reward: 150, title: '1 semaine' },
  { days: 14, reward: 300, title: '2 semaines' },
  { days: 30, reward: 1000, title: '1 mois' },
  { days: 90, reward: 3000, title: '3 mois' },
  { days: 365, reward: 15000, title: '1 an' },
] as const

// Achievement definitions
export interface Achievement {
  id: string
  title: string
  description: string
  icon: string  // Adinkra symbol name
  xpReward: number
  requirement: {
    type: 'count' | 'milestone' | 'special'
    value: number
    action?: string
  }
}

export const achievements: Achievement[] = [
  {
    id: 'first_scan',
    title: 'Premier Scan',
    description: 'Scanner votre premier QR code',
    icon: 'sankofa',
    xpReward: 50,
    requirement: { type: 'count', value: 1, action: 'scanQR' },
  },
  {
    id: 'first_purchase',
    title: 'Premier Achat',
    description: 'Compléter votre premier achat',
    icon: 'fihankra',
    xpReward: 100,
    requirement: { type: 'count', value: 1, action: 'completePurchase' },
  },
  {
    id: 'first_sale',
    title: 'Première Vente',
    description: 'Réaliser votre première vente',
    icon: 'dwennimmen',
    xpReward: 150,
    requirement: { type: 'count', value: 1, action: 'completedOrder' },
  },
  {
    id: 'ten_sales',
    title: 'Vendeur Actif',
    description: '10 ventes réussies',
    icon: 'dwennimmen',
    xpReward: 500,
    requirement: { type: 'count', value: 10, action: 'completedOrder' },
  },
  {
    id: 'hundred_sales',
    title: 'Centurion',
    description: '100 ventes réussies',
    icon: 'dwennimmen',
    xpReward: 5000,
    requirement: { type: 'count', value: 100, action: 'completedOrder' },
  },
  {
    id: 'verified_seller',
    title: 'Vendeur Vérifié',
    description: 'Compte vérifié par BOBO',
    icon: 'fihankra',
    xpReward: 1000,
    requirement: { type: 'special', value: 1 },
  },
  {
    id: 'community_star',
    title: 'Étoile Communautaire',
    description: '50 reviews positives reçues',
    icon: 'gyenyame',
    xpReward: 2000,
    requirement: { type: 'milestone', value: 50 },
  },
  {
    id: 'loyal_customer',
    title: 'Client Fidèle',
    description: '10 achats complétés',
    icon: 'sankofa',
    xpReward: 1000,
    requirement: { type: 'count', value: 10, action: 'completePurchase' },
  },
  {
    id: 'video_creator',
    title: 'Créateur de Contenu',
    description: '5 vidéos de produits uploadées',
    icon: 'gyenyame',
    xpReward: 500,
    requirement: { type: 'count', value: 5, action: 'uploadVideo' },
  },
  {
    id: 'quick_responder',
    title: 'Réponse Rapide',
    description: 'Répondre à 20 messages en moins d\'1 heure',
    icon: 'mpatapo',
    xpReward: 750,
    requirement: { type: 'count', value: 20, action: 'quickResponse' },
  },
]
