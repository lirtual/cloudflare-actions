# Cloudflare Actions

## Spec #54 · T6 Provider Bark-only candidate (2026-11-02)

**Source and CI only; not deployed.** The sole maintained runtime remains
`cloudflare-actions` with one `ActionsEntrypoint` Service Binding. Current
candidate exposes exactly four reviewed Actions: `bark.send_notification`,
`dub.shorten_url`, `envshare.share_text`, `litterbox.upload_file`.
`getContract`, `execute`, `getReceipt` and `getBinding` reject every
Weixin Action identity and historic digest; default Owner HTTP route returns
404. Legacy Weixin Handler, QR/Owner modules and separate Weixin/Bark release
workflows were removed from the *source tree*, without touching Cloudflare
Workers, historical receipts, production D1 or credentials.

The **existing** protected `release-actions.yml` maintenance entrypoint
accepts only separately approved `upgrade`, with exact live Provider and
Consumer version IDs/pin, frozen Action Gate, zero active Workflows, zero
unsettled Runs, unchanged historical receipt count and all six native instance
states empty. All `rollback` requests fail closed: older retained versions
execute Weixin or lack required other Actions, and no Bark-only rollback
candidate is independently proven. The release never automatically thaws
business workflows, re-pins Consumer or revokes a Secret. Protected Provider
release, Consumer pin update, and eventual legacy Secret/domain revocation
are **separate explicit production operations** (T6/T7).

The previous 2026-11-01 inventory and all prior provider/rollback procedures
*below* are historical, not instructions to run old publishers. Live T5
Consumer is already Bark-only; live Provider still remains the previous
Weixin-capable binary until a separately authorized release. Record any
production change against [T6 #60](https://github.com/lirtual/cloudflare-actions/issues/60).


> **Latest phase acceptance — 2026-11-01 (Spec #21 remains Open; Spec #35 Closed).**
> One production `cloudflare-actions` Worker provides the unified static Action catalog;
> Workflow Consumer uses the single `ACTIONS -> cloudflare-actions#ActionsEntrypoint`
> binding. The latest independently recorded live Provider Version is
> `39c5c470-040b-4ae7-b81a-6c47d04f548f` (six Actions).
> All six business Workflows (`ubuntu`, `windows`, `code-server`,
> `download`, `openlist` and `chrome`) are **Active**, but Active does not
> establish actual Session success. Chrome Draft revision **16** was validated,
> published and resumed with `lirtual/github-actions`; its effective
> Published Version `3f53c44e-8496-49f1-ae0b-fb3a483f18b8` still pins
> **old `v0.1.43-rc.2`**. The one real Chrome Session on that tag
> [failed before Ready](https://github.com/lirtual/github-actions/actions/runs/41293120816)
> due to an early-exit SIGPIPE (141) in the protected Tunnel help check;
> it terminated and released its Session slot.
> [PR #79](https://github.com/lirtual/github-actions/pull/79) fixed the
> check with successful PR/main CI. New **`v0.1.43-rc.3`** is verified
> in the Action Catalog and its replacement Chrome definition passes
> read-only validation, but **production Pause/re-Publish was blocked by
> platform safety checks** and was not retried or routed around.
> **Do not start another Chrome Session on the old published tag** or claim
> new-tag E2E success. See Spec #21 for the live write/acceptance gate.
>
> The former physical `weixin-mcp-worker` and `bark-provider` scripts
> were absent from the latest Cloudflare inventory (404); their GitHub release
> workflows are now **disabled_manually**. The unified release workflow and CI
> remain enabled. Do not use legacy Worker/domain rollback or publisher paths.
> Same-Worker exact-Version rollback has source/CI evidence only:
> **production rollback E2E is Not performed**, and retained Provider Version
> #4 lacks Litterbox. A maintenance window, degradation decision and explicit
> Owner production authorization are required before any real rollback.
>
> Existing Weixin handset and Bark iPhone notification E2E passed during
> cutover. Updated `download` and `openlist` immutable Published Plans
> were separately republished and independently read back with current grants;
> a **new real send under those Plans is Not performed**.
> No duplicate notification, deployment or rollback is required solely to
> complete this documentation phase. Spec #35 Dub/EnvShare/Litterbox scoped
> acceptance is complete. See
> [current Spec #21 evidence](https://github.com/lirtual/cloudflare-actions/issues/21),
> [cutover and rollback runbook](docs/spec-21-cutover.md), and
> [Spec #35 closure](https://github.com/lirtual/cloudflare-actions/issues/35).
>
> **Historical sections below** retain earlier physical-provider release
> instructions for audit. They are **not current runnable production procedures**;
> consult the guarded unified release and current issue/runbook before any change.

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
- No public generic RPC or text sending endpoint is provided. Private
  `sendGenericText` accepts only bounded Owner-directed text under the v2
  Workflow grant and immutable deployment pin. Legacy public compatibility
  URLs must not be reinstated.

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

### Litterbox safe rejection diagnostics

The private `litterbox.upload_file` Action keeps its immutable published
manifest, output status (`accepted` / `rejected` / `unknown`), and one-shot
dispatch semantics. Only for a definitive rejection, Worker observability
logs the event `litterbox_upload_rejected` with a fixed category:
`invalid_invocation`, `invalid_file`, `contract_mismatch`, or
`upstream_http_4xx`. The last category records the numeric 400–499 HTTP
status, but never the response body. A syntactically valid per-invocation UUID
is logged to correlate with the existing D1 admission receipt. No file bytes,
name, hash, token, signed URL, user metadata, or upstream body is logged.
Timeouts, redirects and uncertain responses remain `unknown` and must never
be automatically retried. This is diagnostic source code only until the
separately authorized protected Provider release; deploying a new Provider
version would change its deployment ID and requires reviewing the pinned
Workflow Consumer and Published Plan compatibility before release.
