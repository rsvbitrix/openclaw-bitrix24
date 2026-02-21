// ── Auth ──────────────────────────────────────────────────────────────────────

export interface WebhookAuth {
  type: 'webhook';
  webhookUrl: string; // https://{domain}/rest/{userId}/{secret}/
}

export interface OAuthAuth {
  type: 'oauth';
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number; // unix ms
  clientId?: string;
  clientSecret?: string;
}

export type BitrixAuth = WebhookAuth | OAuthAuth;

export interface Bitrix24ClientConfig {
  domain: string;
  auth: BitrixAuth;
  rateLimit?: number; // req/sec, default 2
  timeout?: number;   // ms, default 30000
  /** Called after OAuth tokens are refreshed. Use to persist new tokens. */
  onTokenRefresh?: (tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  }) => void | Promise<void>;
}

// ── Bot ──────────────────────────────────────────────────────────────────────

export interface BotConfig {
  name: string;
  lastName?: string;
  color?: BotColor;
  workPosition?: string;
  avatar?: string; // base64
  email?: string;
}

export type BotColor =
  | 'RED' | 'GREEN' | 'MINT' | 'LIGHT_BLUE' | 'DARK_BLUE'
  | 'PURPLE' | 'AQUA' | 'PINK' | 'LIME' | 'BROWN'
  | 'AZURE' | 'KHAKI' | 'SAND' | 'MARENGO' | 'GRAY' | 'GRAPHITE';

export interface BotRegistrationResult {
  botId: number;
  botCode: string;
}

// ── Account ──────────────────────────────────────────────────────────────────

export interface AccountConfig {
  id: string;
  domain: string;
  auth: BitrixAuth;
  enabled: boolean;
  textChunkLimit: number; // default 4000
  bot: BotConfig;
  botId?: number;
  botCode?: string;
  dmPolicy: 'open' | 'paired';
}

// ── Messages ─────────────────────────────────────────────────────────────────

export interface IncomingMessage {
  messageId: number;
  dialogId: string;
  chatId?: number;
  text: string;
  fromUserId: number;
  fromUserName: string;
  fromUserLastName: string;
  isBot: boolean;
  chatType: ChatType;
  files: FileAttachment[];
  domain: string;
  applicationToken?: string;
  botId: number;
  botCode: string;
}

export type ChatType = 'P' | 'C' | 'O' | 'S';

export interface OutgoingMessage {
  botId: number;
  dialogId: string;
  text: string;
  media?: MediaAttachment[];
  keyboard?: KeyboardMarkup;
}

// ── Files ────────────────────────────────────────────────────────────────────

export interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  downloadUrl?: string;
}

export interface MediaAttachment {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

export interface DiskFile {
  ID: string;
  NAME: string;
  SIZE: number;
  DOWNLOAD_URL: string;
  DETAIL_URL: string;
  STORAGE_ID: string;
}

// ── Keyboard ─────────────────────────────────────────────────────────────────

export interface KeyboardButton {
  TEXT: string;
  LINK?: string;
  COMMAND?: string;
  COMMAND_PARAMS?: string;
  BG_COLOR?: string;
  TEXT_COLOR?: string;
  BLOCK?: 'Y' | 'N';
}

export interface KeyboardMarkup {
  buttons: KeyboardButton[][];
}

// ── Bitrix24 Event Payloads ──────────────────────────────────────────────────

export interface Bitrix24MessageEvent {
  event: 'ONIMBOTMESSAGEADD';
  data: {
    BOT: Array<{
      BOT_ID: number;
      BOT_CODE: string;
    }>;
    PARAMS: {
      DIALOG_ID: string;
      MESSAGE_ID: number;
      MESSAGE: string;
      FILES?: Array<{
        id: string;
        name: string;
        size: number;
        type: string;
      }>;
      FROM_USER_ID: number;
      TO_USER_ID: number;
      TO_CHAT_ID?: number;
      CHAT_TYPE: ChatType;
      LANGUAGE: string;
    };
    USER: {
      ID: number;
      NAME: string;
      FIRST_NAME: string;
      LAST_NAME: string;
      WORK_POSITION?: string;
      IS_BOT: 'Y' | 'N';
    };
  };
  ts: number;
  auth?: {
    access_token?: string;
    domain: string;
    application_token?: string;
  };
}

export interface Bitrix24WelcomeEvent {
  event: 'ONIMJOINCHAT';
  data: {
    BOT: Array<{
      BOT_ID: number;
      BOT_CODE: string;
    }>;
    PARAMS: {
      DIALOG_ID: string;
      CHAT_TYPE: ChatType;
      USER_ID: number;
    };
  };
  auth?: {
    domain: string;
    application_token?: string;
  };
}

export interface Bitrix24BotDeleteEvent {
  event: 'ONIMBOTDELETE';
  data: {
    BOT: Array<{
      BOT_ID: number;
      BOT_CODE: string;
    }>;
  };
  auth?: {
    domain: string;
  };
}

// ── REST API Response ────────────────────────────────────────────────────────

export interface BitrixApiResponse<T = any> {
  result: T;
  time?: {
    start: number;
    finish: number;
    duration: number;
  };
  error?: string;
  error_description?: string;
}

// ── Token Resolution ─────────────────────────────────────────────────────────

export interface TokenResolutionConfig {
  accountWebhookUrl?: string;
  globalWebhookUrl?: string;
  envVar?: string; // BITRIX24_WEBHOOK_URL
}
