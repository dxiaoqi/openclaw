/**
 * Inbound webhook handler for the Custom channel.
 *
 * Expects JSON body with: { userId, userName?, groupId?, groupName?, text, chatType? }
 * Optional: token for validation.
 *
 * Customize parsePayload() to match your backend's webhook format.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  validateToken,
  authorizeUserForDm,
  sanitizeInput,
  RateLimiter,
} from "./security.js";
import type { CustomWebhookPayload, ResolvedCustomAccount } from "./types.js";

const rateLimiters = new Map<string, RateLimiter>();

function getRateLimiter(account: ResolvedCustomAccount): RateLimiter {
  let rl = rateLimiters.get(account.accountId);
  if (!rl) {
    rl = new RateLimiter(account.rateLimitPerMinute);
    rateLimiters.set(account.accountId, rl);
  }
  return rl;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const maxSize = 1_048_576;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxSize) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function parsePayload(body: string): CustomWebhookPayload | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return null;
  }

  const userId = String(parsed.userId ?? "").trim();
  const text = String(parsed.text ?? "").trim();

  if (!userId || !text) return null;

  const chatType =
    parsed.chatType === "group" ? "group" : "direct";
  const groupId = parsed.groupId ? String(parsed.groupId) : undefined;
  const groupName = parsed.groupName ? String(parsed.groupName) : undefined;

  return {
    token: parsed.token ? String(parsed.token) : undefined,
    userId,
    userName: parsed.userName ? String(parsed.userName) : undefined,
    groupId,
    groupName,
    text,
    chatType,
  };
}

function respond(res: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export interface WebhookHandlerDeps {
  account: ResolvedCustomAccount;
  /** Deliver to agent; replies are sent via dispatcherOptions.deliver inside. */
  deliver: (msg: {
    body: string;
    from: string;
    senderName: string;
    chatType: string;
    sessionKey: string;
    accountId: string;
    groupId?: string;
    groupName?: string;
  }) => Promise<void>;
  log?: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

export function createWebhookHandler(deps: WebhookHandlerDeps) {
  const { account, deliver, log } = deps;
  const rateLimiter = getRateLimiter(account);

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== "POST") {
      respond(res, 405, { error: "Method not allowed" });
      return;
    }

    let body: string;
    try {
      body = await readBody(req);
    } catch (err) {
      log?.error?.("Failed to read request body", err);
      respond(res, 400, { error: "Invalid request body" });
      return;
    }

    const payload = parsePayload(body);
    if (!payload) {
      respond(res, 400, { error: "Missing required fields (userId, text)" });
      return;
    }

    if (account.token && payload.token && !validateToken(payload.token, account.token)) {
      log?.warn?.(`Invalid token from ${req.socket?.remoteAddress}`);
      respond(res, 401, { error: "Invalid token" });
      return;
    }

    const auth = authorizeUserForDm(
      payload.userId,
      account.dmPolicy,
      account.allowedUserIds,
    );
    if (!auth.allowed) {
      if (auth.reason === "disabled") {
        respond(res, 403, { error: "DMs are disabled" });
        return;
      }
      if (auth.reason === "allowlist-empty") {
        log?.warn?.("Custom channel allowlist is empty while dmPolicy=allowlist");
        respond(res, 403, {
          error: "Allowlist is empty. Configure allowFrom or use dmPolicy=open.",
        });
        return;
      }
      log?.warn?.(`Unauthorized user: ${payload.userId}`);
      respond(res, 403, { error: "User not authorized" });
      return;
    }

    if (!rateLimiter.check(payload.userId)) {
      log?.warn?.(`Rate limit exceeded for user: ${payload.userId}`);
      respond(res, 429, { error: "Rate limit exceeded" });
      return;
    }

    const cleanText = sanitizeInput(payload.text);
    if (!cleanText) {
      respond(res, 200, { ok: true });
      return;
    }

    const preview = cleanText.length > 100 ? `${cleanText.slice(0, 100)}...` : cleanText;
    log?.info?.(`Message from ${payload.userName ?? payload.userId} (${payload.userId}): ${preview}`);

    respond(res, 200, { ok: true, message: "Processing..." });

    const sessionKey = payload.groupId
      ? `custom-${payload.groupId}-${payload.userId}`
      : `custom-${payload.userId}`;

    try {
      await deliver({
        body: cleanText,
        from: payload.userId,
        senderName: payload.userName ?? payload.userId,
        chatType: payload.chatType ?? "direct",
        sessionKey,
        accountId: account.accountId,
        groupId: payload.groupId,
        groupName: payload.groupName,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log?.error?.(`Failed to process message: ${errMsg}`);
      if (account.incomingUrl) {
        const { sendMessage } = await import("./client.js");
        await sendMessage(
          account.incomingUrl,
          "Sorry, an error occurred while processing your message.",
          payload.groupId ?? payload.userId,
          account.allowInsecureSsl,
          payload.chatType ?? "direct",
        );
      }
    }
  };
}
