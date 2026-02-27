/**
 * HTTP client for sending messages to your custom backend.
 *
 * Sends JSON payload to the incomingUrl. Adapt the payload format to match
 * your backend's API (e.g. { to, text } or { userId, message }).
 */

import * as http from "node:http";
import * as https from "node:https";

const MIN_SEND_INTERVAL_MS = 200;
let lastSendTime = 0;

export interface SendPayload {
  to: string;
  text: string;
  chatType?: "direct" | "group";
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function doPost(url: string, body: string, allowInsecureSsl: boolean): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      reject(new Error(`Invalid URL: ${url}`));
      return;
    }
    const transport = parsedUrl.protocol === "https:" ? https : http;

    const req = transport.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 30_000,
        rejectUnauthorized: !allowInsecureSsl,
      },
      (res) => {
        res.on("data", () => {});
        res.on("end", () => {
          resolve(res.statusCode === 200 || res.statusCode === 201);
        });
      },
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
    req.write(body);
    req.end();
  });
}

/**
 * Send a text message to the custom backend.
 * Payload format: { to, text, chatType }. Adjust to match your API.
 */
export async function sendMessage(
  incomingUrl: string,
  text: string,
  to: string,
  allowInsecureSsl = false,
  chatType: "direct" | "group" = "direct",
): Promise<boolean> {
  const now = Date.now();
  const elapsed = now - lastSendTime;
  if (elapsed < MIN_SEND_INTERVAL_MS) {
    await sleep(MIN_SEND_INTERVAL_MS - elapsed);
  }

  const payload: SendPayload = { to, text, chatType };
  const body = JSON.stringify(payload);

  try {
    const ok = await doPost(incomingUrl, body, allowInsecureSsl);
    lastSendTime = Date.now();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Send media (file URL) to the custom backend.
 * Extend payload as needed for your API.
 */
export async function sendFileUrl(
  incomingUrl: string,
  fileUrl: string,
  to: string,
  allowInsecureSsl = false,
): Promise<boolean> {
  const payload = { to, fileUrl, chatType: "direct" as const };
  const body = JSON.stringify(payload);

  try {
    const ok = await doPost(incomingUrl, body, allowInsecureSsl);
    lastSendTime = Date.now();
    return ok;
  } catch {
    return false;
  }
}
