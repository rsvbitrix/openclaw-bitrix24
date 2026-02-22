import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Bitrix24Client, Bitrix24Error, createClientFromWebhook } from '../../src/bitrix24/client.js';
import { OAuthError } from '../../src/bitrix24/oauth.js';

vi.mock('axios', () => {
  const mockPost = vi.fn();
  const mockGet = vi.fn();
  const mockCreate = vi.fn(() => ({ post: mockPost, get: mockGet }));
  return {
    default: {
      create: mockCreate,
      get: mockGet,
    },
    __mockPost: mockPost,
    __mockGet: mockGet,
    __mockCreate: mockCreate,
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
import axios from 'axios';
const { __mockPost: mockPost, __mockGet: mockGet, __mockCreate: mockCreate } = await import('axios') as any;

beforeEach(() => {
  vi.clearAllMocks();
});

/** Standard refresh response from oauth.bitrix.info. */
const refreshResponse = {
  access_token: 'refreshed_access',
  refresh_token: 'refreshed_refresh',
  expires_in: 3600,
  domain: 'test.bitrix24.ru',
  member_id: 'abc',
  scope: 'imbot',
  server_endpoint: 'https://oauth.bitrix.info/rest/',
  status: 'L',
};

// ── createClientFromWebhook ──────────────────────────────────────────────────

describe('createClientFromWebhook', () => {
  it('extracts domain from webhook URL', () => {
    const client = createClientFromWebhook('https://test.bitrix24.ru/rest/1/abc123/');
    expect(client.domain).toBe('test.bitrix24.ru');
    client.destroy();
  });

  it('creates axios instance with webhook URL as baseURL', () => {
    const client = createClientFromWebhook('https://portal.bitrix24.ru/rest/5/secret/');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://portal.bitrix24.ru/rest/5/secret',
        timeout: 30000,
      }),
    );
    client.destroy();
  });
});

// ── Bitrix24Client.callMethod ────────────────────────────────────────────────

describe('Bitrix24Client.callMethod', () => {
  function makeWebhookClient(): Bitrix24Client {
    return new Bitrix24Client({
      domain: 'test.bitrix24.ru',
      auth: { type: 'webhook', webhookUrl: 'https://test.bitrix24.ru/rest/1/abc/' },
    });
  }

  it('makes POST request and returns result', async () => {
    mockPost.mockResolvedValueOnce({
      data: { result: { ID: '42', NAME: 'Deal' } },
    });

    const client = makeWebhookClient();
    const result = await client.callMethod('crm.deal.get', { id: 42 });

    expect(mockPost).toHaveBeenCalledWith('/crm.deal.get', { id: 42 });
    expect(result).toEqual({ ID: '42', NAME: 'Deal' });
    client.destroy();
  });

  it('throws Bitrix24Error on API error response', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        result: null,
        error: 'ACCESS_DENIED',
        error_description: 'Insufficient permissions',
      },
    });

    const client = makeWebhookClient();

    await expect(client.callMethod('crm.deal.get', { id: 1 }))
      .rejects
      .toThrow(Bitrix24Error);

    try {
      mockPost.mockResolvedValueOnce({
        data: {
          result: null,
          error: 'NOT_FOUND',
          error_description: 'Element not found',
        },
      });
      await client.callMethod('crm.deal.get', { id: 999 });
    } catch (err) {
      expect(err).toBeInstanceOf(Bitrix24Error);
      const b24err = err as Bitrix24Error;
      expect(b24err.code).toBe('NOT_FOUND');
      expect(b24err.description).toBe('Element not found');
      expect(b24err.method).toBe('crm.deal.get');
    }

    client.destroy();
  });

  it('sends OAuth auth param when using OAuth config', async () => {
    mockPost.mockResolvedValueOnce({
      data: { result: { ID: '1' } },
    });

    const client = new Bitrix24Client({
      domain: 'oauth.bitrix24.ru',
      auth: { type: 'oauth', accessToken: 'tok_abc' },
    });

    await client.callMethod('user.current');

    expect(mockPost).toHaveBeenCalledWith('/user.current', { auth: 'tok_abc' });
    client.destroy();
  });

  it('does not send auth param for webhook config', async () => {
    mockPost.mockResolvedValueOnce({
      data: { result: { ID: '1' } },
    });

    const client = makeWebhookClient();
    await client.callMethod('user.current');

    expect(mockPost).toHaveBeenCalledWith('/user.current', {});
    client.destroy();
  });
});

// ── Bitrix24Client.probe ─────────────────────────────────────────────────────

describe('Bitrix24Client.probe', () => {
  it('returns ok:true with domain and userId on success', async () => {
    mockPost.mockResolvedValueOnce({
      data: { result: { ID: '7', NAME: 'Ivan', LAST_NAME: 'Petrov' } },
    });

    const client = new Bitrix24Client({
      domain: 'probe.bitrix24.ru',
      auth: { type: 'webhook', webhookUrl: 'https://probe.bitrix24.ru/rest/1/x/' },
    });

    const result = await client.probe();
    expect(result).toEqual({ ok: true, domain: 'probe.bitrix24.ru', userId: '7' });
    client.destroy();
  });

  it('returns ok:false with error message on failure', async () => {
    mockPost.mockRejectedValueOnce(new Error('Network error'));

    const client = new Bitrix24Client({
      domain: 'down.bitrix24.ru',
      auth: { type: 'webhook', webhookUrl: 'https://down.bitrix24.ru/rest/1/x/' },
    });

    const result = await client.probe();
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Network error');
    client.destroy();
  });
});

// ── Bitrix24Client.updateTokens ──────────────────────────────────────────────

describe('Bitrix24Client.updateTokens', () => {
  it('updates OAuth access and refresh tokens', async () => {
    mockPost.mockResolvedValue({
      data: { result: { ID: '1' } },
    });

    const client = new Bitrix24Client({
      domain: 'oauth.bitrix24.ru',
      auth: { type: 'oauth', accessToken: 'old_token', refreshToken: 'old_refresh' },
    });

    client.updateTokens('new_token', 'new_refresh');

    await client.callMethod('user.current');

    expect(mockPost).toHaveBeenCalledWith('/user.current', { auth: 'new_token' });
    client.destroy();
  });

  it('updates only access token when refresh is omitted', async () => {
    mockPost.mockResolvedValue({
      data: { result: { ID: '1' } },
    });

    const client = new Bitrix24Client({
      domain: 'oauth.bitrix24.ru',
      auth: { type: 'oauth', accessToken: 'old', refreshToken: 'keep_this' },
    });

    client.updateTokens('new_access');

    await client.callMethod('user.current');
    expect(mockPost).toHaveBeenCalledWith('/user.current', { auth: 'new_access' });
    client.destroy();
  });

  it('updates expiresAt when provided', () => {
    const client = new Bitrix24Client({
      domain: 'oauth.bitrix24.ru',
      auth: { type: 'oauth', accessToken: 'tok' },
    });

    client.updateTokens('tok2', 'ref2', 1700000000000);
    // No throw means success; actual expiresAt is verified via proactive refresh tests
    client.destroy();
  });

  it('does nothing for webhook auth', () => {
    const client = new Bitrix24Client({
      domain: 'wh.bitrix24.ru',
      auth: { type: 'webhook', webhookUrl: 'https://wh.bitrix24.ru/rest/1/x/' },
    });

    // Should not throw
    client.updateTokens('anything');
    client.destroy();
  });
});

// ── Bitrix24Client.uploadFile ────────────────────────────────────────────────

describe('Bitrix24Client.uploadFile', () => {
  it('calls disk.storage.uploadfile with base64-encoded content', async () => {
    const fakeDiskFile = {
      ID: '100',
      NAME: 'test.txt',
      SIZE: 11,
      DOWNLOAD_URL: 'https://test.bitrix24.ru/disk/download/100',
      DETAIL_URL: 'https://test.bitrix24.ru/disk/file/100',
      STORAGE_ID: '5',
    };

    mockPost.mockResolvedValueOnce({
      data: { result: fakeDiskFile },
    });

    const client = new Bitrix24Client({
      domain: 'test.bitrix24.ru',
      auth: { type: 'webhook', webhookUrl: 'https://test.bitrix24.ru/rest/1/abc/' },
    });

    const content = Buffer.from('hello world');
    const result = await client.uploadFile(5, 'test.txt', content);

    expect(mockPost).toHaveBeenCalledWith('/disk.storage.uploadfile', {
      id: 5,
      data: { NAME: 'test.txt' },
      fileContent: ['test.txt', content.toString('base64')],
    });
    expect(result).toEqual(fakeDiskFile);
    client.destroy();
  });
});

// ── OAuth auto-refresh (proactive) ──────────────────────────────────────────

describe('Bitrix24Client OAuth proactive refresh', () => {
  function makeOAuthClient(overrides: Record<string, any> = {}) {
    return new Bitrix24Client({
      domain: 'test.bitrix24.ru',
      auth: {
        type: 'oauth' as const,
        accessToken: 'old_access',
        refreshToken: 'old_refresh',
        clientId: 'cid',
        clientSecret: 'csecret',
        expiresAt: Date.now() - 1000, // expired
        ...overrides,
      },
    });
  }

  it('refreshes token before API call when expiresAt is in the past', async () => {
    // Mock refresh call (axios.get to oauth.bitrix.info)
    mockGet.mockResolvedValueOnce({ data: refreshResponse });
    // Mock the actual API call with refreshed token
    mockPost.mockResolvedValueOnce({ data: { result: { ID: '1' } } });

    const onTokenRefresh = vi.fn();
    const client = new Bitrix24Client({
      domain: 'test.bitrix24.ru',
      auth: {
        type: 'oauth',
        accessToken: 'old_access',
        refreshToken: 'old_refresh',
        clientId: 'cid',
        clientSecret: 'csecret',
        expiresAt: Date.now() - 1000,
      },
      onTokenRefresh,
    });

    const result = await client.callMethod('user.current');

    // Refresh was called
    expect(mockGet).toHaveBeenCalledWith(
      'https://oauth.bitrix.info/oauth/token/',
      expect.objectContaining({
        params: expect.objectContaining({
          grant_type: 'refresh_token',
          client_id: 'cid',
          client_secret: 'csecret',
          refresh_token: 'old_refresh',
        }),
      }),
    );
    // API called with new token
    expect(mockPost).toHaveBeenCalledWith('/user.current', { auth: 'refreshed_access' });
    expect(result).toEqual({ ID: '1' });
    // Callback invoked
    expect(onTokenRefresh).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'refreshed_access',
        refreshToken: 'refreshed_refresh',
      }),
    );
    client.destroy();
  });

  it('does not refresh when token is still valid', async () => {
    mockPost.mockResolvedValueOnce({ data: { result: { ID: '1' } } });

    const client = new Bitrix24Client({
      domain: 'test.bitrix24.ru',
      auth: {
        type: 'oauth',
        accessToken: 'valid_access',
        refreshToken: 'ref',
        clientId: 'cid',
        clientSecret: 'csecret',
        expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour from now
      },
    });

    await client.callMethod('user.current');

    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledWith('/user.current', { auth: 'valid_access' });
    client.destroy();
  });

  it('does not refresh when expiresAt is undefined (no expiry info)', async () => {
    mockPost.mockResolvedValueOnce({ data: { result: { ID: '1' } } });

    const client = makeOAuthClient({ expiresAt: undefined });
    await client.callMethod('user.current');

    expect(mockGet).not.toHaveBeenCalled();
    client.destroy();
  });
});

// ── OAuth auto-refresh (reactive — expired_token) ────────────────────────────

describe('Bitrix24Client OAuth reactive refresh', () => {
  it('refreshes and retries on expired_token error', async () => {
    // First call returns expired_token
    mockPost.mockResolvedValueOnce({
      data: { error: 'expired_token', error_description: 'Token expired' },
    });
    // Refresh call
    mockGet.mockResolvedValueOnce({ data: refreshResponse });
    // Retry with new token succeeds
    mockPost.mockResolvedValueOnce({ data: { result: { ID: '1' } } });

    const client = new Bitrix24Client({
      domain: 'test.bitrix24.ru',
      auth: {
        type: 'oauth',
        accessToken: 'expired_tok',
        refreshToken: 'ref',
        clientId: 'cid',
        clientSecret: 'csecret',
        expiresAt: Date.now() + 60000, // not proactively expired
      },
    });

    const result = await client.callMethod('user.current');
    expect(result).toEqual({ ID: '1' });

    // Verify retry used new token
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(mockPost).toHaveBeenLastCalledWith('/user.current', { auth: 'refreshed_access' });
    client.destroy();
  });

  it('refreshes and retries on NO_AUTH_FOUND error', async () => {
    mockPost.mockResolvedValueOnce({
      data: { error: 'NO_AUTH_FOUND', error_description: '' },
    });
    mockGet.mockResolvedValueOnce({ data: refreshResponse });
    mockPost.mockResolvedValueOnce({ data: { result: 'ok' } });

    const client = new Bitrix24Client({
      domain: 'test.bitrix24.ru',
      auth: {
        type: 'oauth',
        accessToken: 'tok',
        refreshToken: 'ref',
        clientId: 'cid',
        clientSecret: 'csecret',
        expiresAt: Date.now() + 60000,
      },
    });

    await expect(client.callMethod('test.method')).resolves.toBe('ok');
    client.destroy();
  });

  it('throws if retry also fails after refresh', async () => {
    mockPost
      .mockResolvedValueOnce({ data: { error: 'expired_token', error_description: '' } })
      .mockResolvedValueOnce({ data: { error: 'STILL_BROKEN', error_description: 'Nope' } });
    mockGet.mockResolvedValueOnce({ data: refreshResponse });

    const client = new Bitrix24Client({
      domain: 'test.bitrix24.ru',
      auth: {
        type: 'oauth',
        accessToken: 'tok',
        refreshToken: 'ref',
        clientId: 'cid',
        clientSecret: 'csecret',
        expiresAt: Date.now() + 60000,
      },
    });

    await expect(client.callMethod('test.method')).rejects.toThrow(Bitrix24Error);
    client.destroy();
  });

  it('propagates OAuthError when refresh itself fails', async () => {
    mockPost.mockResolvedValueOnce({
      data: { error: 'expired_token', error_description: '' },
    });
    mockGet.mockResolvedValueOnce({
      data: { error: 'invalid_grant', error_description: 'Refresh token expired' },
    });

    const onTokenRefresh = vi.fn();
    const client = new Bitrix24Client({
      domain: 'test.bitrix24.ru',
      auth: {
        type: 'oauth',
        accessToken: 'tok',
        refreshToken: 'ref',
        clientId: 'cid',
        clientSecret: 'csecret',
        expiresAt: Date.now() + 60000,
      },
      onTokenRefresh,
    });

    await expect(client.callMethod('test')).rejects.toThrow(OAuthError);
    expect(onTokenRefresh).not.toHaveBeenCalled();
    client.destroy();
  });
});

// ── OAuth auto-refresh (no-op cases) ─────────────────────────────────────────

describe('Bitrix24Client OAuth refresh — no-op cases', () => {
  it('does not attempt refresh for webhook auth on expired_token', async () => {
    mockPost.mockResolvedValueOnce({
      data: { error: 'expired_token', error_description: '' },
    });

    const client = new Bitrix24Client({
      domain: 'wh.bitrix24.ru',
      auth: { type: 'webhook', webhookUrl: 'https://wh.bitrix24.ru/rest/1/x/' },
    });

    await expect(client.callMethod('test')).rejects.toThrow(Bitrix24Error);
    expect(mockGet).not.toHaveBeenCalled();
    client.destroy();
  });

  it('does not attempt refresh when clientId/clientSecret are missing', async () => {
    mockPost.mockResolvedValueOnce({
      data: { error: 'expired_token', error_description: '' },
    });

    const client = new Bitrix24Client({
      domain: 'test.bitrix24.ru',
      auth: {
        type: 'oauth',
        accessToken: 'tok',
        refreshToken: 'ref',
        // no clientId or clientSecret
      },
    });

    await expect(client.callMethod('test')).rejects.toThrow(Bitrix24Error);
    expect(mockGet).not.toHaveBeenCalled();
    client.destroy();
  });

  it('does not attempt refresh when refreshToken is missing', async () => {
    mockPost.mockResolvedValueOnce({
      data: { error: 'expired_token', error_description: '' },
    });

    const client = new Bitrix24Client({
      domain: 'test.bitrix24.ru',
      auth: {
        type: 'oauth',
        accessToken: 'tok',
        clientId: 'cid',
        clientSecret: 'csecret',
        // no refreshToken
      },
    });

    await expect(client.callMethod('test')).rejects.toThrow(Bitrix24Error);
    expect(mockGet).not.toHaveBeenCalled();
    client.destroy();
  });
});

// ── verifyConnection ─────────────────────────────────────────────────────────

describe('Bitrix24Client verifyConnection', () => {
  it('returns ok when all required scopes are present', async () => {
    mockPost.mockResolvedValueOnce({
      data: { result: { scope: ['imbot', 'im', 'disk', 'crm'] } },
    });

    const client = createClientFromWebhook('https://test.bitrix24.ru/rest/1/abc/');
    const result = await client.verifyConnection();

    expect(result.ok).toBe(true);
    expect(result.domain).toBe('test.bitrix24.ru');
    expect(result.scopes).toEqual(['imbot', 'im', 'disk', 'crm']);
    expect(result.missingScopes).toBeUndefined();
    expect(result.error).toBeUndefined();
    client.destroy();
  });

  it('reports missing scopes', async () => {
    mockPost.mockResolvedValueOnce({
      data: { result: { scope: ['im'] } },
    });

    const client = createClientFromWebhook('https://test.bitrix24.ru/rest/1/abc/');
    const result = await client.verifyConnection();

    expect(result.ok).toBe(false);
    expect(result.missingScopes).toEqual(['imbot', 'disk']);
    expect(result.error).toContain('imbot');
    expect(result.error).toContain('disk');
    client.destroy();
  });

  it('handles API errors gracefully', async () => {
    mockPost.mockRejectedValueOnce(new Error('Network timeout'));

    const client = createClientFromWebhook('https://test.bitrix24.ru/rest/1/abc/');
    const result = await client.verifyConnection();

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Network timeout');
    client.destroy();
  });

  it('handles non-array scope response', async () => {
    mockPost.mockResolvedValueOnce({
      data: { result: { license: 'demo' } },
    });

    const client = createClientFromWebhook('https://test.bitrix24.ru/rest/1/abc/');
    const result = await client.verifyConnection();

    expect(result.ok).toBe(false);
    expect(result.scopes).toEqual([]);
    expect(result.missingScopes).toEqual(['imbot', 'im', 'disk']);
    client.destroy();
  });
});

// ── OAuth concurrent refresh deduplication ───────────────────────────────────

describe('Bitrix24Client OAuth concurrent dedup', () => {
  it('coalesces concurrent refresh attempts into one call', async () => {
    // All three calls hit expired_token
    mockPost
      .mockResolvedValueOnce({ data: { error: 'expired_token', error_description: '' } })
      .mockResolvedValueOnce({ data: { error: 'expired_token', error_description: '' } })
      .mockResolvedValueOnce({ data: { error: 'expired_token', error_description: '' } });

    // Single refresh
    mockGet.mockResolvedValueOnce({ data: refreshResponse });

    // Three retries succeed
    mockPost
      .mockResolvedValueOnce({ data: { result: 'a' } })
      .mockResolvedValueOnce({ data: { result: 'b' } })
      .mockResolvedValueOnce({ data: { result: 'c' } });

    const client = new Bitrix24Client({
      domain: 'test.bitrix24.ru',
      auth: {
        type: 'oauth',
        accessToken: 'old',
        refreshToken: 'ref',
        clientId: 'cid',
        clientSecret: 'csecret',
        expiresAt: Date.now() + 60000,
      },
      rateLimit: 100, // high limit so all run concurrently
    });

    const results = await Promise.all([
      client.callMethod('m1'),
      client.callMethod('m2'),
      client.callMethod('m3'),
    ]);

    expect(results).toEqual(['a', 'b', 'c']);
    // Only one refresh call despite three concurrent failures
    expect(mockGet).toHaveBeenCalledTimes(1);
    client.destroy();
  });
});
