# Spec #21 — Weixin/Bark to one Cloudflare Actions Worker

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
