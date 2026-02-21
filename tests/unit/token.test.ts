import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveAuth, isValidWebhookUrl, domainFromWebhookUrl } from '../../src/bitrix24/token.js';

describe('resolveAuth', () => {
  beforeEach(() => {
    delete process.env.BITRIX24_WEBHOOK_URL;
  });

  it('resolves from per-account webhook URL', () => {
    const auth = resolveAuth({
      accountId: 'portal1',
      accountWebhookUrl: 'https://test.bitrix24.ru/rest/1/abc/',
      isDefault: false,
    });
    expect(auth).toEqual({
      type: 'webhook',
      webhookUrl: 'https://test.bitrix24.ru/rest/1/abc/',
    });
  });

  it('resolves from per-account OAuth token', () => {
    const auth = resolveAuth({
      accountId: 'portal1',
      accountAccessToken: 'token123',
      accountRefreshToken: 'refresh456',
      isDefault: false,
    });
    expect(auth).toMatchObject({
      type: 'oauth',
      accessToken: 'token123',
      refreshToken: 'refresh456',
    });
  });

  it('threads clientId, clientSecret, expiresAt into OAuthAuth', () => {
    const auth = resolveAuth({
      accountId: 'portal1',
      accountAccessToken: 'tok',
      accountRefreshToken: 'ref',
      accountClientId: 'cid',
      accountClientSecret: 'csecret',
      accountExpiresAt: 1700000000000,
      isDefault: false,
    });
    expect(auth).toEqual({
      type: 'oauth',
      accessToken: 'tok',
      refreshToken: 'ref',
      clientId: 'cid',
      clientSecret: 'csecret',
      expiresAt: 1700000000000,
    });
  });

  it('omits undefined OAuth fields when not provided', () => {
    const auth = resolveAuth({
      accountId: 'portal1',
      accountAccessToken: 'tok',
      isDefault: false,
    });
    expect(auth).toEqual({
      type: 'oauth',
      accessToken: 'tok',
      refreshToken: undefined,
      clientId: undefined,
      clientSecret: undefined,
      expiresAt: undefined,
    });
  });

  it('resolves from global config for default account', () => {
    const auth = resolveAuth({
      accountId: 'default',
      globalWebhookUrl: 'https://global.bitrix24.ru/rest/1/xyz/',
      isDefault: true,
    });
    expect(auth?.type).toBe('webhook');
  });

  it('resolves from env var for default account', () => {
    process.env.BITRIX24_WEBHOOK_URL = 'https://env.bitrix24.ru/rest/1/env123/';
    const auth = resolveAuth({
      accountId: 'default',
      isDefault: true,
    });
    expect(auth).toEqual({
      type: 'webhook',
      webhookUrl: 'https://env.bitrix24.ru/rest/1/env123/',
    });
  });

  it('returns null for non-default without credentials', () => {
    process.env.BITRIX24_WEBHOOK_URL = 'https://env.bitrix24.ru/rest/1/env123/';
    const auth = resolveAuth({
      accountId: 'secondary',
      isDefault: false,
    });
    expect(auth).toBeNull();
  });

  it('prefers account URL over global', () => {
    const auth = resolveAuth({
      accountId: 'default',
      accountWebhookUrl: 'https://account.bitrix24.ru/rest/1/acc/',
      globalWebhookUrl: 'https://global.bitrix24.ru/rest/1/glob/',
      isDefault: true,
    });
    expect((auth as any).webhookUrl).toBe('https://account.bitrix24.ru/rest/1/acc/');
  });
});

describe('isValidWebhookUrl', () => {
  it('validates correct URL', () => {
    expect(isValidWebhookUrl('https://test.bitrix24.ru/rest/1/abc123/')).toBe(true);
  });

  it('rejects http', () => {
    expect(isValidWebhookUrl('http://test.bitrix24.ru/rest/1/abc123/')).toBe(false);
  });

  it('rejects non-bitrix domains', () => {
    expect(isValidWebhookUrl('https://example.com/rest/1/abc/')).toBe(false);
  });

  it('rejects missing /rest/ path', () => {
    expect(isValidWebhookUrl('https://test.bitrix24.ru/api/abc/')).toBe(false);
  });
});

describe('domainFromWebhookUrl', () => {
  it('extracts domain', () => {
    expect(domainFromWebhookUrl('https://test.bitrix24.ru/rest/1/abc/'))
      .toBe('test.bitrix24.ru');
  });
});
