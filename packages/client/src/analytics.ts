import type { EngineHttpClient } from "./http.js";
import type { JsonObject } from "./types.js";

export interface AnalyticsTrackRequest {
  event: string;
  properties?: JsonObject;
}

export interface AnalyticsIdentifyRequest {
  traits?: JsonObject;
}

export interface AnalyticsResponse {
  success: boolean;
}

export class AnalyticsClient {
  constructor(private readonly http: EngineHttpClient) {}

  track(request: AnalyticsTrackRequest): Promise<AnalyticsResponse> {
    return this.http.request<AnalyticsResponse>("/api/analytics/track", {
      method: "POST",
      body: request,
    });
  }

  identify(request: AnalyticsIdentifyRequest): Promise<AnalyticsResponse> {
    return this.http.request<AnalyticsResponse>("/api/analytics/identify", {
      method: "POST",
      body: request,
    });
  }
}
