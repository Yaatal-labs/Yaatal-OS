import type { EngineHttpClient } from "./http.js";

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  pid: string;
  name: string;
  is_verified: boolean;
}

export interface CurrentUser {
  pid: string;
  name: string;
  email: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

export interface MagicLinkRequest {
  email: string;
}

export interface ResendVerificationRequest {
  email: string;
}

export class AuthClient {
  constructor(private readonly http: EngineHttpClient) {}

  async register(request: RegisterRequest): Promise<void> {
    await this.http.request<void>("/api/auth/register", {
      method: "POST",
      body: request,
    });
  }

  async login(request: LoginRequest): Promise<LoginResponse> {
    const response = await this.http.request<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: request,
    });
    this.http.setToken(response.token);
    return response;
  }

  current(): Promise<CurrentUser> {
    return this.http.request<CurrentUser>("/api/auth/current");
  }

  async forgotPassword(request: ForgotPasswordRequest): Promise<void> {
    await this.http.request<void>("/api/auth/forgot", {
      method: "POST",
      body: request,
    });
  }

  async resetPassword(request: ResetPasswordRequest): Promise<void> {
    await this.http.request<void>("/api/auth/reset", {
      method: "POST",
      body: request,
    });
  }

  async requestMagicLink(request: MagicLinkRequest): Promise<void> {
    await this.http.request<void>("/api/auth/magic-link", {
      method: "POST",
      body: request,
    });
  }

  async verifyMagicLink(token: string): Promise<LoginResponse> {
    const response = await this.http.request<LoginResponse>(
      `/api/auth/magic-link/${encodeURIComponent(token)}`,
    );
    this.http.setToken(response.token);
    return response;
  }

  async resendVerification(request: ResendVerificationRequest): Promise<void> {
    await this.http.request<void>("/api/auth/resend-verification-mail", {
      method: "POST",
      body: request,
    });
  }
}
