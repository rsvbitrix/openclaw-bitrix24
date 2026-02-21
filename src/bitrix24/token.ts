import type { BitrixAuth, WebhookAuth } from './types.js';

/**
 * Resolve Bitrix24 authentication credentials.
 *
 * Priority order (matches Telegram/Slack channel pattern):
 *   1. Per-account config (webhookUrl or accessToken)
 *   2. Global channel config (only for default account)
 *   3. Environment variable BITRIX24_WEBHOOK_URL (only for default account)
 *
 * Returns null if no credentials found.
 */
export function resolveAuth(opts: {
  accountId: string;
  accountWebhookUrl?: string;
  accountAccessToken?: string;
  accountRefreshToken?: string;
  accountClientId?: string;
  accountClientSecret?: string;
  accountExpiresAt?: number;
  globalWebhookUrl?: string;
  isDefault: boolean;
}): BitrixAuth | null {
  // 1. Per-account webhook URL
  const accountUrl = normalizeUrl(opts.accountWebhookUrl);
  if (accountUrl) {
    return { type: 'webhook', webhookUrl: accountUrl };
  }

  // 1b. Per-account OAuth token
  if (opts.accountAccessToken?.trim()) {
    return {
      type: 'oauth',
      accessToken: opts.accountAccessToken.trim(),
      refreshToken: opts.accountRefreshToken?.trim(),
      clientId: opts.accountClientId?.trim(),
      clientSecret: opts.accountClientSecret?.trim(),
      expiresAt: opts.accountExpiresAt,
    };
  }

  // Non-default accounts cannot fall through to global/env
  if (!opts.isDefault) return null;

  // 2. Global config webhook URL
  const globalUrl = normalizeUrl(opts.globalWebhookUrl);
  if (globalUrl) {
    return { type: 'webhook', webhookUrl: globalUrl };
  }

  // 3. Environment variable
  const envUrl = normalizeUrl(process.env.BITRIX24_WEBHOOK_URL);
  if (envUrl) {
    return { type: 'webhook', webhookUrl: envUrl };
  }

  return null;
}

/**
 * Extract domain from a webhook URL or auth config.
 */
export function extractDomain(auth: BitrixAuth): string {
  if (auth.type === 'webhook') {
    return new URL(auth.webhookUrl).hostname;
  }
  throw new Error('Cannot extract domain from OAuth auth without explicit domain');
}

/**
 * Extract domain from a webhook URL string.
 */
export function domainFromWebhookUrl(webhookUrl: string): string {
  return new URL(webhookUrl).hostname;
}

/**
 * Validate that a webhook URL looks correct.
 */
export function isValidWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.pathname.startsWith('/rest/') &&
      parsed.hostname.includes('bitrix24')
    );
  } catch {
    return false;
  }
}

function normalizeUrl(url: string | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  // Ensure trailing slash for consistent URL joining
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}
