---
summary: "Custom channel - webhook-based integration for your own chat backend"
read_when:
  - You want to connect OpenClaw to your own chat system
  - You need a template for building a custom channel plugin
title: "Custom"
---

# Custom (plugin)

The Custom channel lets you connect OpenClaw to your own chat backend via webhooks. It supports both **direct messages** and **group chat**.

## Plugin required

Install via CLI:

```bash
openclaw plugins install openclaw-custom-channel
```

Or from a local checkout:

```bash
openclaw plugins install ./extensions/custom
```

## Webhook payload format

Your backend should POST JSON to the webhook URL with at least:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | string | Yes | Sender's user ID |
| `text` | string | Yes | Message text |
| `userName` | string | No | Display name |
| `groupId` | string | No | Group ID (for group chat) |
| `groupName` | string | No | Group display name |
| `chatType` | string | No | `"direct"` or `"group"` |
| `token` | string | No | Secret for validation (if configured) |

Example inbound payload:

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

## Outbound (replies)

OpenClaw sends replies to your `incomingUrl` as JSON:

```json
{
  "to": "user-123",
  "text": "Hello! How can I help?",
  "chatType": "direct"
}
```

For group chat, `to` is the group ID. Adapt `extensions/custom/src/client.ts` to match your API.

## Configuration

Minimal config in `~/.openclaw/openclaw.json`:

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

### Options

| Key | Type | Description |
|-----|------|-------------|
| `enabled` | boolean | Enable the channel |
| `webhookPath` | string | Path for inbound webhook (default: `/webhook/custom`) |
| `incomingUrl` | string | URL for outbound replies |
| `token` | string | Secret for webhook validation |
| `dmPolicy` | string | `open`, `allowlist`, `pairing`, or `disabled` |
| `allowFrom` | string[] | Allowed user IDs when dmPolicy=allowlist |
| `rateLimitPerMinute` | number | Per-user rate limit (default: 30) |
| `allowInsecureSsl` | boolean | Skip TLS verification for incomingUrl |

### Environment variables

- `CUSTOM_CHANNEL_TOKEN` — Webhook validation token
- `CUSTOM_CHANNEL_INCOMING_URL` — Outbound reply URL
- `CUSTOM_CHANNEL_ALLOW_FROM` — Comma-separated user IDs

## Adapting to your backend

1. **Webhook payload**: Edit `extensions/custom/src/webhook-handler.ts` → `parsePayload()` to match your schema.
2. **Outbound format**: Edit `extensions/custom/src/client.ts` → `sendMessage()` and `sendFileUrl()` to match your API.
3. **Config schema**: Extend `extensions/custom/src/types.ts` and `channel.ts` for extra fields.

## Pairing

When using `dmPolicy: "pairing"`, approve users with:

```bash
openclaw pairing approve custom <userId>
```

## Troubleshooting

- **401 Invalid token**: Ensure your backend sends the correct `token` in the webhook payload.
- **403 User not authorized**: Add the user to `allowFrom` or use `dmPolicy: "open"` for testing.
- **Replies not sent**: Verify `incomingUrl` is correct and your backend accepts the outbound JSON format.
