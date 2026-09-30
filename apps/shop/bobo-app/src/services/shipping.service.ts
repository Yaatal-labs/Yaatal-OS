/**
 * Shipping Calculation Service
 * Handles shipping cost calculations, delivery options, and time estimates for Senegal-based deliveries
 */

/** Delivery zones in Senegal */
export type DeliveryZone = 'dakar_plateau' | 'dakar_suburbs' | 'thies' | 'saint_louis' | 'other';

/** Delivery methods available */
export type DeliveryMethod = 'standard' | 'express' | 'pickup';

/**
 * Shipping option with method, cost, and delivery time
 */
export interface ShippingOption {
  method: DeliveryMethod;
  cost: number;
  estimatedDays: string;
  available: boolean;
}

/**
 * Pricing constants in XOF (Senegalese Franc)
 */
const SHIPPING_PRICES = {
  SAME_CITY: 1000,
  DAKAR_SUBURBS: 1500,
  DAKAR_TO_NEARBY: 2500,
  DAKAR_TO_FAR: 4000,
  OTHER_REGIONS: 5000,
  PICKUP: 0,
} as const;

/**
 * Delivery time estimates by method and zone
 */
const DELIVERY_TIMES = {
  standard: {
    dakar_plateau: '1-2 days',
    dakar_suburbs: '1-2 days',
    thies: '2-3 days',
    saint_louis: '3-4 days',
    other: '4-7 days',
  },
  express: {
    dakar_plateau: '4-6 hours',
    dakar_suburbs: '4-6 hours',
    thies: '1 day',
    saint_louis: '1-2 days',
    other: '2-3 days',
  },
  pickup: {
    dakar_plateau: 'Same day',
    dakar_suburbs: 'Same day',
    thies: '1-2 days',
    saint_louis: '2-3 days',
    other: '3-5 days',
  },
} as const;

/**
 * City to delivery zone mapping
 */
const CITY_ZONES: Record<string, DeliveryZone> = {
  // Dakar Plateau (Central Dakar)
  'dakar': 'dakar_plateau',
  'dakar plateau': 'dakar_plateau',
  'medina': 'dakar_plateau',
  'plateau': 'dakar_plateau',

  // Dakar Suburbs
  'thiaroye': 'dakar_suburbs',
  'pikine': 'dakar_suburbs',
  'guediawaye': 'dakar_suburbs',
  'rufisque': 'dakar_suburbs',
  'keur massar': 'dakar_suburbs',

  // Thies Region
  'thies': 'thies',
  'thiès': 'thies',
  'thiès region': 'thies',
  'mbour': 'thies',
  'kaolack': 'thies',

  // Saint Louis Region
  'saint louis': 'saint_louis',
  'saint-louis': 'saint_louis',
  'saint-louis region': 'saint_louis',
  'saint louis region': 'saint_louis',
  'richard toll': 'saint_louis',
};

/**
 * Serviceable cities for delivery
 */
const SERVICEABLE_CITIES = [
  'dakar',
  'dakar plateau',
  'medina',
  'plateau',
  'thiaroye',
  'pikine',
  'guediawaye',
  'rufisque',
  'keur massar',
  'thies',
  'thiès',
  'mbour',
  'kaolack',
  'saint louis',
  'saint-louis',
  'richard toll',
];

/**
 * ShippingService class for managing shipping calculations and options
 */
class ShippingService {
  /**
   * Normalizes city name to lowercase for consistent lookup
   * @param city - The city name to normalize
   * @returns Normalized city name
   */
  private normalizeCity(city: string): string {
    return city.toLowerCase().trim();
  }

  /**
   * Determines the delivery zone for a given city
   * @param city - The city name
   * @returns The delivery zone
   */
  private getZoneForCity(city: string): DeliveryZone {
    const normalizedCity = this.normalizeCity(city);
    return CITY_ZONES[normalizedCity] || 'other';
  }

  /**
   * Calculates shipping cost based on origin and destination cities
   * @param fromCity - Origin city
   * @param toCity - Destination city
   * @param zone - Optional explicit delivery zone
   * @returns Shipping cost in XOF
   */
  calculateShippingCost(fromCity: string, toCity: string, zone?: DeliveryZone): number {
    const normalizedFrom = this.normalizeCity(fromCity);
    const normalizedTo = this.normalizeCity(toCity);

    // Pickup order
    if (normalizedTo === 'pickup') {
      return SHIPPING_PRICES.PICKUP;
    }

    // Same city
    if (normalizedFrom === normalizedTo) {
      return SHIPPING_PRICES.SAME_CITY;
    }

    // Use provided zone or determine from destination
    const targetZone = zone || this.getZoneForCity(toCity);

    switch (targetZone) {
      case 'dakar_plateau':
        return SHIPPING_PRICES.SAME_CITY;
      case 'dakar_suburbs':
        return SHIPPING_PRICES.DAKAR_SUBURBS;
      case 'thies':
        return SHIPPING_PRICES.DAKAR_TO_NEARBY;
      case 'saint_louis':
        return SHIPPING_PRICES.DAKAR_TO_FAR;
      case 'other':
      default:
        return SHIPPING_PRICES.OTHER_REGIONS;
    }
  }

  /**
   * Gets available shipping options between two cities
   * @param sellerCity - The seller's city
   * @param buyerCity - The buyer's city
   * @returns Array of available shipping options
   */
  getAvailableOptions(sellerCity: string, buyerCity: string): ShippingOption[] {
    const buyerZone = this.getZoneForCity(buyerCity);
    const isSameCity = this.normalizeCity(sellerCity) === this.normalizeCity(buyerCity);

    const options: ShippingOption[] = [];

    // Standard delivery option
    options.push({
      method: 'standard',
      cost: this.calculateShippingCost(sellerCity, buyerCity),
      estimatedDays: DELIVERY_TIMES.standard[buyerZone],
      available: this.isDeliveryAvailable(buyerCity),
    });

    // Express delivery option (available to all serviceable zones)
    options.push({
      method: 'express',
      cost: Math.round(this.calculateShippingCost(sellerCity, buyerCity) * 1.5),
      estimatedDays: DELIVERY_TIMES.express[buyerZone],
      available: this.isDeliveryAvailable(buyerCity),
    });

    // Pickup option (only for same city)
    if (isSameCity) {
      options.push({
        method: 'pickup',
        cost: SHIPPING_PRICES.PICKUP,
        estimatedDays: DELIVERY_TIMES.pickup[buyerZone],
        available: true,
      });
    }

    return options;
  }

  /**
   * Estimates delivery time for a specific delivery method and zone
   * @param method - The delivery method
   * @param zone - The delivery zone
   * @returns Estimated delivery time as a string
   */
  estimateDeliveryTime(method: DeliveryMethod, zone: DeliveryZone): string {
    return DELIVERY_TIMES[method][zone] || 'Estimated time not available';
  }

  /**
   * Checks if delivery is available to a specific city
   * @param city - The city name
   * @returns True if delivery is available, false otherwise
   */
  isDeliveryAvailable(city: string): boolean {
    const normalizedCity = this.normalizeCity(city);
    return SERVICEABLE_CITIES.includes(normalizedCity);
  }
}

/**
 * Singleton instance of ShippingService
 */
export const shippingService = new ShippingService();

export default shippingService;
