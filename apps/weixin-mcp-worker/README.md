# Weixin Action Provider · Spec #392

This is the **existing** Cloudflare Worker `weixin-mcp-worker`, retained in place to
preserve Owner encryption, D1 history and Service Binding identity. Its original
public MCP domain and Portal registration have already been retired.

## Current interfaces

- Owner Access administration only: `https://weixin.lirtual.dpdns.org/setup`,
  preserving signed identity and CSRF checks. No public send API.
- Internal `WeixinActionProvider` WorkerEntrypoint RPC: `getContract`,
  `getBinding` (read-only decryption proof), `sendText` and `getReceipt`.
  All sends are pinned to a reviewed Provider Version ID and immutable digest.
- The `WEIXIN_ENCRYPTION_KEY` Cloudflare Secret and the production
  `weixin-mcp-db` binding are inherited, never reset or recreated. The old
  `MCP_ACCESS_TOKEN` is no longer needed by this source. Remove the stored
  legacy Secret atomically in the reviewed manual Provider release, then
  independently confirm its absence and unchanged encryption Secret.

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
