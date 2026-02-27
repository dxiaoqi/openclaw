# openclaw-custom-channel

Custom channel plugin for OpenClaw — webhook-based integration for your own chat backend. Supports **direct messages** and **group chat**.

## Overview

This extension lets you connect OpenClaw to any chat system via HTTP webhooks. Your backend sends incoming messages to OpenClaw's webhook, and OpenClaw sends replies to your backend's URL.

- Receive messages from your chat system (direct + group)
- Send AI replies back via your API
- Configurable access control (allowlist, pairing, open)
- Rate limiting and token validation

## Installation

**From npm:**

```bash
openclaw plugins install openclaw-custom-channel
```

**From local checkout:**

```bash
openclaw plugins install ./extensions/custom
```

## Quick Setup

1. Add config to `~/.openclaw/openclaw.json`:

   ```json
   {
     "channels": {
       "custom": {
         "enabled": true,
         "webhookPath": "/webhook/custom",
         "incomingUrl": "https://your-backend.example.com/openclaw/receive",
         "token": "your-secret-token",
         "dmPolicy": "allowlist",
         "allowFrom": ["user-123", "user-456"]
       }
     }
   }
   ```

2. Start the gateway (or restart if already running).

3. Configure your backend to POST webhook events to the gateway URL (e.g. `https://your-gateway.openclaw.ai/webhook/custom`).

## Webhook Payload Format (Inbound)

Your backend POSTs JSON to the webhook with at least:

| Field     | Type   | Required | Description                    |
| --------- | ------ | -------- | ------------------------------ |
| `userId`  | string | Yes      | Sender's user ID               |
| `text`    | string | Yes      | Message text                   |
| `userName`| string | No       | Display name                   |
| `groupId` | string | No       | Group ID (for group chat)      |
| `groupName`| string | No      | Group display name             |
| `chatType`| string | No       | `"direct"` or `"group"`        |
| `token`   | string | No       | Secret for validation          |

**Example:**

```json
{
  "userId": "user-123",
  "userName": "Alice",
  "groupId": "group-456",
  "groupName": "Team Chat",
  "text": "Hello, OpenClaw!",
  "chatType": "group"
}
```

## Outbound (Replies)

OpenClaw sends replies to your `incomingUrl` as JSON:

```json
{
  "to": "user-123",
  "text": "Hello! How can I help?",
  "chatType": "direct"
}
```

For group chat, `to` is the group ID. Adapt `src/client.ts` to match your API format.

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | boolean | `true` | Enable the channel |
| `webhookPath` | string | `/webhook/custom` | Path for inbound webhook |
| `incomingUrl` | string | — | URL for outbound replies |
| `token` | string | — | Secret for webhook validation |
| `dmPolicy` | string | `allowlist` | `open`, `allowlist`, `pairing`, or `disabled` |
| `allowFrom` | string[] | `[]` | Allowed user IDs when dmPolicy=allowlist |
| `rateLimitPerMinute` | number | `30` | Per-user rate limit |
| `allowInsecureSsl` | boolean | `false` | Skip TLS verification for incomingUrl |

### Environment Variables

- `CUSTOM_CHANNEL_TOKEN` — Webhook validation token
- `CUSTOM_CHANNEL_INCOMING_URL` — Outbound reply URL
- `CUSTOM_CHANNEL_ALLOW_FROM` — Comma-separated user IDs

## Adapting to Your Backend

1. **Webhook payload**: Edit `src/webhook-handler.ts` → `parsePayload()` to match your schema.
2. **Outbound format**: Edit `src/client.ts` → `sendMessage()` and `sendFileUrl()` to match your API.
3. **Config schema**: Extend `src/types.ts` and `channel.ts` for extra fields.

## Pairing

When using `dmPolicy: "pairing"`, approve users with:

```bash
openclaw pairing approve custom <userId>
```

## Troubleshooting

- **401 Invalid token**: Ensure your backend sends the correct `token` in the webhook payload.
- **403 User not authorized**: Add the user to `allowFrom` or use `dmPolicy: "open"` for testing.
- **Replies not sent**: Verify `incomingUrl` is correct and your backend accepts the outbound JSON format.
- **Plugin manifest not found**: Ensure `openclaw.plugin.json` is present in the package (reinstall from npm).

## Full Documentation

See [docs.openclaw.ai/channels/custom](https://docs.openclaw.ai/channels/custom) for more details.

## License

MIT
