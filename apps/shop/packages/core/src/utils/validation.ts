/**
 * Input Validation Utilities
 * Ported from NJOOBA with African phone number support
 */

export interface ValidationResult {
  valid: boolean
  error?: string
}

// Email validation
export const validateEmail = (email: string): ValidationResult => {
  if (!email || !email.trim()) {
    return { valid: false, error: 'L\'email est requis' }
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Format d\'email invalide' }
  }

  return { valid: true }
}

// Password validation (NJOOBA's strong requirements)
export const validatePassword = (password: string): ValidationResult => {
  if (!password) {
    return { valid: false, error: 'Le mot de passe est requis' }
  }

  // Minimum 12 characters
  if (password.length < 12) {
    return {
      valid: false,
      error: 'Le mot de passe doit contenir au moins 12 caractères',
    }
  }

  // Require uppercase, lowercase, number, and special character
  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/.test(password)) {
    return {
      valid: false,
      error:
        'Le mot de passe doit contenir: majuscule, minuscule, chiffre et caractère spécial (@$!%*?&)',
    }
  }

  // Check against common weak passwords
  const commonPasswords = [
    'password123',
    'password123!',
    'admin123!',
    'welcome123!',
    '123456789012',
    'qwerty123456!',
    'letmein123!',
  ]

  const lowerPassword = password.toLowerCase()
  if (
    commonPasswords.some((common) =>
      lowerPassword.includes(common.toLowerCase())
    )
  ) {
    return {
      valid: false,
      error: 'Ce mot de passe est trop commun. Choisissez un mot de passe plus fort',
    }
  }

  return { valid: true }
}

// Username validation
export const validateUsername = (username: string): ValidationResult => {
  if (!username || !username.trim()) {
    return { valid: false, error: 'Le nom d\'utilisateur est requis' }
  }

  if (username.length < 3 || username.length > 20) {
    return {
      valid: false,
      error: 'Le nom d\'utilisateur doit contenir entre 3 et 20 caractères',
    }
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return {
      valid: false,
      error:
        'Le nom d\'utilisateur ne peut contenir que des lettres, chiffres, tirets et underscores',
    }
  }

  return { valid: true }
}

// Phone number validation (West African formats)
export const validatePhoneNumber = (phone: string): ValidationResult => {
  if (!phone || !phone.trim()) {
    return { valid: false, error: 'Le numéro de téléphone est requis' }
  }

  // Remove spaces and dashes
  const cleanPhone = phone.replace(/[\s-]/g, '')

  // Check for valid Senegal phone numbers
  // Format: +221XXXXXXXXX or 221XXXXXXXXX or 7XXXXXXXX or 3XXXXXXXX
  const senegalRegex = /^(\+?221)?[73]\d{8}$/

  if (!senegalRegex.test(cleanPhone)) {
    return {
      valid: false,
      error:
        'Numéro de téléphone invalide. Format attendu: +221XXXXXXXXX ou 7XXXXXXXX',
    }
  }

  return { valid: true }
}

// Product title validation
export const validateProductTitle = (title: string): ValidationResult => {
  if (!title || !title.trim()) {
    return { valid: false, error: 'Le titre du produit est requis' }
  }

  if (title.length < 3 || title.length > 200) {
    return {
      valid: false,
      error: 'Le titre doit contenir entre 3 et 200 caractères',
    }
  }

  return { valid: true }
}

// Price validation
export const validatePrice = (price: number | string): ValidationResult => {
  const numPrice = typeof price === 'string' ? parseFloat(price) : price

  if (isNaN(numPrice)) {
    return { valid: false, error: 'Prix invalide' }
  }

  if (numPrice <= 0) {
    return { valid: false, error: 'Le prix doit être supérieur à 0' }
  }

  if (numPrice > 100000000) {
    return { valid: false, error: 'Le prix est trop élevé' }
  }

  return { valid: true }
}

// Stock quantity validation
export const validateStockQuantity = (
  quantity: number | string
): ValidationResult => {
  const numQty = typeof quantity === 'string' ? parseInt(quantity, 10) : quantity

  if (isNaN(numQty)) {
    return { valid: false, error: 'Quantité invalide' }
  }

  if (numQty < 0) {
    return { valid: false, error: 'La quantité ne peut pas être négative' }
  }

  return { valid: true }
}

// SKU validation
export const validateSKU = (sku: string): ValidationResult => {
  if (!sku || !sku.trim()) {
    return { valid: false, error: 'Le SKU est requis' }
  }

  // SKU format: uppercase letters, numbers, and hyphens only
  if (!/^[A-Z0-9-]+$/.test(sku)) {
    return {
      valid: false,
      error: 'Le SKU ne peut contenir que des majuscules, chiffres et tirets',
    }
  }

  if (sku.length < 3 || sku.length > 20) {
    return {
      valid: false,
      error: 'Le SKU doit contenir entre 3 et 20 caractères',
    }
  }

  return { valid: true }
}

// Generate random SKU
export const generateSKU = (prefix: string = 'BOBO'): string => {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `${prefix}-${timestamp}-${random}`
}
