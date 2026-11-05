# Bark notification source module (Spec #16)

**Current topology:** Bark (`provider: bark`, Action ID `bark.send_notification`)
runs in the unified `cloudflare-actions` Worker via
`apps/actions-worker/src/dispatch.ts`. This directory preserves the original
standalone Bark Provider implementation and its static contract as a source
module; it is **not** a separately deployed production Worker. The `bark-provider`
GitHub Environment and this directory's Wrangler configuration are historical,
not targets of the maintained publisher. The notification is sent only to the
Owner's configured Bark device using POST `https://api.day.app/push`, with no
public send route, MCP endpoint, webhook, database, queue, scheduler or
message-history table.

## Contract

- Unified `ACTIONS` RPC: `getContract('bark.send_notification')` returns the
  active Worker Version ID and reviewed contract digest; the approved
  `execute('bark.send_notification', invocation)` dispatches one notification,
  returning `accepted | rejected | unknown`.
- Caller is the reviewed `workflow-mcp-worker` through its single `ACTIONS`
  Service Binding; Workflow performs explicit approval and durable one-shot D1
  reservation before the RPC.
- Encrypted payload: AES-256-GCM, random 12-character ASCII IV (12 UTF-8 bytes),
  combined ciphertext + 16-byte tag in Base64, JSON body fields
  `device_key`, `ciphertext`, `iv`, and optional non-sensitive `id`.
  No automatic CBC or plaintext fallback. A Bark HTTP/API `accepted` is **not**
  evidence that the phone received or decrypted the notification.
- The Device Key and encryption Key are Worker Secrets, **not Action arguments**.
  The encryption key is exactly 32 printable ASCII bytes. The **same AES key**
  and GCM algorithm must be configured on the Bark app.
- Supported content fields include body/title/subtitle/markdown/group/level/sound/
  volume/call/copy/autoCopy/icon/image/url/action/isArchive/ttl/badge/id.
  Strict field validation; Badge 0, delete/routing fields and non-HTTPS URLs
  are rejected. `critical`, `call`, and `autoCopy` may affect the iPhone.
  `id` is an APNs notification update identifier, **not HTTP idempotency**.

## Current production release and recovery

The only maintained Provider publication path is the manual
[Release Unified Cloudflare Actions](../../.github/workflows/release-actions.yml)
workflow. Its Worker name is `cloudflare-actions`, and the unified dispatcher
publishes the Bark Action with `service: cloudflare-actions` and
`entrypoint: ActionsEntrypoint`. The reviewed consumer uses the existing
`ACTIONS` Service Binding; the former standalone Bark release workflow was
removed. The old `bark-provider` Environment remains in GitHub as legacy
metadata but is not referenced by this publisher. Do not treat a rename of
that Environment as a production migration or use this directory's legacy
Wrangler configuration to publish a new Worker.

The current publisher uses the GitHub Actions `vars.CLOUDFLARE_ACCOUNT_ID`
and `secrets.CLOUDFLARE_API_TOKEN` contexts for its protected release flow and verifies
the existing Worker bindings `BARK_DEVICE_KEY` and `BARK_ENCRYPTION_KEY`
without printing their values. Updates, rollback, compatibility review and
real sending require their own applicable gates and authorization; do not
replay a notification with an unknown result. See the root
[README](../../README.md) for the current release and recovery contract.

Key rotation requires a separately authorized change to the current unified
Worker's Bark Secrets and a reviewed unified release, not a legacy standalone
Bark publisher. Reset/revoke the Device Key in the Bark iOS app and synchronize
the AES key to the phone before re-enabling sends.
Old-key revocation, notification-update behavior and iPhone decryption
**must be individually verified**; neither unit tests nor an HTTP 200 suffice.

## Verification status

Local crypto/vector, field constraints, response classification, reviewed RPC,
Workflow D1 at-most-once semantics and Weixin regression tests are automatable.
Real Cloudflare deployment, proof of phone delivery/decryption, Device Key
rotation and advanced iOS notification behaviors require independent
production authorization. Issue #16 Q25=A was approved on 2026-10-29: if the handset cannot decrypt, stop related sends and fix AES-256-GCM compatibility. Never fall back to CBC/plaintext or automatically resend an uncertain result. The one-shot encrypted iPhone notification was observed and readable by the Owner; advanced iOS behaviors, key revocation and live failure injection remain **Not performed**. No automatic cipher fallback is implemented.
