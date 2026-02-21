# @openclaw/bitrix24

> **⚠️ Тестовая сборка (beta).** Этот плагин находится в стадии активной разработки. Если у вас есть вопросы или предложения — пишите на [bitrix@me.com](mailto:bitrix@me.com).

Bitrix24 channel plugin for [OpenClaw](https://github.com/openclaw/openclaw) — chat with your AI agent through Bitrix24 Messenger.

## Install

```bash
openclaw plugins install @openclaw/bitrix24
```

## Quick Setup

1. Create an inbound webhook in your Bitrix24 portal: **Developer resources → Other → Inbound webhook**
2. Enable scopes: `imbot`, `im`, `disk`
3. Set the webhook URL:

```bash
export BITRIX24_WEBHOOK_URL="https://your-portal.bitrix24.ru/rest/1/your-secret/"
```

4. Start the agent:

```bash
openclaw start
```

The bot appears in Bitrix24 Messenger automatically.

## Multi-Account / OAuth

```yaml
channels:
  bitrix24:
    accounts:
      - id: main
        webhookUrl: "https://portal-a.bitrix24.ru/rest/1/secret1/"
        bot:
          name: "Sales Bot"
          color: AZURE

      - id: support
        domain: portal-b.bitrix24.ru
        accessToken: "your-oauth-access-token"
        refreshToken: "your-oauth-refresh-token"
        clientId: "app.xxxxxxxx.xxxxxxxx"
        clientSecret: "your-client-secret"
```

OAuth tokens are refreshed automatically when `clientId` and `clientSecret` are provided.

## Required Scopes

| Scope | Required | Used for |
|---|---|---|
| `imbot` | Yes | Bot registration, send messages as bot |
| `im` | Yes | Messaging, chat management |
| `disk` | Yes | File upload/download |

## Documentation

Full documentation, architecture, and troubleshooting: [github.com/rsvbitrix/openclaw-bitrix24](https://github.com/rsvbitrix/openclaw-bitrix24)

## Feedback

This is a beta release. Questions, bugs, feature requests — email [bitrix@me.com](mailto:bitrix@me.com).

## License

MIT
