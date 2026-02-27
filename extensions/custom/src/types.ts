/**
 * Type definitions for the Custom channel plugin.
 *
 * Adapt these types to match your backend's webhook payload and config.
 */

/** Raw channel config from openclaw.json channels.custom */
export interface CustomChannelConfig {
  enabled?: boolean;
  token?: string;
  incomingUrl?: string;
  webhookPath?: string;
  dmPolicy?: "open" | "allowlist" | "pairing" | "disabled";
  allowFrom?: string | string[];
  rateLimitPerMinute?: number;
  botName?: string;
  allowInsecureSsl?: boolean;
  accounts?: Record<string, CustomAccountRaw>;
}

/** Raw per-account config (overrides base config) */
export interface CustomAccountRaw {
  enabled?: boolean;
  token?: string;
  incomingUrl?: string;
  webhookPath?: string;
  dmPolicy?: "open" | "allowlist" | "pairing" | "disabled";
  allowFrom?: string | string[];
  rateLimitPerMinute?: number;
  botName?: string;
  allowInsecureSsl?: boolean;
}

/** Fully resolved account config with defaults applied */
export interface ResolvedCustomAccount {
  accountId: string;
  enabled: boolean;
  token: string;
  incomingUrl: string;
  webhookPath: string;
  dmPolicy: "open" | "allowlist" | "pairing" | "disabled";
  allowedUserIds: string[];
  rateLimitPerMinute: number;
  botName: string;
  allowInsecureSsl: boolean;
}

/**
 * Webhook payload format from your backend.
 * Customize fields to match your chat system's webhook schema.
 */
export interface CustomWebhookPayload {
  token?: string;
  userId: string;
  userName?: string;
  groupId?: string;
  groupName?: string;
  text: string;
  chatType?: "direct" | "group";
}
