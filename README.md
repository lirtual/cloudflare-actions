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
  The old `MCP_ACCESS_TOKEN` is no longer consumed by the source. The existing
  manual release passes a JSON null *only for this legacy key* to retire it
  atomically, while omitting and inheriting the irreplaceable encryption key.
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
