## Current 2026-11-01 rollback compatibility gate (source-only; production NOT exercised)

This section supersedes the older assumption that the physical `weixin-mcp-worker`
can receive an Owner-domain rollback. Independent Cloudflare inventory returned
404 for both former `weixin-mcp-worker` and `bark-provider`; the Owner domain
belongs to `cloudflare-actions`. Do not invoke the old Owner-domain rollback
or legacy publisher jobs against non-existent Worker targets.

The existing protected `release-actions.yml` supports an exact retained
unified Worker Version rollback. **Retained does not imply compatible.** The
current `mcp-workers` Consumer publisher (`reviewed-actions-provider-pin.mjs`)
always reads the **currently deployed** Provider and pins that exact Version.
It **cannot stage a historical target pin before the Provider rollback**.
The preceding source gate requiring this pre-staging was therefore impossible
to satisfy legitimately. This update fixes that dependency without adding a
publisher, alternate Cloudflare write, or a way to bypass the frozen gate.

**Required reviewed maintenance sequence (not performed):**

1. Separately confirm production-maintenance authorization, exact current
   and historical target Versions, full historical Action contract/Plan
   compatibility, receipt baseline and protected rollback availability.
2. Stop new business admission; **pause all** business Workflows, drain
   durable and native instances, freeze the existing D1 Action gate, and
   independently verify these conditions.
3. The existing protected unified Provider rollback requires exactly one
   Consumer `ACTIONS_DEPLOYMENT_ID` binding pinned to the **current** Provider
   before rollback. Missing, duplicate or unexpected pins fail closed.
   Roll back to the specifically approved Version using the existing
   `release-actions.yml` maintenance job only.
4. The Provider rollback postflight confirms the reviewed target Provider
   active and the **old** Consumer pin unchanged, together with the frozen
   gate, paused plans, zero unsettled/native instances, domain, Secrets and
   original receipts. The mismatch is deliberate **only under freeze**:
   **do not resume or dispatch** in this state.
5. Run the existing protected `lirtual/mcp-workers` Consumer release with
   `actions_old_ingress_quiesced=false` **while the gate remains frozen**.
   That publisher stages the now-active rollback target as its automatic
   Provider pin and reads it back; it must not run first-cutover thaw actions.
   Independently verify the exact Consumer pin, sole `ACTIONS` binding,
   paused Workflows and continued frozen D1 gate after the release.
6. Revalidate and re-Publish only **paused** business Plans whose source,
   contract, data and rollback target Version are independently compatible.
   Historical Plans and Unknown invocations are immutable and must not be
   replayed. Keep every business Workflow paused and the D1 gate frozen.
7. The **existing** `lirtual/mcp-workers` protected Consumer release can
   conditionally reopen the gate using the already implemented
   `actions_old_ingress_quiesced=true` activation path; this is a **second
   reviewed Consumer release** after the frozen target repin in step 5, not a
   separate D1 utility or alternate deployment pipeline. That release checks
   the current Provider and Consumer pin, exact sole `ACTIONS` binding,
   frozen D1 migration 0018, zero active business Workflows and unsettled Runs,
   and all six empty native nonterminal instance inventories **before**
   `frozen -> open`; the existing postflight independently checks `open`
   and continued pause. The existing `actions-cutover-prepare.test.mjs`
   covers the unified-binding refreeze and activation checks. **However, this
   flag is named and documented for first cutover, not previously exercised as
   a recovery thaw**: production use requires explicit Owner approval of
   this exact reuse and review of current main/required GitHub Environment.
   Do not assume that source tests alone qualify it for live maintenance.
8. Once the gate and binding/Plan readbacks are independently confirmed,
   selectively Resume only supported Workflows and verify actual readiness.
   Any unavailable earlier Action is explicitly disabled, never silently
   treated as supported.

This is not an automated rollback/recovery Saga. If an intermediate operation
fails, **leave the gate frozen and business Workflows paused**, preserve the
original D1/receipts/Secrets and reconcile the observed physical Versions
before any further action. Never blindly rerun an uncertain rollback, repin,
or notification. A physical rollback does not revert D1 migrations or recover
deleted legacy Workers or previous encrypted pairing.

### Scope of the retained Version #4 fallback

Version #4 `adf7d9d1-5bc1-424a-b74c-7c7dff699fd4` is an **available
historical binary**, not a full-catalog compatible recovery. The corresponding
GitHub release source `1b4fd46b6588777a48cc6ffef612df6b371beed6`
includes `weixin.send_text`, `weixin.notify_download`,
`bark.send_notification`, `dub.shorten_url`, and `envshare.share_text`.
Version #5 source `06e452f506d1f815376beb93af800bd3b101b442`
adds `litterbox.upload_file`. The prior and current source references have
**identical** `apps/weixin-mcp-worker/src/provider.ts` and
`apps/bark-provider/src/notification.ts` blob SHAs, plus identical
`apps/actions-worker/wrangler.jsonc` blob SHAs. Cloudflare versions GET
confirmed both retained physical Version IDs and similarly named Secret,
D1 and Version Metadata bindings. This establishes a **bounded candidate**
for historical five-Action recovery, but is not a full compiled-artifact
provenance attestation or runtime contract/receipt E2E.

A rollback to #4 would make Spec #35 Litterbox upload unavailable. No
plan accepting or requiring that Action may be resumed under this target.
Do not select #4 as an uninterrupted full-service rollback without an
explicit reviewed feature-loss decision. Since a real rollback also pauses
five active business Workflows and touches two production Workers, the
operator must separately authorize the maintenance window and acknowledge
the controlled degraded-catalog interval or decline the exercise.

An ordinary unified Provider **upgrade** remains unchanged by the
rollback-only preflight check and still requires coordinated Consumer and
business Plan re-Publish. A successful Provider upgrade by itself is not
service acceptance.

The user-authorized 2026-11-01 re-Publishing of `download` and `openlist`
against the current Provider was verified at Publish/MCP readback level,
not by a new physical notification E2E. The Chrome platform-denied Draft
write remains independently blocked. No production rollback, Worker release,
domain/D1 mutation, Session or notification was performed by this change.

Evidence: [Issue #21](https://github.com/lirtual/cloudflare-actions/issues/21),
[legacy fallback inventory](https://github.com/lirtual/cloudflare-actions/issues/21#issuecomment-6554843991),
[notification grant production repair](https://github.com/lirtual/cloudflare-actions/issues/21#issuecomment-6554905935).

# Spec #21 — Weixin/Bark to one Cloudflare Actions Worker

> **Current acceptance status (2026-10-31; supersedes the historical
> staging/NO-GO paragraphs below):** unified Provider deployed at
> `f663dc66-33fd-4292-ba95-49ac12e26b36` (100%); Workflow Consumer
> deployed at `2ecdc4b1-ad02-4bfa-95b2-be242b704170` (100%), with sole
> `ACTIONS` Service Binding; Owner hostname transferred and QR/proof binding
> verified (`ready`, generation 5). Original Weixin D1 retains 19 immutable
> receipts. The D1 admission gate is `open` and there are no unsettled
> durable Runs at the last verification. One-shot Weixin handset delivery and
> one-shot Bark AES-256-GCM readable iPhone notification **both passed**.
> **No new production changes or sends are authorized by this document.**
>
> **Remaining before Spec #21 completion (updated 2026-10-31):** the
> production Drafts, exact-action grants and Published Plans for `ubuntu`,
> `code-server`, `windows`, `download`, and `openlist` have been verified
> and resumed (5/6). The latest reviewed GitHub Action tag is
> `v0.1.42-rc.9` at `4ef3057f26b9b5126b6fba9d2ed652b040ef6506`;
> `download` uses `weixin.notify_download`, and `openlist` uses
> unified `weixin.send_text` v3. `chrome` remains paused at its old
> Published Version because the platform blocked its production update.
> The Bark and Weixin one-shot test Workflows remain paused; no new Run or
> Session was dispatched for the migration. See the latest Issue #21
> verification note for exact Plan digests. Old Workers/publishers still
> exist and require independent retirement approval.
> See Issue #21's latest evidence comment for all six candidate Plan digests.
>
> The numbered initial cutover steps, preflight snapshots, source-only
> release descriptions and NO-GO records below are retained as **historical
> audit evidence**, not claims about the current live deployment.

Implementation target: `cloudflare-actions`, entrypoint `ActionsEntrypoint`.
Static private catalog: `weixin.send_text`, `weixin.notify_download`,
`bark.send_notification`. The owner
HTTPS handler remains the existing Access-protected Weixin Owner handler.
`ACTIONS` is the sole new Workflow Service Binding; the Workflow owns Publish,
immutable grants, durable reservation, cancellation and all retries/Unknown rules.

## Spec #577 compatibility (current source, not deployed)

The reviewed `weixin.send_text` identifier now has **two immutable historical**
contracts and **one current** text-first contract: v1 Session Ready and v2
Owner-only literal text remain pinned to `weixin-mcp-worker` when recorded in
old Published Plans; new v3 Owner-only text (with optional verified Session
URL) is pinned to `cloudflare-actions#ActionsEntrypoint`. The unified catalog
still exposes exactly **three Action IDs**. A v3 digest selects v3 send-once;
any v1/v2 historical invocation can only reuse its original Plan grant and
read D1 receipt history after cutover, never infer a new dispatch right.
The Workflow compiler accepts v3 for new Drafts and retains v2 only for
immutable existing Plans. Old v2 Provider methods remain unchanged for
pre-cutover compatibility. The two source repos must calculate identical v3
Contract Digests before publication; no shared mutable registry is added.

## Evidence gathered locally

- The new Worker bundles under Wrangler dry-run; runtime Service Binding test
  returns all three contracts and a historical Weixin receipt without sending.
- The compiled manifests on both sides match byte-for-byte SHA-256 digests.
- Workflow tests cover one-effect reservation, cancellation, ambiguous ACK,
  migration freeze before reservation, and historical read after version change.
- No live Cloudflare state, GitHub release, customer message or secret was changed.

## Protected cutover (NOT PERFORMED)

1. Freeze ingress and inventory every old **physical Workflow instance** and
   pending/unknown Action before changing deployment identities. D1 aggregate
   Run counts alone do **not** prove old instances are drained: older deployed
   code does not know the new freeze table. Unknown effects must never retry.
2. Keep the original Weixin D1, historical receipts and Owner Access domain.
   Owner's 2026-10-30 decision permits a NEW 256-bit AES-GCM Weixin key
   instead of transferring the unavailable original secret. The old
   ciphertext MUST NOT be treated as decryptable by the new key.
3. After old native Workflow instances are proven unable to dispatch, apply
   migration 0018 and freeze its atomic D1 gate. Reconcile preexisting
   reserved/Unknown invocations; NEVER send those again. D1 alone cannot
   stop old native code that does not implement the gate.
4. After all old Weixin send/poll leases complete, use the original Worker's
   Access OTP + CSRF-protected /setup/unbind flow with explicit Owner
   authorization. It must increment generation, clear encrypted session
   and pending pairing, and preserve receipt rows. Busy/uncertain = No-Go.
5. Read the original D1 again: binding must be unbound, its ciphertext/key
   and lease fields NULL, pairing absent or expired without ciphertext, and
   receipt count not below the pre-unbind baseline. The pure read-only
   verifyOwnerRebindCutoverSnapshot guard models this release prerequisite.
6. Provision a NEW Weixin key and the required Bark keys in the new Worker
   only via an authorized protected release, with no key values in code,
   logs or chat. Stage without prematurely changing the Owner domain.
7. Verify one active reviewed Worker Version and all three Contracts; publish the
   consumer's exact ACTIONS binding/version via its protected workflow.
   Transfer the Owner domain with a reviewed reverse path. Owner repeats
   Weixin QR/proof verification to create a NEW encrypted binding.
8. Republish only reviewed new Plans. Thaw after physical drain, historical
   continuity, rebind, Version/Binding and all release gates are proven.
   Actual Weixin/Bark notifications require separate send authorization.
9. On failure, keep new sends frozen and preserve original Unknown/receipts.
   Rolling back the Worker does NOT restore the erased encrypted binding:
   Owner QR re-pair may be required. Never roll back D1 generation.


## First unified Worker publisher (source only; NOT RUN)

The candidate `.github/workflows/release-actions.yml` is the **single intended**
main-only, Owner-only GitHub Actions publisher for the new physical
Worker. It deliberately uses **no GitHub Environment** because the single
Owner opted out of the extra reviewer gate on 2026-10-31. Only an explicit
`workflow_dispatch` on current `main`, from `lirtual`, with affirmative
production and quiescence inputs can start it; the existing fail-closed
read-only preflight, CI and production concurrency lock remain mandatory.
The checked repository Actions Secrets must contain
`CLOUDFLARE_API_TOKEN` and the 32-character ASCII `BARK_ENCRYPTION_KEY`.
The Owner-selected `BARK_DEVICE_KEY` is a repository Actions **Variable**,
not a Secret; although usable as a routing identifier, its visible value
can allow unwanted device-targeted push requests. Restrict repository
configuration access and never print this value in job logs. The **fresh** `WEIXIN_ENCRYPTION_KEY` is created
using the Node cryptographic RNG inside the one-time protected release
Runner and written exclusively to its mode-0600 temporary secrets file
before uploading as a Cloudflare Worker Secret; its value is never logged
or stored as a GitHub Secret. First-cutover preflight rejects an existing
unified Worker, so a retry cannot silently rotate a deployed key. Future
compatible releases must preserve the Worker Secret, never generate a new
key. `CLOUDFLARE_ACCOUNT_ID` stays a repository Actions Variable. The
existing `bark-provider` Environment-scoped secrets are **not** inherited
by this release. No key is generated or deployed merely by merging code.
Populate the Bark encryption repository Secret and Bark device repository
Variable before manually dispatching; the Weixin key is generated inside
that first release.
This trades independent Environment approval for a simpler sole-maintainer
workflow, not for weaker operational cutover prerequisites.

The first-cutover publisher is **fail-closed**: requires explicit deployment
approval and independently verified old ingress quiescence; reads exact legacy
consumer Bindings, a frozen Workflow D1 `0018` gate, all six native nonterminal
Workflow statuses, and sanitized original Weixin D1 unbind and preserved receipt
counts. It rejects an already deployed unified Worker, preventing accidental
second version promotion. Staged keys are checked for format, confined to
Runner temporary files, and never logged. Initial publish contains **no** Owner
custom-domain route; exact deployed Version and required Secret names are read
back. No migration, D1 freeze, Owner unbind, QR re-pair, domain reassignment,
notification send, automatic rollback or deletion is performed by this job.

The Workflow D1 gate must be created/frozen under the existing protected
Workflow release process **after** old physical instances are proved drained,
not by using arbitrary SQL from this publisher. An attestation or a point-in-time
empty inventory alone cannot prove old admission is stopped. The existing
Cloudflare API token must also have the read permissions required for the
preflight D1/Workflows inventory; missing scope is **No-Go**, not permission to
bypass verification. This first-release job intentionally does not implement
later compatible Provider upgrades or domain transfer/rollback; those require
separately reviewed source and authorization.

## Protected Owner domain transfer and rollback (not yet dispatched)

The existing `Release Unified Cloudflare Actions` manual GitHub workflow also
supports `domain_operation=transfer|rollback`, with
`deploy_to_production=false`, explicit `owner_domain_approved=true`, exact
active Provider Version ID and frozen Workflow D1 gate. It does not create a
second deployment flow or deploy any Worker. The route is the existing single
Cloudflare Worker Custom Domain `weixin.lirtual.dpdns.org` in the reviewed
zone. Both the old and new source Services are explicitly allowlisted, and
`transfer` requires the original Owner state to be unbound with preserved
receipts. Native Workflow instance drain, paused published Workflows, terminal
Runs, 0018 frozen state and the unified Provider's one active Secret-backed
Version are mandatory for either direction. The operation verifies exact
source-route identity immediately before issuing a single Cloudflare PUT and
reads back the exact target route afterward. An unknown result must be
investigated using read-only inventory, **never blindly retried**. The old
encrypted Session does not revive on rollback: Owner QR re-pair may still be
necessary. Domain routing alone does not start or resume a Workflow, change
D1 admission or send an Action.

## Owner-approved existing Custom Domain move (2026-10-31)

Cloudflare `PUT /workers/domains` returned HTTP 409 code 100116 while the
hostname was attached to the original Worker; it cannot be treated as an
atomic domain move. The Owner separately approved a short maintenance
interruption and a reviewed **detach + attach** through the existing
Owner-only GitHub Actions handoff job (never direct Cloudflare CLI/API).

The job retains the frozen D1 gate, six paused Plans, all six native instance
status checks, exact single Provider Version, unbound old Owner and the
historical receipt baseline. It independently verifies the exact source
Custom Domain ID immediately before one DELETE, confirms the hostname
is vacant before one target PUT, and independently verifies the new route.
If the DELETE response is ambiguous (including an empty body) but independent
readback confirms the hostname is vacant twice, continue to the one approved
target attach without repeating DELETE or restoring the source prematurely.
If the hostname still appears attached or its state is unclear, stop with no
further write. If target attach fails or its response is ambiguous, it only attempts a
single restore of the source after *proving the hostname vacant*; if the
target is already verified, no retry occurs. Unknown or conflicting
routing state is never overwritten. Even a verified source restoration
cannot recreate the old Weixin session. Failed restoration requires manual
recovery, not a second automatic mutation.

Detach may interrupt DNS, TLS and Access-protected Owner traffic. Route
readback is necessary, not sufficient for HTTPS / Access / QR acceptance;
scan and owner proof must be performed after routing is confirmed, and
the six Workflows stay paused until genuine end-to-end acceptance.

## Current release decision

**NO-GO for production** until trusted fresh-key provisioning and Owner
re-pair, old native-instance drain, D1 freeze, and protected release/rollback
are separately approved and verified. A new Worker dry-run is not production acceptance. The temporary old
Worker receipt fallback in Workflow is read-only; it cannot initiate a send.


## Production inventory — read-only observation, 2026-10-30 UTC

These are **observations, not migration authorization or lasting guarantees**.
Cloudflare GET and D1 `SELECT` only; no Worker, D1, Secret, domain or
Workflow resource was modified. Recheck immediately before any actual cutover.

- No deployed physical `cloudflare-actions` Worker exists. Production
  `workflow-mcp-worker` still binds `WEIXIN_ACTION_PROVIDER` and
  `BARK_ACTION_PROVIDER` separately, with their original version pins.
- `weixin.lirtual.dpdns.org` remains enabled and routed to
  `weixin-mcp-worker`; that Worker binds the original Weixin D1
  `051c3b6d-e3bc-4d69-907f-37e8ab00618f` and names the original
  `WEIXIN_ENCRYPTION_KEY` Secret. Existing `bark-provider` has its two
  separate Bark Secret bindings. Presence proves **inventory only**, not
  access to the unchanged Secret values.
- Workflow D1 has **6 nonterminal Runs**, **0 nonterminated Sessions** and
  **15 historical Action Invocation rows**. Migration `0018` is **not**
  applied and the `cloudflare_action_gate` table **does not** exist.
  Existing code therefore has no durable cutover fence to enforce.
- The native `workflow-mcp-orchestrator` has **1 running instance**; its
  observed version was `38f2d893-d87e-42b5-8ef2-e0dfd2d9b75e`. This is
  not proof of drain even though no physical Session was active. Do not
  cancel or interrupt it solely for this migration.
- GitHub `bark-provider` Environment exposes metadata for both Bark Secret
  names. No original Weixin encryption key was found in the visible Secret
  inventories of the existing Weixin release Environments or repository.
  This does not prove the Owner has no authorized external backup. No
  plaintext key was retrieved, requested or disclosed.

**Decision: NO-GO.** The new unified Publisher is not implemented via an
approved path, fresh-key provisioning and Owner re-pair have not been executed, the cutover fence is absent. None of these conditions can be waived merely
because local CI/workerd tests pass.

## Owner amendment (2026-10-30): fresh key is allowed

The requirement to migrate the original WEIXIN_ENCRYPTION_KEY and preserve
its encrypted owner session is superseded. Original D1, historical receipt
rows, immutable Workflow invocation/grant history and Unknown results remain
mandatory. Fresh key means an explicitly authorized old-Worker local unbind
and a new Owner QR/OTP proof. Rollback can require a second re-pair.
No production key/unbind/send/deploy action is authorized by this amendment.

**Staging safety refinement (2026-10-30):** initial unified Worker
`wrangler.jsonc` intentionally contains no production Owner custom-domain
route. The source guard rejects premature route binding. Existing Owner
Access setup stays on the original Worker until a separately authorized
reverse-tested domain cutover; no initial staging deploy may claim it.
The Workflow consumer release gate also reads native instance statuses and
rejects any nonterminal instance. This inventory snapshot cannot prevent
newly created old-code instances, so pausing old admissions remains a
separate prerequisite.

**Review amendment (2026-10-30):** Workflow main already contains the
HTTP Action migration 0017_http_connection_auth.sql and the approved
Weixin download-notification Action. The unified cutover therefore uses
0018_cloudflare_action_migration_fence.sql and carries all three reviewed
Action IDs forward without changing HTTP permissions. A later read-only
Cloudflare snapshot showed zero nonterminal native Workflow instances, but
this cannot prevent a new old-version admission. No production cutover
was performed.

## Subsequent protected Provider maintenance (deployed release contract)

The existing `lirtual/cloudflare-actions/.github/workflows/release-actions.yml`
is the sole production Provider publisher. The `protected-maintenance` job
is already installed; it requires a **new, explicit Owner production approval**,
the exact reviewed Provider version and historical Weixin receipt count, and
`maintenance_quiesced=true`. Push/PR/CI never trigger this path. Do not
reuse the first-deployment branch for subsequent maintenance.

### Coordinated diagnostic upgrade — no production approval implied

Read-only investigation of the Litterbox failure recorded by
[lirtual/mcp-workers PR #678](https://github.com/lirtual/mcp-workers/pull/678)
and the bounded rejection logging fix
[cloudflare-actions PR #51](https://github.com/lirtual/cloudflare-actions/pull/51)
identified **no necessary Worker code or Action contract changes**.
Deploying PR #51 alone would rotate the Provider's Version ID while the
Consumer and previously Published Plans still pin the old ID.

Use the following existing guarded stages **only after separate authorization
for temporary business interruption, production D1 gate changes, both Worker
releases, Plan re-publication and a new synthetic-file upload**:

1. Independently read Provider + Consumer active Version IDs, exact Consumer
   `ACTIONS_DEPLOYMENT_ID`, six business admission states, durable Run count,
   six Cloudflare native nonterminal-status inventories, and original Weixin
   receipt count. Treat counts and version IDs as **fresh run-time values**, not
   historical constants. Record which Published Plans actually have grants
   pinned to the outgoing Provider. Preserve paused test Plans as paused.
2. Pause **all** Active Workflows through the existing Workflow API; verify
   no new admissions, no unfinished durable Runs and no nonterminal native
   instances. This is a real, short business interruption. The maintenance
   gate deliberately rejects even unrelated Active Workflows.
3. Reuse the existing **mcp-workers Release Worker** preparation-only path:
   `worker=workflow-mcp-worker`, `actions_migration_prepare=true`,
   `actions_old_ingress_quiesced=true`, `deploy_to_production=false`.
   Despite its first-cutover name, the current
   `scripts/actions-cutover-prepare.mjs` explicitly verifies the already
   unified `ACTIONS` Binding and allows a guarded re-freeze of the
   existing 0018 D1 gate after drain. The release workflow is the only
   authorized D1 write; do not hand-run the SQL or create another launcher.
4. Use the **cloudflare-actions Release Unified Cloudflare Actions**
   `protected-maintenance` job with `maintenance_operation=upgrade`,
   `maintenance_approved=true`, `maintenance_quiesced=true`,
   `expected_provider_version` equal to the verified outgoing Version ID,
   `expected_receipts` equal to the just-read original count, and
   `deploy_to_production=false`. Leave domain/rollback/first-cutover
   options disabled. The existing release uses `wrangler deploy --keep-vars`,
   preserves Secrets, D1 and domain, and independently checks the new Version.
5. With all Plans **still paused** and the D1 gate frozen, run the ordinary
   **mcp-workers Release Worker** with `worker=workflow-mcp-worker`,
   `deploy_to_production=true` and
   `actions_old_ingress_quiesced=true`. The protected Consumer release
   stages the *live* Provider Version ID as its sole Service Binding pin,
   independently verifies binding/version, and its guarded activation step
   reopens the D1 gate **only while every Plan remains paused and drained**.
   Do not leave the version mismatch live on an open admission path.
6. Revalidate/re-Publish **only** the affected unchanged Drafts with new
   exact Cloudflare grants. Same Draft + new Provider Version makes a new
   immutable Published Version; GitHub Task/Session Plans also require their
   existing exact pinned Action grants and heavy-execution approval. Do not
   rewrite unrelated Plans or historical receipts. Verify all affected grants
   match the Consumer's new pin **before** resuming any business Workflow.
7. Resume only the previously Active business Workflows and verify the
   original active set and current Provider binding. The synthetic Litterbox
   test Plan remains paused except for its one separately approved file
   admission. For that admission, use a *new* idempotency key, the explicitly
   selected non-sensitive TXT and `time=1h`; reconcile the Run/Provider
   result and immediately re-pause the test Plan. Do not replay failed or
   unknown uploads. A Provider rejection alone is **not** proof of a
   successful Litterbox E2E.

If any protected step fails or is indeterminate, halt, inspect actual
versions/receipts, and retain paused admission. The Provider's exact-version
`rollback` is a separate authorized maintenance operation, **not** an
automatic response; old grants cannot be used against a different Provider
version. Do not thaw or resume merely because a GitHub Job succeeded.
Historical Run `2f34211c-72f5-4875-a249-207d605befd6` remains failed;
safe diagnostics added by PR #51 cannot recover its original HTTP status.
