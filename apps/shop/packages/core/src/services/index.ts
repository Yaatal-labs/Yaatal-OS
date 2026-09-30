// Re-export active Engine services for the BOBO runtime path.
export { AuthService, authService, authServiceEngine } from './auth.service.engine'
export {
  ProductsServiceEngine as ProductsService,
  productsServiceEngine as productsService,
  productsServiceEngine,
  mapEngineProductToProduct,
} from './products.service.engine'
export {
  CatalogServiceEngine as CatalogService,
  catalogServiceEngine as catalogService,
  catalogServiceEngine,
  mapCatalogProductToProduct,
  type CatalogProductView,
} from './catalog.service.engine'
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
export {
  ChatServiceEngine as ChatService,
  chatServiceEngine as chatService,
  chatServiceEngine,
  type ChatMessage,
} from './chat.service.engine'
export {
  AIServiceEngine as AIService,
  aiServiceEngine as aiService,
  aiServiceEngine,
  type ProductSearchResult,
} from './ai.service.engine'
export {
  DeliveryServiceEngine as DeliveryService,
  deliveryServiceEngine as deliveryService,
  deliveryServiceEngine,
} from './delivery.service.engine'
export * from './engine.client'