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
export * from './engine.client'

// AI, chat, and delivery services are pending Engine integration.
// The legacy PocketBase-backed implementations have been removed.
// See docs/TEAM-ONBOARDING.en.md for the integration roadmap.

