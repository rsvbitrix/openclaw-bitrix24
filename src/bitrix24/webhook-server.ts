import { Router, type Request, type Response } from 'express';
import type { Bitrix24MessageEvent, Bitrix24WelcomeEvent, Bitrix24BotDeleteEvent, IncomingMessage } from './types.js';
import { parseMessageEvent, parseWelcomeEvent, parseBotDeleteEvent, verifyApplicationToken } from './receive.js';

export interface WebhookHandlers {
  onMessage: (accountId: string, msg: IncomingMessage) => void;
  onWelcome?: (accountId: string, event: ReturnType<typeof parseWelcomeEvent>) => void;
  onBotDelete?: (accountId: string, event: ReturnType<typeof parseBotDeleteEvent>) => void;
  getApplicationToken?: (accountId: string) => string | undefined;
}

/**
 * Create an Express router for receiving Bitrix24 webhook events.
 *
 * Routes:
 *   POST /webhook/bitrix24/:accountId/message  — ONIMBOTMESSAGEADD
 *   POST /webhook/bitrix24/:accountId/welcome  — ONIMJOINCHAT
 *   POST /webhook/bitrix24/:accountId/delete   — ONIMBOTDELETE
 */
export function createWebhookRouter(handlers: WebhookHandlers): Router {
  const router = Router();

  // ONIMBOTMESSAGEADD
  router.post('/webhook/bitrix24/:accountId/message', (req: Request, res: Response) => {
    try {
      const accountId = req.params.accountId as string;
      const body = req.body as Bitrix24MessageEvent;

      // Verify application token
      const expectedToken = handlers.getApplicationToken?.(accountId);
      if (!verifyApplicationToken(body, expectedToken)) {
        res.status(403).json({ error: 'Invalid application token' });
        return;
      }

      const msg = parseMessageEvent(body);
      if (msg) {
        handlers.onMessage(accountId, msg);
      }

      res.json({ success: true });
    } catch (err) {
      console.error('[bitrix24-webhook] message error:', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // ONIMJOINCHAT (welcome)
  router.post('/webhook/bitrix24/:accountId/welcome', (req: Request, res: Response) => {
    try {
      const accountId = req.params.accountId as string;
      const body = req.body as Bitrix24WelcomeEvent;

      const event = parseWelcomeEvent(body);
      if (event) {
        handlers.onWelcome?.(accountId, event);
      }

      res.json({ success: true });
    } catch (err) {
      console.error('[bitrix24-webhook] welcome error:', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // ONIMBOTDELETE
  router.post('/webhook/bitrix24/:accountId/delete', (req: Request, res: Response) => {
    try {
      const accountId = req.params.accountId as string;
      const body = req.body as Bitrix24BotDeleteEvent;

      const event = parseBotDeleteEvent(body);
      if (event) {
        handlers.onBotDelete?.(accountId, event);
      }

      res.json({ success: true });
    } catch (err) {
      console.error('[bitrix24-webhook] delete error:', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  return router;
}
