// Re-export active Engine services for the BOBO runtime path.
export { AuthService, authService, authServiceEngine } from './auth.service.engine'
export {
  ProductsServiceEngine as ProductsService,
  productsServiceEngine as productsService,
  productsServiceEngine,
  mapEngineProductToProduct,
} from './products.service.engine'
export {
  OrdersServiceEngine as OrdersService,
  ordersServiceEngine as ordersService,
  ordersServiceEngine,
  mapEngineOrderToOrder,
  type EngineCheckoutPayment,
  type ShippingInfo,
} from './orders.service.engine'
export {
  AnalyticsServiceEngine,
  analyticsService,
  analyticsServiceEngine,
  type AnalyticsIdentifyInput,
  type AnalyticsTrackInput,
} from './analytics.service.engine'
export {
  NotificationsServiceEngine,
  notificationsService,
  notificationsServiceEngine,
  type NotificationListParams,
} from './notifications.service.engine'
export * from './engine.client'

// Non-commerce services stay on the legacy HTTP/PocketBase implementations so
// the active BOBO barrel does not import legacy sync/Supabase at startup.
export {
  AISearchService,
  NLPEngine,
  VoiceSearch,
  VisualSearch,
  RecommendationEngine,
  VercelAIService,
} from './ai.service'
export { ChatService, chatService } from './chat.service'
export type { ChatMessage } from './chat.service'
export { DeliveryService, deliveryService } from './delivery.service'
export type {
  DeliveryRequest,
  DeliveryPerson,
  DeliveryZone,
  DeliveryAssignment,
  DeliveryQuote,
  MerchantDeliveryPreferences,
} from '../types/delivery'

