# OpenClaw Bitrix24

<!-- badges -->
<!-- [![npm](https://img.shields.io/npm/v/@openclaw/channel-bitrix24)](https://www.npmjs.com/package/@openclaw/channel-bitrix24) -->
<!-- [![CI](https://github.com/openclaw/channel-bitrix24/actions/workflows/ci.yml/badge.svg)](https://github.com/openclaw/channel-bitrix24/actions) -->
<!-- [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) -->

Channel plugin and skill that connect your OpenClaw AI agent to Bitrix24. Users chat with the agent through Bitrix24 Messenger, and the agent can manage CRM, tasks, calendar, drive, and messaging on their behalf.

## Quick Start

### 1. Install the plugin

```bash
openclaw plugins install @openclaw/channel-bitrix24
```

### 2. Get a webhook URL

In your Bitrix24 portal: **Developer resources > Other > Inbound webhook**.
Enable scopes: `imbot`, `im`, `disk`.
Copy the webhook URL (looks like `https://your-portal.bitrix24.ru/rest/1/abc123def/`).

### 3. Set the environment variable

```bash
export BITRIX24_WEBHOOK_URL="https://your-portal.bitrix24.ru/rest/1/abc123def/"
```

### 4. Start the agent

```bash
openclaw start
```

The plugin registers a chatbot in your Bitrix24 portal automatically on startup. Open Messenger, find the bot ("OpenClaw Agent"), and start chatting.

### 5. Verify

Run `/b24status` inside OpenClaw to check the connection:

```
/b24status
# Bitrix24 Accounts:
# - default (your-portal.bitrix24.ru): connected
```

## Configuration

The plugin supports two auth methods: webhook URL (simple) and OAuth (multi-portal).

### Option A: Webhook URL (quick setup)

Set `BITRIX24_WEBHOOK_URL` env var -- no config file changes needed.

Or add it to your `openclaw.yaml`:

```yaml
channels:
  bitrix24:
    webhookUrl: "https://your-portal.bitrix24.ru/rest/1/abc123def/"
```

### Option B: Multi-account / OAuth

```yaml
channels:
  bitrix24:
    accounts:
      - id: main
        webhookUrl: "https://portal-a.bitrix24.ru/rest/1/secret1/"
        bot:
          name: "Sales Bot"
          color: AZURE
          workPosition: "Sales Assistant"

      - id: support
        domain: portal-b.bitrix24.ru
        accessToken: "your-oauth-access-token"
        refreshToken: "your-oauth-refresh-token"
        bot:
          name: "Support Bot"
          color: GREEN
        dmPolicy: paired          # "open" (default) or "paired"
        textChunkLimit: 3000      # max chars per message chunk (default: 4000)
```

### Config Reference

| Field | Type | Default | Description |
|---|---|---|---|
| `webhookUrl` | string | -- | Bitrix24 inbound webhook URL |
| `accounts[].id` | string | `"default"` | Unique account identifier |
| `accounts[].domain` | string | auto | Portal domain (extracted from webhook URL) |
| `accounts[].webhookUrl` | string | -- | Per-account webhook URL |
| `accounts[].accessToken` | string | -- | OAuth access token |
| `accounts[].refreshToken` | string | -- | OAuth refresh token |
| `accounts[].enabled` | boolean | `true` | Enable/disable account |
| `accounts[].textChunkLimit` | number | `4000` | Max characters per message |
| `accounts[].dmPolicy` | string | `"open"` | `"open"` or `"paired"` |
| `accounts[].bot.name` | string | `"OpenClaw Agent"` | Bot display name |
| `accounts[].bot.lastName` | string | -- | Bot last name |
| `accounts[].bot.color` | string | `"PURPLE"` | Bot color in chat list |
| `accounts[].bot.workPosition` | string | `"AI Assistant"` | Shown under bot name |
| `accounts[].bot.avatar` | string | -- | Base64-encoded avatar image |
| `accounts[].botId` | number | auto | Pre-registered bot ID (skip registration) |
| `accounts[].botCode` | string | auto | Pre-registered bot code |

**Auth resolution order** (for the default account):
1. Per-account `webhookUrl` or `accessToken`
2. Global `channels.bitrix24.webhookUrl`
3. `BITRIX24_WEBHOOK_URL` environment variable

Non-default accounts only use per-account credentials.

## Skill

The Bitrix24 skill gives your agent knowledge of the Bitrix24 REST API so it can perform actions on behalf of users.

### What it covers

| Module | Capabilities |
|---|---|
| **CRM** | Deals, contacts, leads, companies, activities, deal stages |
| **Tasks** | Create, update, complete, delegate, checklists, comments |
| **Calendar** | Events, recurring events, attendees, busy/free checks |
| **Drive** | Storages, folders, files, upload/download, publish to chat |
| **Chat** | Send messages, notifications, create/manage group chats |
| **Users** | Search, get by ID, departments, org structure |

### Install separately

```bash
openclaw skills install bitrix24
```

The skill uses the same `BITRIX24_WEBHOOK_URL` env var. It teaches the agent the curl-based API call pattern, pagination, filters, batch requests, and error handling for each module.

## Architecture

```
+-------------------+         +---------------------------+
|   Bitrix24        |         |   OpenClaw Agent          |
|   Messenger       |         |                           |
|                   |         |  +---------+  +---------+ |
|  User writes msg  | ------> |  | Webhook |->| Agent   | |
|                   |  POST   |  | Server  |  | (LLM)   | |
|                   |         |  +---------+  +----+----+ |
|  Bot replies      | <------ |                    |      |
|                   | imbot.  |  +---------+       |      |
|                   | message.|  | Bitrix24|<------+      |
|                   | add     |  | Client  |  REST API    |
|                   |         |  +---------+  (skill)     |
+-------------------+         +---------------------------+
```

**Message flow:**

1. User sends a message to the bot in Bitrix24 Messenger
2. Bitrix24 fires `ONIMBOTMESSAGEADD` event to the webhook endpoint
3. Webhook server parses the event, converts BB-code to Markdown
4. Message is forwarded to the OpenClaw agent for processing
5. Agent generates a response (optionally calling Bitrix24 REST API via skill)
6. Response is converted from Markdown to BB-code, chunked if needed
7. Bot replies via `imbot.message.add` with typing indicator

## File Structure

```
openclaw-bitrix24/
  extensions/bitrix24/           # OpenClaw channel plugin (npm package)
    openclaw.plugin.json         #   Plugin manifest
    package.json                 #   @openclaw/channel-bitrix24
    src/
      index.ts                   #   Plugin entry point (register channels, services, commands)
      channel.ts                 #   Bitrix24Channel class (messaging, lifecycle)
      runtime.ts                 #   Runtime DI (logger, config)
  src/bitrix24/                  # Core library
    accounts.ts                  #   Multi-account manager
    bot.ts                       #   Bot registration / unregistration (imbot.register)
    client.ts                    #   Bitrix24 REST API client with rate limiter
    files.ts                     #   File upload (disk) and download
    format.ts                    #   Markdown <-> BB-code conversion
    receive.ts                   #   Parse incoming webhook events
    send.ts                      #   Send messages (chunking, typing, media)
    targets.ts                   #   DIALOG_ID parsing (user vs. chat)
    token.ts                     #   Auth resolution (webhook URL / OAuth / env)
    types.ts                     #   TypeScript interfaces
    webhook-server.ts            #   Express router for incoming events
  skills/bitrix24/               # OpenClaw skill (agent knowledge)
    SKILL.md                     #   Skill manifest + API overview
    crm.md                       #   CRM module reference
    tasks.md                     #   Tasks module reference
    calendar.md                  #   Calendar module reference
    drive.md                     #   Drive module reference
    chat.md                      #   Chat/messaging module reference
    users.md                     #   Users & departments reference
  tests/unit/                    # Unit tests
    format.test.ts               #   Markdown/BB-code conversion tests
    receive.test.ts              #   Event parsing tests
    targets.test.ts              #   DIALOG_ID parsing tests
    token.test.ts                #   Auth resolution tests
```

## Development

### Prerequisites

- Node.js >= 18
- npm

### Setup

```bash
git clone https://github.com/openclaw/channel-bitrix24.git
cd channel-bitrix24
npm install
```

### Build

```bash
npm run build
```

### Test

```bash
npm test              # run once
npm run test:watch    # watch mode
```

### Lint

```bash
npm run lint
```

## Scopes

The Bitrix24 webhook or OAuth app needs these scopes:

| Scope | Required | Used for |
|---|---|---|
| `imbot` | Yes | Register/unregister chatbot, send messages as bot |
| `im` | Yes | Send messages, manage chats, commit files to chats |
| `disk` | Yes | Upload/download files, storage access |
| `crm` | For skill | CRM operations (deals, contacts, leads, companies) |
| `task` | For skill | Task management |
| `calendar` | For skill | Calendar events |
| `user` | For skill | User search, department info |
| `department` | For skill | Department management |

**Minimum for channel only:** `imbot`, `im`, `disk`.
**Recommended for full functionality:** all of the above.

## Troubleshooting

### Bot does not appear in Messenger

- Verify `BITRIX24_WEBHOOK_URL` is set and points to a valid webhook.
- Ensure the webhook has the `imbot` scope enabled.
- Run `/b24status` -- if it shows "connected", the bot should appear in the contact list under "Bots and apps".
- Check the OpenClaw agent logs for registration errors.

### Messages are not received

- The agent must be reachable from the internet. Bitrix24 sends `POST` requests to your webhook endpoint at `{externalUrl}/webhook/bitrix24/{accountId}/message`.
- Check that `gateway.externalUrl` in your OpenClaw config is a publicly accessible HTTPS URL.
- Verify the webhook URL in Bitrix24 is not expired or revoked.

### Rate limit errors (`QUERY_LIMIT_EXCEEDED`)

The client enforces a 2 req/s token-bucket rate limiter by default. If you still hit limits, reduce the `rateLimit` config or avoid parallel requests to the same portal.

### Long messages are truncated

Bitrix24 has a message length limit. The plugin automatically splits messages at paragraph/sentence boundaries. Adjust `textChunkLimit` (default 4000) if chunks are still too large.

### File upload fails

- Ensure the `disk` scope is enabled on the webhook.
- The plugin uploads to the "common" storage by default. Make sure at least one storage exists in your portal.
- Error "No Disk storage found" means no accessible storage -- check Bitrix24 Drive settings.

### Bot replies with garbled formatting

The plugin converts Markdown to BB-code (Bitrix24's native format). If you see raw BB-code tags, the conversion may have a bug -- file an issue with the input text.

### OAuth token expired

For OAuth accounts, provide both `accessToken` and `refreshToken`. The client supports token refresh, but auto-refresh requires `clientId` and `clientSecret` to be configured.

## License

MIT
