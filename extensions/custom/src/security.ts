/**
 * Security: token validation, rate limiting, input sanitization, user allowlist.
 */

import * as crypto from "node:crypto";

export type DmAuthorizationResult =
  | { allowed: true }
  | { allowed: false; reason: "disabled" | "allowlist-empty" | "not-allowlisted" };

export function validateToken(received: string, expected: string): boolean {
  if (!received || !expected) return false;
  const key = "openclaw-token-cmp";
  const a = crypto.createHmac("sha256", key).update(received).digest();
  const b = crypto.createHmac("sha256", key).update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export function checkUserAllowed(userId: string, allowedUserIds: string[]): boolean {
  if (allowedUserIds.length === 0) return false;
  return allowedUserIds.includes(userId);
}

export function authorizeUserForDm(
  userId: string,
  dmPolicy: "open" | "allowlist" | "pairing" | "disabled",
  allowedUserIds: string[],
): DmAuthorizationResult {
  if (dmPolicy === "disabled") {
    return { allowed: false, reason: "disabled" };
  }
  if (dmPolicy === "open") {
    return { allowed: true };
  }
  if (allowedUserIds.length === 0) {
    return { allowed: false, reason: "allowlist-empty" };
  }
  if (!checkUserAllowed(userId, allowedUserIds)) {
    return { allowed: false, reason: "not-allowlisted" };
  }
  return { allowed: true };
}

export function sanitizeInput(text: string): string {
  const dangerousPatterns = [
    /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?)/gi,
    /you\s+are\s+now\s+/gi,
    /system:\s*/gi,
    /<\|.*?\|>/g,
  ];

  let sanitized = text;
  for (const pattern of dangerousPatterns) {
    sanitized = sanitized.replace(pattern, "[FILTERED]");
  }

  const maxLength = 4000;
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength) + "... [truncated]";
  }

  return sanitized;
}

export class RateLimiter {
  private requests = new Map<string, number[]>();
  private limit: number;
  private windowMs: number;
  private lastCleanup = 0;
  private cleanupIntervalMs: number;

  constructor(limit = 30, windowSeconds = 60) {
    this.limit = limit;
    this.windowMs = windowSeconds * 1000;
    this.cleanupIntervalMs = this.windowMs * 5;
  }

  check(userId: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    if (now - this.lastCleanup > this.cleanupIntervalMs) {
      this.cleanup(windowStart);
      this.lastCleanup = now;
    }

    let timestamps = this.requests.get(userId);
    if (timestamps) {
      timestamps = timestamps.filter((ts) => ts > windowStart);
    } else {
      timestamps = [];
    }

    if (timestamps.length >= this.limit) {
      this.requests.set(userId, timestamps);
      return false;
    }

    timestamps.push(now);
    this.requests.set(userId, timestamps);
    return true;
  }

  private cleanup(windowStart: number): void {
    for (const [userId, timestamps] of this.requests) {
      const active = timestamps.filter((ts) => ts > windowStart);
      if (active.length === 0) {
        this.requests.delete(userId);
      } else {
        this.requests.set(userId, active);
      }
    }
  }
}
