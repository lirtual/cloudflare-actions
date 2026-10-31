# Weixin Action Provider · Spec #392

This is the **existing** Cloudflare Worker `weixin-mcp-worker`, retained in place to
preserve Owner encryption, D1 history and Service Binding identity. Its original
public MCP domain and Portal registration have already been retired.

## Current interfaces

- Owner Access administration only: `https://weixin.lirtual.dpdns.org/setup`,
  preserving signed identity and CSRF checks. No public send API.
- Internal `WeixinActionProvider` WorkerEntrypoint RPC: `getContract`,
  `getBinding` (read-only decryption proof), `sendText`, `sendDownloadComplete`,
  `getDownloadContract`, `getGenericContract`, `sendGenericText` and `getReceipt`.
  All sends are pinned to a reviewed Provider Version ID and immutable digest.
- The `WEIXIN_ENCRYPTION_KEY` Cloudflare Secret and the production
  `weixin-mcp-db` binding are inherited, never reset or recreated. The old
  `MCP_ACCESS_TOKEN` is no longer needed by this source. Remove the stored
  legacy Secret using the one-time non-interactive `wrangler versions secret bulk`
  JSON null operation in the existing manual Provider release, then confirm
  its absence and the unchanged encryption Secret. Never retry a partially
  completed version creation without first inspecting the Cloudflare version list.

## Generic Owner text contract (source-only v2)

`weixin.send_text` v2 takes a bounded caller-authored text body through private
`sendGenericText` Service Binding RPC, never a public send endpoint. Workflow
must authorize the content and dependencies at Publish and verify completed
predecessors before the first send. The Provider independently checks its
reviewed v2 digest, live Worker version, Owner binding generation, message
length, and idempotent D1 reservation; it accepts no recipient or URL override.
The existing OpenList and download-specific RPCs are retained only to serve
immutable published Plans during the version-pinned migration. A changed
Worker Version ID requires separately approved Workflow pin/republication.

## Safety and evidence

D1 stores generation-bound encrypted Owner sessions, QR staging, leases and
durable receipts. Duplicate invocation IDs cannot resend; `unknown` stays
unknown. The owner independently confirmed receiving the controlled
OpenList-to-Weixin notification in 2026-10-28, while the upstream machine
acknowledgement remained `unknown`. Do not replay the invocation or claim
the machine returned `accepted`.

The independent `cloudflare-actions` repository is the **only** production
publisher, through the existing main-only manual GitHub Actions workflow.
The legacy public hostname must not reappear. A newly deployed Provider
changes its Worker Version ID: coordinate Workflow's environment-pinned
`WEIXIN_ACTION_DEPLOYMENT_ID` and its authorized rollout before reuse.
Do not edit immutable Published Plans or override a D1 release fence.

Run `corepack pnpm run check` from the repository root for SQLite tests,
synthetic iLink/QR tests, real local workerd D1/RPC tests, TypeScript checks,
and Wrangler dry-run. No live Tencent request is performed by these checks.

## Owner context preflight and numeric reject diagnostics (source-only proposal)

New sends still perform the existing bounded `getUpdates` sync. If the latest
verified direct Owner message is older than **24 hours** (or absent), reject
with `owner_context_stale` *before* durable reservation or Tencent dispatch.
This is a conservative local policy, **not** a documented Tencent token TTL.
The Owner must send a new direct message before starting a separately authorized
new Invocation. Matching, already-reserved historical IDs are read without
polling or resending. Verified Owner messages refresh the observation time
even if their context token is unchanged; strangers and groups never do.

The additive migration `migrations/0002_send_rejection_codes.sql` adds
nullable bounded integer `upstream_ret`/`upstream_errcode` fields to D1
receipts for **definitive** business rejects only. Unknown or ambiguous
transport retains `unknown` with NULL diagnostics. No token, raw errmsg,
message body or personal identity is written or exposed by Action RPC.

**Production authorization is separate.** Review and apply the additive D1
migration to the existing database **before** publishing code that writes
these columns. Verify the schema and historical receipts read-only, then use
the single existing main-only Provider release plus the separately reviewed
Workflow exact version pin release. This PR makes no production Cloudflare
write and sends no Weixin messages.

### Reviewed download completion notification

`weixin.notify_download` is a distinct immutable contract from
`weixin.send_text`, which remains strictly restricted to a verified OpenList
Session URL. The new Provider RPC accepts no arbitrary text, URL or recipient:
it sends only `Koofr 下载完成，云端文件回读校验已通过。` to the currently
verified Owner binding. The Workflow consumer independently requires the same
Run's reviewed single-item GitHub download Task, its OIDC-authenticated GitHub Claim,
physically confirmed success, and completed parent Step before reserving a
single D1 Invocation. Duplicate/ambiguous sends use read-only receipt recovery;
`unknown` is not automatically retried. The upstream `accepted` status does
not establish phone delivery.