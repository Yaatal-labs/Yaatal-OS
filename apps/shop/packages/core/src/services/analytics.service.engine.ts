import { getYaatalClient } from './engine.client'

export type AnalyticsTrackInput = {
  event: string
  properties?: Record<string, unknown>
}

export type AnalyticsIdentifyInput = {
  traits?: Record<string, unknown>
}

export class AnalyticsServiceEngine {
  async track(input: AnalyticsTrackInput): Promise<void> {
    try {
      await (getYaatalClient() as any).analytics?.track(input)
    } catch (error) {
      console.warn('Analytics track failed:', error)
    }
  }

  async identify(input: AnalyticsIdentifyInput): Promise<void> {
    try {
      await (getYaatalClient() as any).analytics?.identify(input)
    } catch (error) {
      console.warn('Analytics identify failed:', error)
    }
  }
}

export const analyticsService = new AnalyticsServiceEngine()
export const analyticsServiceEngine = analyticsService
export default analyticsService
