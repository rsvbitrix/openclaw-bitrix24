import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Bitrix24Client, Bitrix24Error, createClientFromWebhook } from '../../src/bitrix24/client.js';

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
const { __mockPost: mockPost, __mockCreate: mockCreate } = await import('axios') as any;

beforeEach(() => {
  vi.clearAllMocks();
});

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
