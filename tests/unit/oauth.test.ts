import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('axios', () => ({
  default: { get: vi.fn() },
}));

import axios from 'axios';
import {
  exchangeCode,
  refreshTokens,
  expiresAtFromResponse,
  isTokenExpired,
  OAuthError,
} from '../../src/bitrix24/oauth.js';

const mockGet = axios.get as ReturnType<typeof vi.fn>;

const tokenResponse = {
  access_token: 'new_access',
  refresh_token: 'new_refresh',
  expires_in: 3600,
  domain: 'test.bitrix24.ru',
  member_id: 'abc123',
  scope: 'imbot,im,disk',
  server_endpoint: 'https://oauth.bitrix.info/rest/',
  status: 'L',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── exchangeCode ─────────────────────────────────────────────────────────────

describe('exchangeCode', () => {
  it('returns token response on success', async () => {
    mockGet.mockResolvedValueOnce({ data: tokenResponse });

    const result = await exchangeCode({
      code: 'auth_code_123',
      clientId: 'client_id',
      clientSecret: 'client_secret',
    });

    expect(result).toEqual(tokenResponse);
    expect(mockGet).toHaveBeenCalledWith(
      'https://oauth.bitrix.info/oauth/token/',
      {
        params: {
          grant_type: 'authorization_code',
          client_id: 'client_id',
          client_secret: 'client_secret',
          code: 'auth_code_123',
        },
      },
    );
  });

  it('throws OAuthError on error response', async () => {
    mockGet.mockResolvedValueOnce({
      data: { error: 'invalid_request', error_description: 'Bad code' },
    });

    await expect(
      exchangeCode({ code: 'bad', clientId: 'id', clientSecret: 'secret' }),
    ).rejects.toThrow(OAuthError);

    try {
      mockGet.mockResolvedValueOnce({
        data: { error: 'invalid_request', error_description: 'Bad code' },
      });
      await exchangeCode({ code: 'bad', clientId: 'id', clientSecret: 'secret' });
    } catch (err) {
      expect(err).toBeInstanceOf(OAuthError);
      expect((err as OAuthError).oauthCode).toBe('invalid_request');
      expect((err as OAuthError).oauthDescription).toBe('Bad code');
    }
  });

  it('handles missing error_description', async () => {
    mockGet.mockResolvedValueOnce({
      data: { error: 'server_error' },
    });

    try {
      await exchangeCode({ code: 'x', clientId: 'id', clientSecret: 'secret' });
    } catch (err) {
      expect((err as OAuthError).oauthDescription).toBe('');
    }
  });
});

// ── refreshTokens ────────────────────────────────────────────────────────────

describe('refreshTokens', () => {
  it('returns token response on success', async () => {
    mockGet.mockResolvedValueOnce({ data: tokenResponse });

    const result = await refreshTokens({
      refreshToken: 'old_refresh',
      clientId: 'client_id',
      clientSecret: 'client_secret',
    });

    expect(result).toEqual(tokenResponse);
    expect(mockGet).toHaveBeenCalledWith(
      'https://oauth.bitrix.info/oauth/token/',
      {
        params: {
          grant_type: 'refresh_token',
          client_id: 'client_id',
          client_secret: 'client_secret',
          refresh_token: 'old_refresh',
        },
      },
    );
  });

  it('throws OAuthError on invalid_grant', async () => {
    mockGet.mockResolvedValueOnce({
      data: { error: 'invalid_grant', error_description: 'Refresh token expired' },
    });

    await expect(
      refreshTokens({ refreshToken: 'expired', clientId: 'id', clientSecret: 'secret' }),
    ).rejects.toThrow(OAuthError);
  });
});

// ── expiresAtFromResponse ────────────────────────────────────────────────────

describe('expiresAtFromResponse', () => {
  it('calculates expiry with default 5-minute buffer', () => {
    const now = Date.now();
    vi.setSystemTime(now);

    const result = expiresAtFromResponse(3600);
    expect(result).toBe(now + 3600 * 1000 - 5 * 60 * 1000);

    vi.useRealTimers();
  });

  it('accepts custom buffer', () => {
    const now = Date.now();
    vi.setSystemTime(now);

    const result = expiresAtFromResponse(3600, 60000);
    expect(result).toBe(now + 3600 * 1000 - 60000);

    vi.useRealTimers();
  });
});

// ── isTokenExpired ───────────────────────────────────────────────────────────

describe('isTokenExpired', () => {
  it('returns false when expiresAt is undefined', () => {
    expect(isTokenExpired(undefined)).toBe(false);
  });

  it('returns false when token is still valid', () => {
    expect(isTokenExpired(Date.now() + 60000)).toBe(false);
  });

  it('returns true when token has expired', () => {
    expect(isTokenExpired(Date.now() - 1000)).toBe(true);
  });

  it('returns true when token expires exactly now', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    expect(isTokenExpired(now)).toBe(true);
    vi.useRealTimers();
  });
});

// ── OAuthError ───────────────────────────────────────────────────────────────

describe('OAuthError', () => {
  it('has correct name and properties', () => {
    const err = new OAuthError('invalid_grant', 'Token revoked');
    expect(err.name).toBe('OAuthError');
    expect(err.oauthCode).toBe('invalid_grant');
    expect(err.oauthDescription).toBe('Token revoked');
    expect(err.message).toContain('invalid_grant');
    expect(err.message).toContain('Token revoked');
  });
});
