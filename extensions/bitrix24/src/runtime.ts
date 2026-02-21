/**
 * Runtime dependency injection for the Bitrix24 channel plugin.
 * Follows the same pattern as Telegram/Slack extensions.
 */

export interface PluginRuntime {
  logger: {
    info: (msg: string, ...args: any[]) => void;
    warn: (msg: string, ...args: any[]) => void;
    error: (msg: string, ...args: any[]) => void;
    debug: (msg: string, ...args: any[]) => void;
  };
  config: Record<string, any>;
  webhookBaseUrl: string;
}

let _runtime: PluginRuntime | null = null;

export function setBitrix24Runtime(runtime: PluginRuntime): void {
  _runtime = runtime;
}

export function getBitrix24Runtime(): PluginRuntime {
  if (!_runtime) {
    throw new Error('Bitrix24 runtime not initialized. Call setBitrix24Runtime() first.');
  }
  return _runtime;
}
