import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  Bitrix24ClientConfig,
  BitrixApiResponse,
  DiskFile,
  WebhookAuth,
  OAuthAuth,
} from './types.js';
import { refreshTokens, expiresAtFromResponse, isTokenExpired, OAuthError } from './oauth.js';

/**
 * Token-bucket rate limiter.
 * Serializes requests to stay within Bitrix24 rate limits (default 2 req/s).
 */
class RateLimiter {
  private queue: Array<() => void> = [];
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillInterval: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(reqPerSec: number) {
    this.maxTokens = reqPerSec;
    this.tokens = reqPerSec;
    this.refillInterval = 1000 / reqPerSec;
  }

  async acquire(): Promise<void> {
    if (this.tokens > 0) {
      this.tokens--;
      this.ensureRefill();
      return;
    }
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.ensureRefill();
    });
  }

  private ensureRefill(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.queue.length > 0) {
        const next = this.queue.shift()!;
        next();
      } else {
        this.tokens = Math.min(this.tokens + 1, this.maxTokens);
        if (this.tokens >= this.maxTokens && this.queue.length === 0) {
          clearInterval(this.timer!);
          this.timer = null;
        }
      }
    }, this.refillInterval);
  }

  destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.queue = [];
  }
}

/** Error codes that indicate an expired or invalid OAuth token. */
const TOKEN_ERROR_CODES = ['expired_token', 'invalid_token', 'NO_AUTH_FOUND'];

/**
 * Bitrix24 REST API client.
 * Supports both webhook URL and OAuth authentication.
 * Built-in rate limiting (token bucket, default 2 req/s).
 * Automatic OAuth token refresh with retry-once on token errors.
 */
export class Bitrix24Client {
  private http: AxiosInstance;
  private limiter: RateLimiter;
  private config: Bitrix24ClientConfig;
  private refreshPromise: Promise<void> | null = null;

  constructor(config: Bitrix24ClientConfig) {
    this.config = config;
    this.limiter = new RateLimiter(config.rateLimit ?? 2);

    const baseURL = this.resolveBaseURL();
    const timeout = config.timeout ?? 30000;

    this.http = axios.create({ baseURL, timeout });
  }

  private resolveBaseURL(): string {
    const { auth, domain } = this.config;
    if (auth.type === 'webhook') {
      // Webhook URL already contains /rest/{userId}/{secret}/
      return auth.webhookUrl.replace(/\/$/, '');
    }
    return `https://${domain}/rest`;
  }

  private getAuthParams(): Record<string, string> {
    if (this.config.auth.type === 'oauth') {
      return { auth: (this.config.auth as OAuthAuth).accessToken };
    }
    // Webhook URLs don't need extra auth params — they're in the URL
    return {};
  }

  // ── OAuth refresh helpers ──────────────────────────────────────────────────

  private canRefresh(): boolean {
    if (this.config.auth.type !== 'oauth') return false;
    const oauth = this.config.auth as OAuthAuth;
    return !!(oauth.refreshToken && oauth.clientId && oauth.clientSecret);
  }

  /**
   * Proactive refresh: check expiresAt and refresh if within buffer window.
   * Coalesces concurrent calls into a single refresh request.
   */
  private async refreshIfNeeded(): Promise<void> {
    if (this.config.auth.type !== 'oauth') return;
    const oauth = this.config.auth as OAuthAuth;
    if (!isTokenExpired(oauth.expiresAt)) return;
    if (!this.canRefresh()) return;

    await this.doRefreshCoalesced(oauth);
  }

  /**
   * Forced refresh: used after a token error response.
   */
  private async forceRefresh(): Promise<void> {
    const oauth = this.config.auth as OAuthAuth;
    await this.doRefreshCoalesced(oauth);
  }

  /**
   * Coalesce concurrent refresh attempts into a single HTTP call.
   */
  private async doRefreshCoalesced(oauth: OAuthAuth): Promise<void> {
    if (this.refreshPromise) {
      await this.refreshPromise;
      return;
    }
    this.refreshPromise = this.doRefresh(oauth);
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async doRefresh(oauth: OAuthAuth): Promise<void> {
    const resp = await refreshTokens({
      refreshToken: oauth.refreshToken!,
      clientId: oauth.clientId!,
      clientSecret: oauth.clientSecret!,
    });

    const expiresAt = expiresAtFromResponse(resp.expires_in);

    // Update in-memory tokens
    oauth.accessToken = resp.access_token;
    oauth.refreshToken = resp.refresh_token;
    oauth.expiresAt = expiresAt;

    // Notify persistence callback
    await this.config.onTokenRefresh?.({
      accessToken: resp.access_token,
      refreshToken: resp.refresh_token,
      expiresAt,
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Call any Bitrix24 REST API method.
   * Automatically refreshes OAuth tokens if expired (proactive + reactive).
   */
  async callMethod<T = any>(method: string, params: Record<string, any> = {}): Promise<T> {
    await this.refreshIfNeeded();
    await this.limiter.acquire();

    const authParams = this.getAuthParams();
    const response = await this.http.post<BitrixApiResponse<T>>(
      `/${method}`,
      { ...params, ...authParams },
    );

    if (response.data.error) {
      // Reactive refresh: token expired between check and call
      if (TOKEN_ERROR_CODES.includes(response.data.error) && this.canRefresh()) {
        await this.forceRefresh();

        // Retry once
        await this.limiter.acquire();
        const retryAuth = this.getAuthParams();
        const retryResponse = await this.http.post<BitrixApiResponse<T>>(
          `/${method}`,
          { ...params, ...retryAuth },
        );
        if (retryResponse.data.error) {
          throw new Bitrix24Error(
            retryResponse.data.error,
            retryResponse.data.error_description ?? '',
            method,
          );
        }
        return retryResponse.data.result;
      }

      throw new Bitrix24Error(
        response.data.error,
        response.data.error_description ?? '',
        method,
      );
    }

    return response.data.result;
  }

  /**
   * Upload a file to Bitrix24 Disk storage.
   * Returns the created file record with DOWNLOAD_URL.
   */
  async uploadFile(storageId: number, fileName: string, fileContent: Buffer): Promise<DiskFile> {
    const base64 = fileContent.toString('base64');
    return this.callMethod<DiskFile>('disk.storage.uploadfile', {
      id: storageId,
      data: { NAME: fileName },
      fileContent: [fileName, base64],
    });
  }

  /**
   * Download a file from Bitrix24 by its download URL.
   * Automatically refreshes OAuth tokens if expired.
   */
  async downloadFile(downloadUrl: string): Promise<Buffer> {
    await this.refreshIfNeeded();
    await this.limiter.acquire();

    const authParams = this.getAuthParams();
    const url = authParams.auth
      ? `${downloadUrl}${downloadUrl.includes('?') ? '&' : '?'}auth=${authParams.auth}`
      : downloadUrl;

    try {
      const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
      return Buffer.from(response.data);
    } catch (err) {
      if (this.canRefresh() && isAxiosAuthError(err)) {
        await this.forceRefresh();
        await this.limiter.acquire();

        const retryAuth = this.getAuthParams();
        const retryUrl = retryAuth.auth
          ? `${downloadUrl}${downloadUrl.includes('?') ? '&' : '?'}auth=${retryAuth.auth}`
          : downloadUrl;
        const response = await axios.get(retryUrl, { responseType: 'arraybuffer', timeout: 60000 });
        return Buffer.from(response.data);
      }
      throw err;
    }
  }

  /**
   * Update OAuth tokens (after manual refresh).
   */
  updateTokens(accessToken: string, refreshToken?: string, expiresAt?: number): void {
    if (this.config.auth.type !== 'oauth') return;
    const oauth = this.config.auth as OAuthAuth;
    oauth.accessToken = accessToken;
    if (refreshToken) oauth.refreshToken = refreshToken;
    if (expiresAt !== undefined) oauth.expiresAt = expiresAt;
  }

  /**
   * Check if the client can reach the portal.
   */
  async probe(): Promise<{ ok: boolean; domain?: string; userId?: string; error?: string }> {
    try {
      const user = await this.callMethod<{
        ID: string;
        NAME: string;
        LAST_NAME: string;
      }>('user.current');
      return { ok: true, domain: this.config.domain, userId: user.ID };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }

  get domain(): string {
    return this.config.domain;
  }

  destroy(): void {
    this.limiter.destroy();
  }
}

/**
 * Check if an axios error is a 401/403 auth error (for download retry).
 */
function isAxiosAuthError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'response' in err) {
    const resp = (err as any).response;
    return resp?.status === 401 || resp?.status === 403;
  }
  return false;
}

/**
 * Typed Bitrix24 API error.
 */
export class Bitrix24Error extends Error {
  constructor(
    public readonly code: string,
    public readonly description: string,
    public readonly method: string,
  ) {
    super(`Bitrix24 API error [${method}]: ${code} — ${description}`);
    this.name = 'Bitrix24Error';
  }
}

/**
 * Create a Bitrix24Client from a webhook URL string.
 * Extracts domain automatically.
 */
export function createClientFromWebhook(webhookUrl: string): Bitrix24Client {
  const url = new URL(webhookUrl);
  const domain = url.hostname;

  return new Bitrix24Client({
    domain,
    auth: { type: 'webhook', webhookUrl },
  });
}
