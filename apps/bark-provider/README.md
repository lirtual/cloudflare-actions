# Bark Action Provider (Spec #16)

Independent, private Cloudflare WorkerEntrypoint. The only production target is the
Owner's configured Bark device, using POST `https://api.day.app/push`. There is no public
send route, MCP endpoint, webhook, database, queue, scheduler, or message-history table.

## Contract

- Private RPC: `getContract()` → actual Cloudflare Worker Version ID and reviewed
  contract digest. `sendNotification(input)` → `accepted | rejected | unknown`.
- Caller is the reviewed `workflow-mcp-worker` Service Binding; Workflow performs
  explicit approval and durable one-shot D1 reservation before calling the RPC.
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

## Production release and recovery

The only normal Bark publication path is **GitHub Actions → Release Bark Provider**
on current `main` with the explicit dispatch checkbox, using separate GitHub
Environment `bark-provider`:

- **Environment Secrets:** `CLOUDFLARE_API_TOKEN`, `BARK_DEVICE_KEY`,
  `BARK_ENCRYPTION_KEY`.
- **Environment Variable:** `CLOUDFLARE_ACCOUNT_ID`.
- Grant this deployment token the minimum Cloudflare permission for this Worker.
  Keep it separate from the Weixin Worker credentials.
- Release checks source isolation, tests and exact active deployment+secrets;
  temporary injection data is private and discarded. No test message is sent.
  If a secret step fails, do **not** retry blindly: inspect the active version
  before remediation.
- Next release `workflow-mcp-worker` through its **existing** approved manual
  GitHub Actions release. That release checks the Bark active Version ID and
  pins it to `BARK_ACTION_DEPLOYMENT_ID` while preserving Weixin's own pin.
  Workflow release credentials must have **read-only visibility of Bark**
  in addition to their existing Worker release rights.
- Never auto-follow latest, run a historical uncertain send again, or
  automatically roll back to an unreviewed/secret-incompatible Worker version.
  Rollback is a separate explicitly reviewed manual operation: confirm the
  proposed version's contract and exact consumer pin first; redeploy only
  a previously reviewed compatible Version via the existing Cloudflare
  version mechanism, and verify its active ID again. A source-only revert
  is not evidence of a safe rollback.

Key rotation: reset/revoke the Device Key in the Bark iOS app, replace the
independent GitHub Secret and perform a separate reviewed Bark release.
Synchronize the AES key to the phone before re-enabling sends.
Old-key revocation, notification-update behavior and iPhone decryption
**must be individually verified**; neither unit tests nor an HTTP 200 suffice.

## Verification status

Local crypto/vector, field constraints, response classification, reviewed RPC,
Workflow D1 at-most-once semantics and Weixin regression tests are automatable.
Real Cloudflare deployment, proof of phone delivery/decryption, Device Key
rotation and advanced iOS notification behaviors require independent
production authorization. The Issue #16 Q25 post-decryption-failure recovery
choice remains **unapproved**. No automatic cipher fallback is implemented.
