import axios from 'axios';

/** Bitrix24 central OAuth endpoint. */
const OAUTH_URL = 'https://oauth.bitrix.info/oauth/token/';

/** Shape of Bitrix24's token endpoint response. */
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds (typically 3600)
  domain: string;
  member_id: string;
  scope: string;
  server_endpoint: string;
  status: string;
}

/** Typed OAuth error from the token endpoint. */
export class OAuthError extends Error {
  constructor(
    public readonly oauthCode: string,
    public readonly oauthDescription: string,
  ) {
    super(`OAuth error: ${oauthCode} — ${oauthDescription}`);
    this.name = 'OAuthError';
  }
}

/**
 * Exchange an authorization code for tokens.
 * Called once during initial app installation.
 */
export async function exchangeCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
}): Promise<TokenResponse> {
  const { data } = await axios.get(OAUTH_URL, {
    params: {
      grant_type: 'authorization_code',
      client_id: params.clientId,
      client_secret: params.clientSecret,
      code: params.code,
    },
  });
  if (data.error) {
    throw new OAuthError(data.error, data.error_description ?? '');
  }
  return data as TokenResponse;
}

/**
 * Refresh an expired access token.
 * Returns new access_token + refresh_token pair.
 */
export async function refreshTokens(params: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<TokenResponse> {
  const { data } = await axios.get(OAUTH_URL, {
    params: {
      grant_type: 'refresh_token',
      client_id: params.clientId,
      client_secret: params.clientSecret,
      refresh_token: params.refreshToken,
    },
  });
  if (data.error) {
    throw new OAuthError(data.error, data.error_description ?? '');
  }
  return data as TokenResponse;
}

/**
 * Convert expires_in (seconds) to an absolute unix-ms timestamp.
 * Applies a buffer (default 5 minutes) so proactive refresh happens before expiry.
 */
export function expiresAtFromResponse(
  expiresInSec: number,
  bufferMs: number = 5 * 60 * 1000,
): number {
  return Date.now() + expiresInSec * 1000 - bufferMs;
}

/**
 * Check whether the token has expired (or is within the buffer window).
 */
export function isTokenExpired(expiresAt: number | undefined): boolean {
  if (expiresAt === undefined) return false;
  return Date.now() >= expiresAt;
}
