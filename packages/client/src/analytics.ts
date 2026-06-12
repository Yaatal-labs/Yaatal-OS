import type { EngineHttpClient } from "./http.js";
import type { SearchMetadata } from "./search.js";

export interface AnalyticsTrackRequest {
  event: string;
  properties?: SearchMetadata;
}

export interface AnalyticsIdentifyRequest {
  traits?: SearchMetadata;
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
