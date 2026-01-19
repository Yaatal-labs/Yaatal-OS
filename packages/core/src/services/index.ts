// Re-export all services (PowerSync versions as primary)
export * from './auth.service.powersync'
// PowerSync AI Services exported
export {
  AISearchServicePowerSync as AISearchService,
  AISearchServicePowerSync,
  NLPEngine,
  VoiceSearch,
  VisualSearch,
  RecommendationEngine,
  VercelAIService,
} from './ai.service.powersync'
// PocketBase versions deprecated - use PowerSync versions above
// export * from './ai.service'
// PowerSync Chat Service exported as default
export { ChatServicePowerSync as ChatService, chatServicePowerSync as chatService, type ChatMessage } from './chat.service.powersync'
// PocketBase version deprecated - use PowerSync version above
// export * from './chat.service'
// PowerSync Delivery Service exported as default
export { DeliveryServicePowerSync as DeliveryService, deliveryServicePowerSync as deliveryService } from './delivery.service.powersync'
// PocketBase version deprecated - use PowerSync version above
// export * from './delivery.service'
export * from './launches.service.powersync'
export * from './livestream.analytics.service.powersync'
// PowerSync Orders Service exported as default
export { OrdersServicePowerSync as OrdersService, ordersServicePowerSync as ordersService, type ShippingInfo } from './orders.service.powersync'
// PocketBase version deprecated - use PowerSync version above
// export * from './orders.service'
// PowerSync Products Service exported as default
export { ProductsServicePowerSync as ProductsService, productsServicePowerSync as productsService } from './products.service.powersync'
// PocketBase version deprecated - use PowerSync version above
// export * from './products.service'
