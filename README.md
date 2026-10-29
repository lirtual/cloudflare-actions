# Cloudflare Actions

Independent, reviewed Cloudflare Action Providers. Specification:
https://github.com/lirtual/mcp-workers/issues/392.

## Weixin Provider

The production source for the existing Cloudflare Worker `weixin-mcp-worker`
lives under `apps/weixin-mcp-worker`. The name is an unchanged **physical
Worker identity**, not a public MCP capability.

- The new Owner-confirmed OpenList-to-Weixin delivery is through private
  `WeixinActionProvider` RPC using a static Service Binding and reviewed
  `weixin.send_text` action contract.
- The retired public MCP custom domain is **not** included in the release
  configuration. Only the Cloudflare Access-protected Owner management
  domain `weixin.lirtual.dpdns.org` remains.
- `WEIXIN_ENCRYPTION_KEY`, historical D1 and stored receipts are preserved.
  The old `MCP_ACCESS_TOKEN` is no longer consumed by the source. The existing manual release uses Wrangler 4.148.0's non-interactive versioned JSON
  bulk secret deletion of the obsolete `MCP_ACCESS_TOKEN` alone, then promotes
  the exact new Worker Version ID after reviewing the output. The
  `WEIXIN_ENCRYPTION_KEY` stays inherited and is never exposed.
- A send can return `accepted`, `rejected` or `unknown`. The owner
  confirmed message delivery for the production E2E, while the stored
  upstream acknowledgement remains `unknown`. Both facts are retained.
- No public generic RPC or generic text sending endpoint is provided.
  Legacy compatibility URLs must not be reinstated.

## Publication and rollback

The one release workflow is `.github/workflows/release.yml`, restricted to
manual dispatch on current `main`, the dedicated `weixin-provider` GitHub
Environment and scoped Worker Editor authority. CI never deploys.

The release guard verifies the old publisher stays disabled, the production
Worker/D1/encryption Secret and Owner host are unchanged, and the new version
has no `MCP_HOST` variable. The new Provider Worker Version ID must be
independently read back. **Do not assume this new version is yet authorized
by Workflow**: the consuming Worker has a separately reviewed, exact
`WEIXIN_ACTION_DEPLOYMENT_ID` version pin. Update it only through the
existing guarded Workflow production release and verify that all live
Sessions and prior indeterminate Runs remain protected.

Never rotate/remove the encryption key, delete D1 history, reset binding,
replay an unknown invocation or bypass the Workflow release fence.
See `apps/weixin-mcp-worker/README.md` for technical checks.


### Compatible Provider recovery

The **same** main-only manual `Release Weixin Provider` GitHub Action has
`restore_reviewed_version=true` for a separately approved recovery. It may
restore only the independently verified post-MCP-retirement, secret-free
Worker Version ID `6e9a914c-e5cd-4842-8f62-5907087facea`; no arbitrary
version input, second publisher, restored MCP public domain or bearer token.
This is a dormant recovery path, not a request to run a rollback as a test.

Before any actual restoration, verify the consuming Workflow is paused or
fully drained, align its exact `WEIXIN_ACTION_DEPLOYMENT_ID` via the existing
guarded release, and review the active Secret/D1/Owner bindings. A restored
Provider does **not** roll back D1, replay messages, replace Owner identity
or resolve historical `unknown` receipts. Do not deploy the old pre-retirement
versions that could restore removed MCP credentials.

## Downstream Workflow version pin

The `weixin-mcp-worker` remains an **independently reviewed and manually
released** Cloudflare Action Provider. To consume a newly released version,
the protected `lirtual/mcp-workers` **Release Worker** workflow reads and
pins the current active Provider Version directly from Cloudflare using its
existing read credential. No cross-repository dispatch credentials or
automatic unattended Worker cutover are needed. The consumer's existing
main-only release, environment approval, historical Run and physical
Session gates remain authoritative. An old `unknown` Weixin invocation
is never retried or changed.

This replaces the unactivated cross-repository handoff from PR #12.
No production Worker, D1, Secret, Owner identity or Weixin message is
modified by the source-only cleanup.

## Bark encrypted notifications

The private, one-device Bark Action Provider is specified in [apps/bark-provider/README.md](apps/bark-provider/README.md). It has an independent reviewed GitHub Actions manual release and does not change the Weixin Worker.
