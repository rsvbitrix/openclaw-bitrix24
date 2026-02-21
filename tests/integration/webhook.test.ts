import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { createWebhookRouter, type WebhookHandlers } from '../../src/bitrix24/webhook-server.js';
import type {
  Bitrix24MessageEvent,
  Bitrix24WelcomeEvent,
  Bitrix24BotDeleteEvent,
  IncomingMessage,
} from '../../src/bitrix24/types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createApp(handlers: WebhookHandlers): express.Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(createWebhookRouter(handlers));
  return app;
}

function startServer(app: express.Express): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

function stopServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function post(baseUrl: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ACCOUNT_ID = 'acct-test-123';
const APP_TOKEN = 'test-app-token-abc';

function makeMessageEvent(overrides?: {
  isBot?: 'Y' | 'N';
  appToken?: string;
  message?: string;
}): Bitrix24MessageEvent {
  return {
    event: 'ONIMBOTMESSAGEADD',
    data: {
      BOT: [{ BOT_ID: 42, BOT_CODE: 'openclaw' }],
      PARAMS: {
        DIALOG_ID: '101',
        MESSAGE_ID: 5001,
        MESSAGE: overrides?.message ?? 'Hello bot!',
        FROM_USER_ID: 7,
        TO_USER_ID: 42,
        TO_CHAT_ID: 200,
        CHAT_TYPE: 'P',
        LANGUAGE: 'ru',
      },
      USER: {
        ID: 7,
        NAME: 'Ivan Petrov',
        FIRST_NAME: 'Ivan',
        LAST_NAME: 'Petrov',
        IS_BOT: overrides?.isBot ?? 'N',
      },
    },
    ts: Date.now(),
    auth: {
      access_token: 'fake-access-token',
      domain: 'test.bitrix24.ru',
      application_token: overrides?.appToken ?? APP_TOKEN,
    },
  };
}

function makeWelcomeEvent(): Bitrix24WelcomeEvent {
  return {
    event: 'ONIMJOINCHAT',
    data: {
      BOT: [{ BOT_ID: 42, BOT_CODE: 'openclaw' }],
      PARAMS: {
        DIALOG_ID: '101',
        CHAT_TYPE: 'P',
        USER_ID: 7,
      },
    },
    auth: {
      domain: 'test.bitrix24.ru',
      application_token: APP_TOKEN,
    },
  };
}

function makeBotDeleteEvent(): Bitrix24BotDeleteEvent {
  return {
    event: 'ONIMBOTDELETE',
    data: {
      BOT: [{ BOT_ID: 42, BOT_CODE: 'openclaw' }],
    },
    auth: {
      domain: 'test.bitrix24.ru',
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Webhook server integration', () => {
  let server: Server;
  let baseUrl: string;
  let onMessage: ReturnType<typeof vi.fn>;
  let onWelcome: ReturnType<typeof vi.fn>;
  let onBotDelete: ReturnType<typeof vi.fn>;
  let getApplicationToken: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    onMessage = vi.fn();
    onWelcome = vi.fn();
    onBotDelete = vi.fn();
    getApplicationToken = vi.fn();

    const app = createApp({
      onMessage,
      onWelcome,
      onBotDelete,
      getApplicationToken,
    });

    const started = await startServer(app);
    server = started.server;
    baseUrl = started.baseUrl;
  });

  afterAll(async () => {
    await stopServer(server);
  });

  beforeEach(() => {
    onMessage.mockReset();
    onWelcome.mockReset();
    onBotDelete.mockReset();
    getApplicationToken.mockReset();
  });

  // ── Message route ────────────────────────────────────────────────────────

  describe('POST /webhook/bitrix24/:accountId/message', () => {
    it('should call onMessage with parsed IncomingMessage for a valid human message', async () => {
      // No stored token -> verification skipped
      getApplicationToken.mockReturnValue(undefined);

      const event = makeMessageEvent({ message: 'Ping!' });
      const res = await post(baseUrl, `/webhook/bitrix24/${ACCOUNT_ID}/message`, event);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ success: true });

      expect(onMessage).toHaveBeenCalledOnce();
      const [accountId, msg] = onMessage.mock.calls[0] as [string, IncomingMessage];
      expect(accountId).toBe(ACCOUNT_ID);
      expect(msg.messageId).toBe(5001);
      expect(msg.dialogId).toBe('101');
      expect(msg.text).toBe('Ping!');
      expect(msg.fromUserId).toBe(7);
      expect(msg.fromUserName).toBe('Ivan');
      expect(msg.fromUserLastName).toBe('Petrov');
      expect(msg.isBot).toBe(false);
      expect(msg.chatType).toBe('P');
      expect(msg.botId).toBe(42);
      expect(msg.botCode).toBe('openclaw');
      expect(msg.domain).toBe('test.bitrix24.ru');
      expect(msg.applicationToken).toBe(APP_TOKEN);
      expect(msg.files).toEqual([]);
    });

    it('should NOT call onMessage when the sender is a bot (IS_BOT=Y)', async () => {
      getApplicationToken.mockReturnValue(undefined);

      const event = makeMessageEvent({ isBot: 'Y' });
      const res = await post(baseUrl, `/webhook/bitrix24/${ACCOUNT_ID}/message`, event);

      expect(res.status).toBe(200);
      expect(onMessage).not.toHaveBeenCalled();
    });

    it('should return 403 when application token does not match', async () => {
      getApplicationToken.mockReturnValue('expected-secret-token');

      const event = makeMessageEvent({ appToken: 'wrong-token' });
      const res = await post(baseUrl, `/webhook/bitrix24/${ACCOUNT_ID}/message`, event);

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json).toEqual({ error: 'Invalid application token' });
      expect(onMessage).not.toHaveBeenCalled();
    });

    it('should pass token verification when tokens match', async () => {
      getApplicationToken.mockReturnValue(APP_TOKEN);

      const event = makeMessageEvent({ appToken: APP_TOKEN });
      const res = await post(baseUrl, `/webhook/bitrix24/${ACCOUNT_ID}/message`, event);

      expect(res.status).toBe(200);
      expect(onMessage).toHaveBeenCalledOnce();
    });

    it('should pass the correct accountId from the URL parameter', async () => {
      getApplicationToken.mockReturnValue(undefined);

      const customAccountId = 'portal-xyz-999';
      const event = makeMessageEvent();
      const res = await post(baseUrl, `/webhook/bitrix24/${customAccountId}/message`, event);

      expect(res.status).toBe(200);
      expect(onMessage).toHaveBeenCalledOnce();
      expect(onMessage.mock.calls[0][0]).toBe(customAccountId);
    });

    it('should parse file attachments when present', async () => {
      getApplicationToken.mockReturnValue(undefined);

      const event = makeMessageEvent();
      event.data.PARAMS.FILES = [
        { id: 'f1', name: 'report.pdf', size: 102400, type: 'application/pdf' },
        { id: 'f2', name: 'image.png', size: 50000, type: 'image/png' },
      ];

      const res = await post(baseUrl, `/webhook/bitrix24/${ACCOUNT_ID}/message`, event);

      expect(res.status).toBe(200);
      const msg = onMessage.mock.calls[0][1] as IncomingMessage;
      expect(msg.files).toHaveLength(2);
      expect(msg.files[0]).toEqual({
        id: 'f1',
        name: 'report.pdf',
        size: 102400,
        type: 'application/pdf',
      });
      expect(msg.files[1]).toEqual({
        id: 'f2',
        name: 'image.png',
        size: 50000,
        type: 'image/png',
      });
    });

    it('should convert BB-code in message text to markdown', async () => {
      getApplicationToken.mockReturnValue(undefined);

      const event = makeMessageEvent({ message: '[b]Bold[/b] and [i]italic[/i]' });
      const res = await post(baseUrl, `/webhook/bitrix24/${ACCOUNT_ID}/message`, event);

      expect(res.status).toBe(200);
      const msg = onMessage.mock.calls[0][1] as IncomingMessage;
      expect(msg.text).toBe('**Bold** and *italic*');
    });
  });

  // ── Welcome route ────────────────────────────────────────────────────────

  describe('POST /webhook/bitrix24/:accountId/welcome', () => {
    it('should call onWelcome with parsed event data', async () => {
      const event = makeWelcomeEvent();
      const res = await post(baseUrl, `/webhook/bitrix24/${ACCOUNT_ID}/welcome`, event);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ success: true });

      expect(onWelcome).toHaveBeenCalledOnce();
      const [accountId, parsed] = onWelcome.mock.calls[0];
      expect(accountId).toBe(ACCOUNT_ID);
      expect(parsed).toEqual({
        dialogId: '101',
        chatType: 'P',
        userId: 7,
        botId: 42,
        botCode: 'openclaw',
        domain: 'test.bitrix24.ru',
      });
    });

    it('should not call onWelcome when BOT array is empty', async () => {
      const event = makeWelcomeEvent();
      event.data.BOT = [];

      const res = await post(baseUrl, `/webhook/bitrix24/${ACCOUNT_ID}/welcome`, event);

      expect(res.status).toBe(200);
      expect(onWelcome).not.toHaveBeenCalled();
    });
  });

  // ── Delete route ─────────────────────────────────────────────────────────

  describe('POST /webhook/bitrix24/:accountId/delete', () => {
    it('should call onBotDelete with parsed event data', async () => {
      const event = makeBotDeleteEvent();
      const res = await post(baseUrl, `/webhook/bitrix24/${ACCOUNT_ID}/delete`, event);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ success: true });

      expect(onBotDelete).toHaveBeenCalledOnce();
      const [accountId, parsed] = onBotDelete.mock.calls[0];
      expect(accountId).toBe(ACCOUNT_ID);
      expect(parsed).toEqual({
        botId: 42,
        botCode: 'openclaw',
        domain: 'test.bitrix24.ru',
      });
    });

    it('should not call onBotDelete when BOT array is empty', async () => {
      const event = makeBotDeleteEvent();
      event.data.BOT = [];

      const res = await post(baseUrl, `/webhook/bitrix24/${ACCOUNT_ID}/delete`, event);

      expect(res.status).toBe(200);
      expect(onBotDelete).not.toHaveBeenCalled();
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('should return 404 for unknown webhook path', async () => {
      const res = await post(baseUrl, `/webhook/bitrix24/${ACCOUNT_ID}/unknown`, {});
      expect(res.status).toBe(404);
    });

    it('should handle missing auth block in message event gracefully', async () => {
      getApplicationToken.mockReturnValue(undefined);

      const event = makeMessageEvent();
      delete (event as any).auth;

      const res = await post(baseUrl, `/webhook/bitrix24/${ACCOUNT_ID}/message`, event);

      // verifyApplicationToken returns true when no expected token
      expect(res.status).toBe(200);
      expect(onMessage).toHaveBeenCalledOnce();
      const msg = onMessage.mock.calls[0][1] as IncomingMessage;
      expect(msg.domain).toBe('');
      expect(msg.applicationToken).toBeUndefined();
    });

    it('should handle missing auth block in welcome event gracefully', async () => {
      const event = makeWelcomeEvent();
      delete (event as any).auth;

      const res = await post(baseUrl, `/webhook/bitrix24/${ACCOUNT_ID}/welcome`, event);

      expect(res.status).toBe(200);
      expect(onWelcome).toHaveBeenCalledOnce();
      const parsed = onWelcome.mock.calls[0][1];
      expect(parsed.domain).toBe('');
    });

    it('should handle empty BOT array in message event', async () => {
      getApplicationToken.mockReturnValue(undefined);

      const event = makeMessageEvent();
      event.data.BOT = [];

      const res = await post(baseUrl, `/webhook/bitrix24/${ACCOUNT_ID}/message`, event);

      expect(res.status).toBe(200);
      expect(onMessage).not.toHaveBeenCalled();
    });
  });
});
