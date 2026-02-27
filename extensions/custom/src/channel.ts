/**
 * Custom Channel Plugin for OpenClaw.
 *
 * Webhook-based integration supporting direct chat and group chat.
 * Adapt webhook payload format and client.sendMessage to your backend API.
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk";
import {
  DEFAULT_ACCOUNT_ID,
  setAccountEnabledInConfigSection,
  registerPluginHttpRoute,
  buildChannelConfigSchema,
} from "openclaw/plugin-sdk";
import { z } from "zod";
import { listAccountIds, resolveAccount } from "./accounts.js";
import { sendMessage } from "./client.js";
import { getCustomRuntime } from "./runtime.js";
import type { ResolvedCustomAccount } from "./types.js";
import { createWebhookHandler } from "./webhook-handler.js";

const CHANNEL_ID = "custom";

const CustomConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    token: z.string().optional(),
    incomingUrl: z.string().url().optional(),
    webhookPath: z.string().optional(),
    dmPolicy: z.enum(["open", "allowlist", "pairing", "disabled"]).optional(),
    allowFrom: z.union([z.string(), z.array(z.string())]).optional(),
    rateLimitPerMinute: z.number().optional(),
    botName: z.string().optional(),
    allowInsecureSsl: z.boolean().optional(),
  })
  .passthrough();

const CustomChannelConfigSchema = buildChannelConfigSchema(CustomConfigSchema);

const activeRouteUnregisters = new Map<string, () => void>();

export function createCustomChannelPlugin() {
  return {
    id: CHANNEL_ID,

    meta: {
      id: CHANNEL_ID,
      label: "Custom",
      selectionLabel: "Custom (Webhook)",
      detailLabel: "Custom (Webhook)",
      docsPath: "/channels/custom",
      blurb: "Connect your own chat backend via webhook for direct and group messages",
      order: 95,
    },

    capabilities: {
      chatTypes: ["direct" as const, "group" as const],
      media: true,
      threads: false,
      reactions: false,
      edit: false,
      unsend: false,
      reply: false,
      effects: false,
      blockStreaming: false,
    },

    reload: { configPrefixes: [`channels.${CHANNEL_ID}`] },

    configSchema: CustomChannelConfigSchema,

    config: {
      listAccountIds: (cfg: unknown) => listAccountIds(cfg),
      resolveAccount: (cfg: unknown, accountId?: string | null) =>
        resolveAccount(cfg, accountId),
      defaultAccountId: () => DEFAULT_ACCOUNT_ID,
      setAccountEnabled: ({
        cfg,
        accountId,
        enabled,
      }: {
        cfg: unknown;
        accountId: string;
        enabled: boolean;
      }) =>
        setAccountEnabledInConfigSection({
          cfg: cfg as OpenClawConfig,
          sectionKey: CHANNEL_ID,
          accountId,
          enabled,
          allowTopLevel: true,
        }),
    },

    pairing: {
      idLabel: "customUserId",
      normalizeAllowEntry: (entry: string) => entry.toLowerCase().trim(),
      notifyApproval: async ({
        cfg,
        id,
      }: {
        cfg: unknown;
        id: string;
      }) => {
        const account = resolveAccount(cfg);
        if (!account.incomingUrl) return;
        await sendMessage(
          account.incomingUrl,
          "OpenClaw: your access has been approved.",
          id,
          account.allowInsecureSsl,
        );
      },
    },

    security: {
      resolveDmPolicy: ({
        cfg,
        accountId,
        account,
      }: {
        cfg: unknown;
        accountId?: string | null;
        account: ResolvedCustomAccount;
      }) => {
        const resolvedAccountId =
          accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
        const channelCfg = (cfg as Record<string, unknown>)?.channels?.[
          CHANNEL_ID
        ] as Record<string, unknown> | undefined;
        const useAccountPath = Boolean(channelCfg?.accounts?.[resolvedAccountId]);
        const basePath = useAccountPath
          ? `channels.${CHANNEL_ID}.accounts.${resolvedAccountId}.`
          : `channels.${CHANNEL_ID}.`;
        return {
          policy: account.dmPolicy ?? "allowlist",
          allowFrom: account.allowedUserIds,
          policyPath: `${basePath}dmPolicy`,
          allowFromPath: basePath,
          approveHint: "openclaw pairing approve custom <code>",
          normalizeEntry: (raw: string) => raw.toLowerCase().trim(),
        };
      },
      collectWarnings: ({ account }: { account: ResolvedCustomAccount }) => {
        const warnings: string[] = [];
        if (!account.token && account.dmPolicy !== "open") {
          warnings.push(
            "- Custom: token not configured. Consider adding token for webhook validation.",
          );
        }
        if (!account.incomingUrl) {
          warnings.push(
            "- Custom: incomingUrl not configured. The bot cannot send replies.",
          );
        }
        if (account.dmPolicy === "open") {
          warnings.push(
            '- Custom: dmPolicy="open" allows any user to message the bot. Consider "allowlist" for production.',
          );
        }
        if (
          account.dmPolicy === "allowlist" &&
          account.allowedUserIds.length === 0
        ) {
          warnings.push(
            '- Custom: dmPolicy="allowlist" with empty allowFrom blocks all senders. Add users or set dmPolicy="open".',
          );
        }
        return warnings;
      },
    },

    messaging: {
      normalizeTarget: (target: string) => {
        const trimmed = target.trim();
        if (!trimmed) return undefined;
        return trimmed.replace(/^custom:/i, "").trim();
      },
      targetResolver: {
        looksLikeId: (id: string) => {
          const trimmed = id?.trim();
          if (!trimmed) return false;
          return /^custom:/i.test(trimmed) || trimmed.length > 0;
        },
        hint: "<userId> or <groupId>",
      },
    },

    directory: {
      self: async () => null,
      listPeers: async () => [],
      listGroups: async () => [],
    },

    outbound: {
      deliveryMode: "gateway" as const,
      textChunkLimit: 2000,

      sendText: async ({
        to,
        text,
        accountId,
        account: ctxAccount,
      }: {
        to: string;
        text: string;
        accountId?: string | null;
        account?: ResolvedCustomAccount;
      }) => {
        const account: ResolvedCustomAccount =
          ctxAccount ?? resolveAccount({}, accountId);

        if (!account.incomingUrl) {
          throw new Error("Custom channel incoming URL not configured");
        }

        const ok = await sendMessage(
          account.incomingUrl,
          text,
          to,
          account.allowInsecureSsl,
        );
        if (!ok) {
          throw new Error("Failed to send message to Custom channel");
        }
        return { channel: CHANNEL_ID, messageId: `custom-${Date.now()}`, chatId: to };
      },

      sendMedia: async ({
        to,
        mediaUrl,
        accountId,
        account: ctxAccount,
      }: {
        to: string;
        mediaUrl?: string;
        accountId?: string | null;
        account?: ResolvedCustomAccount;
      }) => {
        const account: ResolvedCustomAccount =
          ctxAccount ?? resolveAccount({}, accountId);

        if (!account.incomingUrl) {
          throw new Error("Custom channel incoming URL not configured");
        }
        if (!mediaUrl) {
          throw new Error("No media URL provided");
        }

        const { sendFileUrl } = await import("./client.js");
        const ok = await sendFileUrl(
          account.incomingUrl,
          mediaUrl,
          to,
          account.allowInsecureSsl,
        );
        if (!ok) {
          throw new Error("Failed to send media to Custom channel");
        }
        return { channel: CHANNEL_ID, messageId: `custom-${Date.now()}`, chatId: to };
      },
    },

    gateway: {
      startAccount: async (ctx: {
        cfg: unknown;
        accountId: string;
        account: ResolvedCustomAccount;
        log?: { info?: (msg: string) => void; warn?: (msg: string) => void };
      }) => {
        const { cfg, accountId, log } = ctx;
        const account = resolveAccount(cfg, accountId);

        if (!account.enabled) {
          log?.info?.(`Custom account ${accountId} is disabled, skipping`);
          return { stop: () => {} };
        }

        if (!account.token && account.dmPolicy !== "open") {
          log?.warn?.(
            `Custom account ${accountId} has no token; webhook validation disabled`,
          );
        }
        if (!account.incomingUrl) {
          log?.warn?.(
            `Custom account ${accountId} incomingUrl not configured; replies will fail`,
          );
        }
        if (
          account.dmPolicy === "allowlist" &&
          account.allowedUserIds.length === 0
        ) {
          log?.warn?.(
            `Custom account ${accountId} dmPolicy=allowlist but empty allowFrom; refusing to start`,
          );
          return { stop: () => {} };
        }

        log?.info?.(
          `Starting Custom channel (account: ${accountId}, path: ${account.webhookPath})`,
        );

        const handler = createWebhookHandler({
          account,
          deliver: async (msg) => {
            const rt = getCustomRuntime();
            const currentCfg = await rt.config.loadConfig();

            const targetTo = msg.groupId ?? msg.from;

            const msgCtx = {
              Body: msg.body,
              From: msg.from,
              To: account.botName,
              SessionKey: msg.sessionKey,
              AccountId: account.accountId,
              OriginatingChannel: CHANNEL_ID,
              OriginatingTo: targetTo,
              ChatType: msg.chatType,
              SenderName: msg.senderName,
            };

            await rt.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
              ctx: msgCtx,
              cfg: currentCfg,
              dispatcherOptions: {
                deliver: async (payload: { text?: string; body?: string }) => {
                  const text = payload?.text ?? payload?.body;
                  if (text && account.incomingUrl) {
                    await sendMessage(
                      account.incomingUrl,
                      text,
                      targetTo,
                      account.allowInsecureSsl,
                      msg.chatType === "group" ? "group" : "direct",
                    );
                  }
                },
                onReplyStart: () => {
                  log?.info?.(`Agent reply started for ${msg.from}`);
                },
              },
            });
          },
          log,
        });

        const routeKey = `${accountId}:${account.webhookPath}`;
        const prevUnregister = activeRouteUnregisters.get(routeKey);
        if (prevUnregister) {
          log?.info?.(`Deregistering stale route before re-registering: ${account.webhookPath}`);
          prevUnregister();
          activeRouteUnregisters.delete(routeKey);
        }

        const unregister = registerPluginHttpRoute({
          path: account.webhookPath,
          pluginId: CHANNEL_ID,
          accountId: account.accountId,
          log: (msg: string) => log?.info?.(msg),
          handler,
        });
        activeRouteUnregisters.set(routeKey, unregister);

        log?.info?.(`Registered HTTP route: ${account.webhookPath} for Custom channel`);

        return {
          stop: () => {
            log?.info?.(`Stopping Custom channel (account: ${accountId})`);
            if (typeof unregister === "function") unregister();
            activeRouteUnregisters.delete(routeKey);
          },
        };
      },

      stopAccount: async (ctx: { accountId: string; log?: { info?: (msg: string) => void } }) => {
        ctx.log?.info?.(`Custom account ${ctx.accountId} stopped`);
      },
    },

    agentPrompt: {
      messageToolHints: () => [
        "",
        "### Custom Channel",
        "Adapt formatting hints to your backend. Default: plain text.",
        "Use JSON payload for outbound: { to, text, chatType }.",
        "",
      ],
    },
  };
}
