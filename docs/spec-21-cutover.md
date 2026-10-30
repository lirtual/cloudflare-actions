# Spec #21 — Weixin/Bark to one Cloudflare Actions Worker

Implementation target: `cloudflare-actions`, entrypoint `ActionsEntrypoint`.
Static private catalog: `weixin.send_text`, `weixin.notify_download`,
`bark.send_notification`. The owner
HTTPS handler remains the existing Access-protected Weixin Owner handler.
`ACTIONS` is the sole new Workflow Service Binding; the Workflow owns Publish,
immutable grants, durable reservation, cancellation and all retries/Unknown rules.

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
