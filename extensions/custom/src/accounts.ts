/**
 * Account resolution: reads config from channels.custom,
 * merges per-account overrides, falls back to environment variables.
 */

import type { CustomChannelConfig, ResolvedCustomAccount } from "./types.js";

const CHANNEL_ID = "custom";

function getChannelConfig(cfg: unknown): CustomChannelConfig | undefined {
  const channels = (cfg as Record<string, unknown>)?.channels as Record<string, unknown> | undefined;
  return channels?.[CHANNEL_ID] as CustomChannelConfig | undefined;
}

function parseAllowedUserIds(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function listAccountIds(cfg: unknown): string[] {
  const channelCfg = getChannelConfig(cfg);
  if (!channelCfg) return [];

  const ids = new Set<string>();

  const hasBaseToken = channelCfg.token || process.env.CUSTOM_CHANNEL_TOKEN;
  if (hasBaseToken) {
    ids.add("default");
  }

  if (channelCfg.accounts) {
    for (const id of Object.keys(channelCfg.accounts)) {
      ids.add(id);
    }
  }

  return Array.from(ids);
}

export function resolveAccount(
  cfg: unknown,
  accountId?: string | null,
): ResolvedCustomAccount {
  const channelCfg = getChannelConfig(cfg) ?? {};
  const id = accountId || "default";

  const accountOverride = channelCfg.accounts?.[id] ?? {};

  const envToken = process.env.CUSTOM_CHANNEL_TOKEN ?? "";
  const envIncomingUrl = process.env.CUSTOM_CHANNEL_INCOMING_URL ?? "";
  const envAllowFrom = process.env.CUSTOM_CHANNEL_ALLOW_FROM ?? "";
  const envBotName = process.env.OPENCLAW_BOT_NAME ?? "OpenClaw";

  return {
    accountId: id,
    enabled: accountOverride.enabled ?? channelCfg.enabled ?? true,
    token: accountOverride.token ?? channelCfg.token ?? envToken,
    incomingUrl:
      accountOverride.incomingUrl ?? channelCfg.incomingUrl ?? envIncomingUrl,
    webhookPath:
      accountOverride.webhookPath ?? channelCfg.webhookPath ?? "/webhook/custom",
    dmPolicy:
      accountOverride.dmPolicy ?? channelCfg.dmPolicy ?? "allowlist",
    allowedUserIds: parseAllowedUserIds(
      accountOverride.allowFrom ?? channelCfg.allowFrom ?? envAllowFrom,
    ),
    rateLimitPerMinute:
      accountOverride.rateLimitPerMinute ??
      channelCfg.rateLimitPerMinute ??
      30,
    botName: accountOverride.botName ?? channelCfg.botName ?? envBotName,
    allowInsecureSsl:
      accountOverride.allowInsecureSsl ?? channelCfg.allowInsecureSsl ?? false,
  };
}
