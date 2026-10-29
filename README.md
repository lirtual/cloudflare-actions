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


## Reviewed automatic version handoff (post-release, no new publisher)

`.github/workflows/weixin-version-handoff.yml` is a **notification-only**
workflow triggered by a successful `Release Weixin Provider` workflow_run
or manually with a successful `release_run_id` for a missed handoff.
It does **not** deploy either Worker, mutate D1, send Weixin messages,
or update the consuming repository by itself.

The handoff runs inside the existing protected `weixin-provider` Environment.
It independently verifies the latest successful manual Provider release,
its main-branch code ancestry, and the live 100%-deployed Cloudflare
Provider Version and existing D1/Secret guards. It then emits exactly one
`reviewed_weixin_provider_release` repository_dispatch to
`lirtual/mcp-workers`, carrying only release run ID, commit SHA and exact
Provider Version ID. An ambiguous dispatch result is **not retried**.

**One-time prerequisite** (set in the GitHub `weixin-provider` Environment):
`WEIXIN_WORKFLOW_DISPATCH_TOKEN`, a dedicated fine-grained token or
GitHub App token limited to `lirtual/mcp-workers` repository
**Contents: write** for repository_dispatch. Do not use a personal
all-repositories token or display it in logs. Existing
`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` are only used for
read-only preflight. GitHub's native `GITHUB_TOKEN` authenticates
same-repository release provenance. No new public endpoint is created.

The receiving Workflow repository has its **own** approval gate and
separately scoped credentials; see its `docs/weixin-provider-version-sync.md`.
A successful dispatch does not prove the consumer release succeeded.
If credentials or provider proof are missing, the handoff fails closed
and the already completed Provider release is **not** rolled back.

For the already-completed 2026-10-29 Provider release, manually dispatch
`Hand off reviewed Weixin Provider Version` with
`release_run_id=40796327454` **after** both sides have the required
GitHub Environment Secrets and approvals configured. This reuses the
existing active version; it does not publish another one.
