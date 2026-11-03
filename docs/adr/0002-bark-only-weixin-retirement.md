# ADR-0002: Bark-only notifications and irreversible Weixin retirement

**Status: final agreed design (Grill With Docs rounds 1–3, 2026-11-02); implementation stages must be assessed separately.** T1/T2 Consumer source was merged in `mcp-workers` PR #686. Per the **last independently recorded T7 production acceptance** ([#61](https://github.com/lirtual/cloudflare-actions/issues/61#issuecomment-6580948056), 2026-11-02), safe Bark-only Provider #7 and its pinned Workflow Consumer were both at 100% traffic, Action Gate was `open`, six original business Workflows were Active and eight unrelated Workflows remained Paused. Legacy Provider Versions #1–#4 were retired; **#5/#6 still exist** and the attempted #5 retirement was blocked, then cancelled. This is an evidence timestamp, **not** a new live production query, not proof of handset E2E or irreversibility. The separately required Bark physical E2E, residual legacy send-authority retirement (T7), target-by-target live purge (T8) and recovery-window expiry (T9) retain their own acceptance gates; **no T8/T9 destructive purge was performed by this documentation update**.

### T3 / T7 status reconciliation — 2026-11-03 (dated evidence only)

T7's old `weixin.lirtual.dpdns.org` Worker Custom Domain is independently
**absent** from the exact-hostname Cloudflare inventory after one authorized
detachment request; the request response was not accepted as success, but
[later read-only evidence](https://github.com/lirtual/cloudflare-actions/issues/61#issuecomment-6595999508)
confirmed resource absence and unchanged safe Provider #7, sole Consumer
version and pinned `ACTIONS` binding. No separate DNS/certificate or HTTP
propagation test was run. Historical Weixin-capable #5/#6 Worker Versions are
**not retired**: the real protected `retire-version` dispatch was
platform-blocked, and the inherited `WEIXIN_ENCRYPTION_KEY` Secret is not
revoked. No T3 classification or T8/T9 purge is authorized by domain removal.

T3's last separately authorized, bounded production Draft structural snapshot
found **46 physical** Workflow rows (14 visible, 32 soft-deleted):
**4** definitive retired Weixin Action Drafts (1 visible, 3 soft-deleted),
**20** narrow JSON structural nonmatches and **22 indeterminate** (8 visible,
14 soft-deleted). These are *not* present-day exact-seven identities or a
purge manifest. The existing [synthetic regression in mcp-workers main](https://github.com/lirtual/mcp-workers/blob/main/apps/workflow-mcp-worker/tests/spec54-t3-draft-inventory.test.ts)
reuses strict YAML parsing in Node, conservatively flags historical nested
or malformed Draft shapes, and passed its prior full suite; that parser
capability was **not established** in the Cloudflare execution environment.
Do not replay the previous one-time Draft read, reclassify the 22 unknowns
with JSON-only parsing, or infer that the 20 nonmatches are semantically safe.

The other T3 hard gaps remain unchanged: semantic sensitivity of 16 immutable
Plan texts (including three shape-ambiguous literals), Run links for four
Weixin-only Plan Versions (previous query security-blocked), possible
sensitive contents in `runs.inputs`, `runs.result`,
`run_steps.output` and `workflows.draft`, controlled/manual backups,
and current dependencies of receipt/reservation readers. The 19
Weixin-attributed shared invocation reservations remain **conditional
candidates only**, because deleting them can change cancellation/no-replay
semantics. Preserve all original immutable Plan/Run/Step state and historic
unknown/indeterminate outcomes. A concrete Q2=B/Q8=A conflict is neither
proved nor ruled out; do not invent a user decision or remove immutable
content without separately authorized evidence. **T3 remains Partial/Open**,
T7 remains Blocked, and T8/T9 deletion/irreversibility are Not performed.

This section reconciles previously recorded source and redacted
observations; **no new production data/Secret/backup read or change**.

Owner chose the existing encrypted `bark.send_notification` as the sole notification Action for existing notification-bearing business Workflows. Replace Weixin notifications in `openlist` and `download`; `chrome` already uses Bark. Do not add notifications to `windows`, `ubuntu` or `code-server`, add a fallback channel, a new Worker, or another orchestrator. Preserve the current strict notification failure semantics and at-most-once dispatch: rejection fails the notification Step and parent Run; ambiguous outcomes never trigger an automatic resend.

Unlike ADR-0001's **2026-10-30 cutover-specific** retention decision, the Owner explicitly chose **eventual permanent destruction of Weixin historical D1 receipts and Weixin audit data** as well as removal of both Weixin Action IDs, handlers, pairing/management functionality, obsolete secrets, bindings and publishers. The earlier retention was required to safely *migrate into* the unified Worker; this ADR governs a different, irreversible *retirement out of* Weixin. It does **not** authorize a current write, deletion, credential access, production release, audit modification or Run replay.

The trade-off is intentional: no unreliable Weixin delivery or dormant credential/management surface survives retirement, but past Weixin delivery disputes and recovery via original receipts become impossible. Existing immutable Published Plans/Run identities, in-flight/unknown executions, Worker/D1 schemas, provider pins, release guards and backups introduce safety and deletion-scope questions. **No deletion is allowed until the Q8–Q10 design rules are implemented and proven, all active Plans have migrated and independently passed E2E, old execution admission is disabled and drained, target data and every dependent system are inventoried, and fresh, explicit destructive-production authorization is obtained.** If any deletion cannot be verified safe, stop at the non-destructive retirement gate rather than silently redefine Q2=B as evidence retention.

Only the existing reviewed `cloudflare-actions` Provider, `mcp-workers` Workflow Consumer, protected GitHub Actions releases and their rollback/maintenance gates may carry this through. This ADR supersedes **only** the historical-preservation *final outcome* in ADR-0001, not the single-Worker boundary or the safety requirements that applied to the earlier cutover.

## Round 2 accepted — 2026-11-02 (Q4=A, Q5=A, Q6=A, Q7=A)

**OpenList:** extend the already proven Chrome → Bark trusted Session path with an *explicit, pinned* OpenList source allowlist. Share validation of same-Run signed Ready, reviewed immutable GitHub Action identity/ref, claimed physical Attempt, live-run inspection, root-only HTTPS URL and atomic D1 admission. Do not introduce an OpenList-specific send pipeline, arbitrary URL or extra Provider.

**Download:** reuse the existing signed OIDC Claim, reviewed single-item GitHub Task identity, independently reconciled native terminal success and remote SHA-256 readback guarantee before Bark dispatch. Move the trust check into the existing consumer proof/fence so a plain success-shaped Bark body cannot authorize a send. Failure and unknown outcomes remain strict and no-retry.

**Deletion target:** permanently remove Weixin-*exclusive* D1 receipt/binding/pairing and audit content, along with reviewed Weixin-only copies and credentials, **only after** every relevant dependency and retention limit is reconciled. Preserve unrelated shared Workflow, Bark and utility data. A table or Worker binding shared by other Actions is never an all-or-nothing deletion target merely because it contains Weixin records. Do not claim physically purged backup copies without separate provider evidence. Q8=A resolves mixed-use history: preserve immutable historical Plan/Run IDs, original non-sensitive Action IDs, terminal statuses and cross-Action provenance **only as inert read-only history**. Do not retain Weixin-exclusive receipt/binding/pairing/send/audit payloads merely to support old sends. A historical Plan is evidence, never authorization to execute or re-Publish an obsolete Weixin Action. Historical `unknown` or `indeterminate` must remain visibly unresolved, not rewritten to success/failure or reinterpreted as permission to resend. Provider-owned D1 Time Travel and deleted-database recovery windows must also expire (or be independently proven removed) before claiming full irreversible purge; source: https://developers.cloudflare.com/d1/platform/limits/ and https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/undelete/ .

**Order:** add verified Bark parity → safely migrate each active Workflow with its original heavy/cloudflare grants → independently verify phone/link and true Download completion → freeze/fence all *old* Weixin-capable new execution and drain/adjudicate every in-flight/unknown attempt → remove executable catalog, source, Owner page and secret/binding/release surfaces through existing protected pipelines → verify no compatible old-version rollback can reenable sends → only then seek specific fresh irreversible production deletion authorization and purge reviewed data. No earlier phase permits deleting history. The single physical `cloudflare-actions` Worker and shared `ACTIONS` Service Binding stay in place.

**Conflict resolution:** ADR-0001 protects receipts during migration; ADR-0002 deliberately changes the final Weixin-only data retention decision but does not retroactively remove the old safety fence or make historical unknown results safely retryable. The recorded immutable facts and shared catalog recovery consequences must be resolved before the purge, not silently rewritten or discarded.

## Final design — 2026-11-02 (Q8=A, Q9=A, Q10=A)

**Q8=A — preserve inert shared history, purge Weixin-only evidence:** historical immutable `workflow_versions.plan`, `runs`, shared `run_steps` and their non-sensitive original Action IDs/Run identities remain queryable for other business provenance. Do not modify their immutable contents or erase unrelated business data. Before deleting Weixin-specific rows from the shared `cloudflare_action_invocations`, verify join-based ownership and all dependent readers; retain terminal `indeterminate` status and sanitized non-sensitive history without recreating the deleted receipt as a new send entitlement. Do not create a parallel tombstone table unless proven necessary by implementation tests: an explicit **static action-denial path**, already-terminal Run state and protected no-rollback release gates should suffice after all old execution paths are drained.

**Q9=A — permanent no-Weixin rollback:** neither the unified Provider nor Workflow Consumer may be deployed, repinned or rolled back to a source Version which exposes or can dispatch `weixin.send_text`, `weixin.notify_download`, or prior Weixin-capable handler variants. The *existing* protected release and rollback validators must review catalog *and* effective runtime, not just version UUID; require a separately accepted **Bark-only baseline** which keeps the other reviewed Actions operational. If no proven compatible Bark-only target exists, fail closed without enabling Weixin, even during incident recovery. Preserve retained version metadata only as inert provenance, not as an allowed rollback target.

**Q10=A — irreversible deletion acceptance:** verify a reviewed target-by-target purge of Weixin-exclusive live records, controllable exports/audits, credentials and retired resources without deleting shared non-Weixin data. Next distinguish `live deletion PASS` from `irreversible deletion PASS`; Cloudflare D1 Time Travel is automatic with a 30-day Workers Paid or 7-day Free recovery window, subject to actual backend/plan verification. Deleted D1 database restore/undelete, other provider-managed copies and user-controlled backups have independent retention limits. Complete irrevocable erasure may be marked PASS **only when every applicable recovery window/copy has expired or its earlier irreversible removal is independently evidenced**. Stop as Not performed/Blocked rather than claim a purge not yet verifiable. This is not permission to alter Cloudflare retention settings or to delete anything now.

### No-replay safety invariant (final)

1. **Before source retirement:** pause affected active Workflows, prove all pending/reserved/running and native GitHub/Cloudflare instances are drained or physically unable to send, and treat unknown receipts as possible prior sends. Freeze global admission only in the established protected maintenance window. The shared gate cannot by itself constrain an older binary which ignores it.
2. **On source retirement:** both Consumer's active Plan admission/runner and Provider's static Action catalog reject every Weixin Action/contract/version. Legacy Weixin receipt recovery is no longer an executable path. Preserve old `version_id` and terminal `runs.outcome` as read-only facts. For any duplicate idempotency key, return the already recorded terminal identity/status; never create a fresh native Run or a new invocation for an old Plan.
3. **If an old Run is nonterminal or `start_unknown`:** a mere pause/republish does not cancel its native instance. Require physical reconciliation/termination and exact old-code reachability proof before deleting its proof data. If impossible, defer irreversible purge and keep the existing no-retry fail-closed condition. Do not force a false `succeeded`, `failed` or `cancelled` just to pass cleanup.
4. **After retirement:** new publishing, old-Plan admission, direct invocation, stale-code rollback and cross-version repin must fail closed; completed historical Runs remain inert and queryable. Fail-closed tests must cover reloaded native instances, duplicate start keys, corrupted/missing receipts, cancellation races, version mismatch and retained prior code. Only then may a separately authorized irreversible-data procedure begin.

These decisions close the *design* frontier; compatibility, safety and deletion remain **implementation/acceptance evidence**, not further architecture choices. The existing one Worker, one private binding, D1 gate and protected GitHub Actions pipelines are sufficient; do not add a second scheduler, registry or tombstone store by default.

## Final to-spec review corrections — evidence-driven, no design expansion

- **Bounded real E2E before final Active acceptance:** Workflow admission only accepts Active Published Versions. After code checks and a separately authorized protected Publish, permit a **short, explicit Active test window** for the reviewed OpenList/Download Run, then retain Active on successful independent acceptance or pause on failure. Do not require handset E2E to have passed *before* this controlled activation; that would make the acceptance loop impossible. Existing Chrome evidence is reused while its source/release contracts remain unchanged.
- **Historical immutable content classification:** Q8=A retains *non-sensitive* mixed-use Plan/Run provenance, but the full immutable Plan JSON can include a legacy Weixin `text` literal. Do not assume a retained historical Plan holds only Action IDs. Inventory affected rows without logging bodies or secrets. If an actual stored payload falls inside Q2=B's Weixin-exclusive deletion target and cannot be separated without violating immutability or unrelated history, **block irreversible erasure** and surface that concrete conflict for an explicit, scoped Owner decision. Do not invent a parallel history store or silently redefine Q2=B/Q8=A. Source immutable version records are never rewritten as an unapproved shortcut.
- **Rollback defense in depth:** GitHub Actions approved-version gates are necessary but cannot alone prevent direct Cloudflare Dashboard/Wrangler restoration by sufficiently privileged operators. In the authorized retirement stage, independently prove the *effective* Weixin send authority is revoked: old Owner pairing/binding, relevant credentials, domain/routes and reachable upstream send capability, including across retained old Worker Versions. Validate privileged rollback attempts fail to re-enable delivery; never assume removing a Secret from only the newest Version removes it from historical Versions. Use existing Cloudflare/GitHub controls, not a new watchdog Worker.
- **Recoverable-copy acceptance:** D1 Time Travel's applicable 30-day Paid/7-day Free window and a deleted database's separately documented 7-day undelete window describe **different recovery paths**, not an automatic 37-day summed interval. Check the actual database backend and account plan; distinguish row deletion from full dedicated database removal. Evidence of all *user-controllable* live copies and accessible backups plus documented provider-retention expiry/attestation is the practical deletion gate; do not claim to inspect or physically erase inaccessible provider infrastructure.


## T3 source/Schema classification and deletion boundary (2026-11-02; no new production read)

This annex consolidates **existing, redacted T3 evidence** from [#57's original inventory](https://github.com/lirtual/cloudflare-actions/issues/57#issuecomment-6573546403) and [controlled-copy follow-up](https://github.com/lirtual/cloudflare-actions/issues/57#issuecomment-6573684268), plus tracked code and migrations. The figures below are **point-in-time prior snapshots, not freshly queried production counts, nor an approved deletion manifest**. T3 remains partial. No notification body, credentials, link, encrypted payload, backup content or sensitive production rows were accessed to write this annex.

### Canonical relationships and classification

| Data class | Source / relationship | Current disposition |
| --- | --- | --- |
| Shared Published Plans and active references | `workflow_versions(id,workflow_id,digest,plan)`; `workflows.active_version_id` | Preserve immutable Plan JSON and identity; old Weixin Action IDs are inert historical identifiers, **not** send authority. A Plan containing literal message text may be sensitive, so retention is conditional on classification, not an automatic blanket exemption. |
| Shared Runs and Steps | `runs(id,workflow_id,version_id,admission_key,outcome,start_state,inputs,result)` → `workflow_versions.id`; `run_steps(run_id,step_id,status,output)` | Preserve original Run/Step identity, provenance and `indeterminate`/terminal state. **JSON-bearing `inputs`, `result` and `output` are not proven free of sensitive content**; classify before a future content purge or unredacted export. Do not rewrite, re-admit, retry, or infer a missing Provider receipt means a safe new send. |
| Shared Action reservations | `cloudflare_action_invocations(run_id,step_id,invocation_id,source_attempt_id,input_digest,binding_generation,contract_digest,deployment_id)` → `runs.version_id` → the exact Step/Action in the immutable Plan (including source-reviewed legacy aliases) | **Only potentially Weixin-attributable rows** are T8 conditional candidates; **all** Bark/Dub/EnvShare/Litterbox reservations and shared table/index/migration are preserved. Neither time, `binding_generation`, nor deployment ID by itself establishes ownership. Require exact correspondence and no-replay-reader validation before any row deletion. |
| Shared cancellation, admission and Session safety | `cloudflare_action_cancellations`, `cloudflare_action_gate` and all applied migrations; historical execution/Session records | Preserve unless a separate, narrowly proven target is explicitly approved. Never drop the shared gate/table or modify old execution state to make a purge appear safe. |
| Dedicated Weixin D1 | Legacy encrypted binding, expired pairing and `weixin_send_receipts` in dedicated `weixin-mcp-db` | **T8 candidates only:** exact Weixin-exclusive binding/pairing/receipt/audit records once old sending is physically impossible, dependent readers/no-replay semantics are proven, and separate destructive authorization is granted. No credentials or ciphertext were inspected here. |
| Controlled copies and recoverability | Source/release scripts; GitHub Actions Artifact **names** and Cloudflare D1 recovery paths | No explicit automated Weixin D1 export was identified in inspected source, and no artifact name explicitly identified a Weixin backup. This is **not** proof that manual, generic-named, other-repository or provider-controlled copies are absent. Distinguish D1 Time Travel from database Undelete and actual operator exports. |

**Previously verified redacted snapshot:** 39 legacy-Weixin Plan Versions (31 `weixin.send_text`, 8 `weixin.notify_download`); 35 mixed-step and **4 Weixin-only-step** Versions; 16 immutable Plan Versions with nonempty literal Weixin `input.text` (7 distinct literals), whose *sensitivity is unverified*. 19 Weixin-attributable shared send reservations versus 9 non-Weixin reservations in that snapshot; 20 dedicated Provider receipts (8 `accepted`, 5 `rejected`, 7 `unknown`). Cross-database, identifier-only reconciliation found 18 matching reservation/receipt pairs, **one indeterminate Weixin reservation with no Provider receipt**, and **two unmatched Provider receipts both `unknown`**. Some historical Weixin Download Steps are indeterminate without a reservation. These asymmetries and unknowns **must not be normalized or auto-retried**. The shared D1 and Provider counters can change after the snapshot; later maintenance readbacks do not automatically revalidate each classification subset.

**Reused code/tests:** Workflow's `apps/workflow-mcp-worker/src/cloudflare-action-contract.ts` contains `isRetiredWeixinAction` / `hasRetiredWeixinAction`; its `src/store.ts` and `tests/weixin-retirement-history.test.ts` protect old Published Plan admission, terminal-key identity and zero new physical dispatch. The Provider's `apps/actions-worker/src/dispatch.ts` exposes a closed catalog without Weixin IDs. Those are **current source protections**, not proof that retained historical Provider Versions #5/#6 cannot execute Weixin or that direct Cloudflare privileged rollback is impossible. T7 maintains that separate gate.

**Additional schema-only exposure check:** The original `0001_s1.sql` also stores `workflows.draft`, `runs.inputs`, `runs.result` and `run_steps.output` as JSON/text. Prior 16-item literal classification covered **specific Weixin `workflow_versions.plan` fields**, not an exhaustive sensitivity check of these additional stores. Do **not** assert these fields contain Weixin material or are safe to delete without per-field provenance; if any future purge targets sensitive content, apply an independently approved content-safe inspection before touching them. This inventory is based on migration column definitions, **not** a fresh production-content read.

**Compiled composition boundary:** `plan.ts` rejects Cloudflare Actions inside `flow.foreach` templates, and rejects Cloudflare `action.run` inside `flow.repeat`; `cloudflare-action-contract.ts` checks retired Weixin identity on compiled top-level `action.run` Steps. The T3 Run → Version → Step join therefore uses the original **compiled immutable Plan**, not a Draft's syntactic spelling. Source evidence does not prove that all legacy Plan JSON conforms to current compiler rules; leave unexpected historical shapes as unresolved, not automatically classified by a broad substring search.

### T3 unresolved gates; fail closed

1. **Q2=B versus Q8=A:** 16 historical immutable Plans carry literal message text. The old keyword/URL-pattern checks did not establish non-sensitivity. Without separately permitted, content-safe classification or a specific Owner decision on an *actual* conflicting historical row, do not claim both complete purge and immutable preservation; do not alter `workflow_versions.plan`.
2. **Historical reachability:** detailed Run references for the 4 Weixin-only-step Plans remain unverified; an earlier finer-grained aggregation was blocked by the platform safety check and **must not be rerouted or retried**. Confirm nonterminal Native and old-binary reachability under separately authorized T7 safety checks; do not relabel `unknown`/ `indeterminate`.
3. **Copies / dependency closure:** manually controlled exports, encrypted audit copies, generic-named artifacts and provider recovery state remain unverified. Explicitly inventory and separately authorize any future sensitive inspection or irreversible action; protect other Actions' history.
4. **T8/T9 prerequisite:** classify *exact target identity and dependent readers*, prove no-replay and effective old-code send denial, then obtain a fresh production/destructive scope approval. T8 is live deletion only; T9 alone checks expired or attested irreversible recovery state. This annex grants neither.

Use the **existing #57 evidence thread and this ADR**, not a new classifier database, destructive script or parallel history/tombstone store. Keep T3 open until the above blockers have valid evidence.


### T3 exact-16 Weixin literal content triage (2026-11-02; narrowly authorized read-only)

A one-time, explicitly Owner-authorized production D1 `SELECT` inspected **only** the nonempty literal `$.with.input.text` values inside compiled immutable `workflow_versions.plan` Steps with the historical Weixin Cloudflare Action identity. The query contained an **exactly 16 distinct Plan Version** condition; no other stored field, Run content, secret, export or backup was read. All actual strings remained inside the read executor for local rule-based triage and **were not returned in tool output, chats, Issue comments, files or logs**. D1 returned `rows_written=0`.

| Triage grouping | Plan Versions | Distinct literal texts |
| --- | ---: | ---: |
| No common high-risk textual indicator detected | 13 | 4 |
| Numeric sequence or template marker; ambiguous and requires review | 3 | 3 |
| Matched strong risk patterns (URL, email, phone/ID shape, secret assignment, long token, network address or labeled personal field) | 0 | 0 |
| **Total** | **16** | **7** |

Observed literal lengths were 15–37 characters. These results confirm the older **16 Versions / 7 literals** snapshot for this exact, narrowly scoped subset but do not revalidate other D1 classifications or historical references. **Automated regex and shape detection is not human semantic review**; no indicator is *not* proof that a value is non-sensitive. The three ambiguous texts cannot be classified as sensitive or non-sensitive from the permitted aggregate signals. Even the 13 texts without detected patterns lack a verified non-sensitive attestation. A Q2=B / Q8=A *actual* content-versus-immutability conflict was **not proven or ruled out**.

**Retained blockers:** do not redact/overwrite/delete immutable Plan JSON; the earlier blocked fine-grained Run-reference query for four Weixin-only Plan Versions was **not retried or rerouted**; controlled manual/external copies, dependency readers, other JSON-bearing fields (`workflows.draft`, `runs.inputs`, `runs.result`, `run_steps.output`) and effective old-Code/T7 send authority remain separately unverified. T8/T9 irreversible cleanup has no approval. Scope of this checkpoint was production **read-only** and did not include any Run, Worker, Action, Secret, Gate or Workflow change.



### T3 static reader/dependency map for potential Weixin reservation cleanup (2026-11-02)

This is a **source-only follow-up** to the last one-time, explicitly scoped 16-Plan text triage. No further production query, historical content access, retry of the formerly blocked reference query, or backup inspection occurred. The following references are to tracked current source, not to an independently verified old Provider #5/#6 binary:

| Reader / safeguard | Existing implementation | Consequence for T8 |
| --- | --- | --- |
| Exact shared reservation identity | `mcp-workers/apps/workflow-mcp-worker/migrations/0013_cloudflare_action_invocations.sql` defines `PRIMARY KEY(run_id,step_id)`, globally unique `invocation_id`, input digest, contract and deployment identity; stores no message body | Do not classify by timestamp, single binding generation, contract string or Worker Version alone. Any future target list requires original Run → immutable Version → compiled Action Step and exact keys. |
| Cancellation after possible send | `mcp-workers/apps/workflow-mcp-worker/src/store.ts`, `cancelStep` branch: inserts a cancellation marker, then queries `cloudflare_action_invocations`; an existing reservation returns `dispatched_may_complete`, while absence may permit a conditional `runs.outcome='cancelled'` update | Deleting a reservation can **change the interpretation of a possibly sent operation**. A correct Weixin-only ownership join is necessary but **not sufficient** for deletion. Preserve historical status/cancellation facts, and prove all relevant old/cancel paths are either no longer executable or preserve at-most-once semantics without relying on the candidate row. |
| Recovery for another Action | `mcp-workers/apps/workflow-mcp-worker/src/runner.ts` `awaitLitterboxFileReceipt` reads the same table to distinguish `litterbox_receipt_unconfirmed` from `litterbox_file_not_submitted` | **Never delete other Action reservations, or the shared table/index/migration**. Existing Litterbox recovery must remain unaffected. |
| Old-Plan replay / native wake denial | `mcp-workers/apps/workflow-mcp-worker/src/store.ts` `start`, `status`, `resume`; `src/runner.ts` `WorkflowOrchestrator.run`; `src/cloudflare-action-executor.ts` | Current source checks old immutable Plan and original idempotency key before new admission, forbids retired Weixin Actions in native wake and dispatch, and preserves unknown/indeterminate status. These safeguards **do not prove** the retained historical Provider Version #5/#6 or privileged repin paths are harmless. |
| Historical Weixin Provider receipt reader | `cloudflare-actions/apps/actions-worker/src/dispatch.ts` now exposes only the four reviewed non-Weixin Actions and rejects unsupported receipt access; the former dedicated Weixin Provider source is not part of the current source tree | A current-main absence is **not** evidence that inherited D1/Secret bindings in retained deployed versions are dead. Do not delete `weixin_send_receipts` or encrypted pairing/binding rows until T7 independently proves old effective authority and all consumers obsolete. |

**Static no-replay acceptance for any later narrow purge:** verify exact ownership and key sets; preserve unknown/indeterminate, terminal and cancellation facts; establish absence of old runnable binaries and Native wake; prove duplicate admission, cancellation, receipt lookup, non-Weixin recovery and privileged rollback fail closed with controlled non-production regression tests; then require explicit T8 destructive authorization and separate independent postflight. If a deletion would silently turn `dispatched_may_complete` into `requested` or an unknown receipt into a presumed unsent action, **stop instead of deleting**. Do not create a replacement/tombstone table just to make a deletion appear safe.

**Still blocked:** the four Weixin-only Step Plan Versions' fine-grained Run-reference query was previously rejected by platform safety controls and was **not retried or rerouted** here; content-level sensitivity of the 16 Plan texts is not conclusively established by the aggregate rule-only screening; other JSON-bearing fields, manual/external backups and controlled copies remain unclassified. T7 old Provider #5/#6 removal/authority is an independent gate. This source-only checkpoint is **not** a deletion manifest or a grant to access sensitive data.


### T3 source-backed JSON persistence boundaries (2026-11-03)

A continuation of T3 **source-only** review after the [merged synthetic regression PR #698](https://github.com/lirtual/mcp-workers/pull/698) (main CI [41477765248](https://github.com/lirtual/mcp-workers/actions/runs/41477765248): Success). This is not a new inspection of production rows, historical messages, backups or old Provider binaries. It neither exercises nor reroutes the previously platform-blocked four-Weixin-only-Plan Run-reference query.

| Field | Source-confirmed producer / storage mechanism | Result of source-only review |
| --- | --- | --- |
| `workflows.draft` | `mcp-workers/apps/workflow-mcp-worker/src/store.ts`: `WorkflowService.create` and `update` persist supplied `definition` to `draft`; `publish` compiles a separate immutable Plan | A historical Draft may still retain original Weixin literals even when the active published Plan is Bark-only. **No field-level production content classification performed.** |
| `runs.inputs` | `store.ts` `start`: serializes supplied inputs into `inputJson` before inserting a Run, with specialized envshare sealing and Litterbox transient-file admission safeguards | Input JSON is an independently persisted surface, not covered by the earlier 16 immutable Weixin `input.text` matches. Existing specialized secret/file protections are not proof every historical input is nonsensitive. |
| `run_steps.output` | `runner.ts` persists the result `output` with `JSON.stringify` during Step settlement (including reviewed `result.emit`, `mcp.call`, HTTP and action outcomes), also in child/foreach Step storage | Output can be derived from runtime operations and must be assessed independently; cannot infer that it contains or does not contain old Weixin content without separately permitted evidence. |
| `runs.result` | `runner.ts` computes the emitted/last-Step output and persists `JSON.stringify(output)` to `runs.result`; `store.ts` `result` reads it | A final result can persist data beyond `workflow_versions.plan`. Do not claim it is Weixin-only, sensitive, or purge-safe merely because the parent Plan contains a historical Weixin Action. |

**Retention and no-replay boundary:** The current `store.ts` and `runner.ts` read original immutable Plan/Run and persisted outcome when defending against old Weixin replay. [PR #698](https://github.com/lirtual/mcp-workers/pull/698) adds synthetic cancellation and immutable-Plan attribution assertions (510/510 Workflow tests, TS check, PR and main CI Pass) but **does not certify deletion** of historical `cloudflare_action_invocations`, Run/Step JSON, or dedicated Provider receipts.

**Next evidence boundary (not yet authorized):** any production read of these four JSON columns (even aggregate structural/boolean inspection), content-aware semantic judgment of the 3 ambiguous distinct historical message texts, a controlled copy's contents, or an old deployed binary requires a separately and precisely scoped authorization. Use bounded **field-level, in-executor redaction** with aggregate-only output, an exact population guard, and `rows_written=0` validation for a future approved read; stop on any platform safety denial. Do not retry or reroute the already blocked four-Plan Run-reference aggregation. No direct content/production-read authority or deletion approval is conferred by this ADR.



### T3 exact-seven current Draft guard — stopped without classification (2026-11-03)

The Owner separately authorized **one** minimum-scope production D1 **read-only** `workflows.draft` structural and risk-pattern classification for the **seven previously believed existing Drafts containing historical Weixin Action identifiers**. The query selected only the `draft` column from nondeleted workflows with a case-insensitive literal `weixin.send_text` or `weixin.notify_download` indicator, and enforced **exactly seven matches in the same SQL query** before returning any Draft to the classifier. A fixed `LIMIT 8` bounded the read.

**Observed result:** the **exact-seven guard was not met**. The query returned **no Draft bodies to the in-executor parser**, so Draft parsing, structure checks and sensitivity classification **did not run**; no raw Draft, message, identifier, URL, key or sensitive value was emitted. D1 reported `rows_written=0`. The actual count was deliberately **not fetched**; the result does not establish whether the previously recorded seven changed, whether some are YAML/legacy spellings, or whether the literal matching rule was too narrow. Do not promote this to a "zero historical Weixin Drafts" finding.

**Fail-closed action:** immediately stopped. No second D1 query, broader search, changed predicate, alternate connector, blocked four-Plan reference lookup, historical message read, Run/Step read, backup read or production mutation. The entire permitted **single-read** scope is consumed.

**T3 disposition:** exact-seven Draft classification **Blocked / no classification performed**. Keep the `workflows.draft` content-sensitivity and historical matching population unresolved, in addition to the existing immutable Plan text, four-Plan Run association, controlled-copy, shared invocation no-replay, old Provider #5/#6 and T7/T8/T9 gates. A future independent authorization would need to specify a separately justified, narrower read procedure and an authoritative population definition. This documentation does not authorize that read or any deletion.


### T3 historical versus visible Draft denominator (non-production evidence, 2026-11-03)

Original redacted D1 inventory (#57, 2026-11-02): **46 visible Workflows = 6 Active + 40 Paused**, including **7 then-current Drafts** with a Weixin Action identity (5 with a nonempty text field). Later T7 acceptance: **14 visible Workflows = 6 Active + 8 Paused**. These are point-in-time populations, not an exact-seven invariant; **46−14=32 does not establish 32 production deletions**. `0014_workflow_deletion.sql` and `store.ts` use non-destructive `deleted_at` tombstones; normal `list()` excludes those rows, while immutable Plan/Run history is retained.

**Canonical source-reused test-only identification procedure:** separate **all physical Workflows**, **currently visible Workflows (`deleted_at IS NULL`)**, and **immutable `workflow_versions`**. For each stored Draft string, apply the compiler's existing strict JSON/YAML parse settings (`YAML.parseDocument` with unique keys / strict / `maxAliasCount:16`), **without invoking `compilePlan`**: it correctly rejects all retired Weixin Actions and must not be used to claim those Drafts do not exist. On parsed top-level `steps`, reuse `isRetiredWeixinAction` (requires Cloudflare `action.run`, matches `provider=weixin` or `weixin` Action ID aliases). Unexpected/malformed/nested historical shapes are **indeterminate**, not negative. Never use a simple `LIKE '%weixin.send_text%'` text match as the authoritative Draft classification rule. Historical send attribution continues to rely on original Run → immutable Plan Version → exact Step/Action, not on the current Draft.

**Non-production synthetic evidence:** [mcp-workers test branch / PR](https://github.com/lirtual/mcp-workers/pulls?q=is%3Apr+head%3Atest%2Fspec54-t3-draft-scope-20261103) adds a single test file reproducing different denominators in a synthetic 46→14 dataset; verifies JSON/YAML, aliases, incidental-text false positives and unparseable/nested forms. Test-only implementation, not a new runtime classifier. Local checks must pass before push; CI verdict is determined separately. It is **not** current production classification, not proof of the cause of the guard mismatch and not a purge manifest.

**Unresolved / not authorized:** no additional D1 read, no retry or alternate query for the previously platform-blocked four Weixin-only Plan references; no Draft body, sensitive content, Run/Step result, backup, Provider #5/#6 access or T8/T9 purge. A new aggregate-only production population check, if required, must be separately approved and should not use the old exact-seven assumption. T3 remains Partial / Open.


### T3 bounded live Workflow population reconciliation (2026-11-03)

**Explicit one-time production-read authorization:** Read only six `COUNT(*)`/`COALESCE(SUM(CASE ...))` aggregate integers from production `workflow-mcp-db.workflows`, using only `state` and `deleted_at`; do not select `draft` or any other contents/IDs, Plan, Run, Step, credential, body or backup. Single API D1 SELECT was executed between **2026-11-03 00:20:38Z and 00:20:43Z**. In-executor guards verified one D1 statement, exactly one returned row, six named nonnegative safe integers, **`rows_written = 0`**, and both required sum identities. No second query was made.

| Current state / population | Aggregate |
| --- | ---: |
| `physical_total` — all physical `workflows` rows | **46** |
| `visible_total` — `deleted_at IS NULL` | **14** |
| `soft_deleted_total` — `deleted_at IS NOT NULL` | **32** |
| `visible_active` — undeleted and `state='active'` | **6** |
| `visible_paused` — undeleted and `state='paused'` | **8** |
| `visible_draft` — undeleted and `state='draft'` | **0** |

Validated invariants: `46=14+32` and `14=6+8+0`. This proves **32 physical Workflow rows are currently soft-deleted** and explains the present-day aggregate difference between physical and visible inventories. It does **not** establish the deletion chronology, which original 2026-11-02 records were deleted, or which hidden/visible `draft` *text columns* contain retired Weixin Actions. In particular, **`visible_draft=0` is a Workflow state count, NOT a count of Draft definitions with Weixin Action IDs**: even an Active or Paused Workflow retains a `workflows.draft` definition.

**Limits / outstanding work:** This narrowly authorized count cannot conclude whether any of the earlier seven Weixin-related Draft definitions remain, cannot classify original text sensitivity, and cannot confirm the four previously platform-blocked Plan→Run references, controlled manual backups, immutable Plan literal conflicts, shared invocation no-replay deletion conditions, or retired Provider #5/#6 authority. No Draft/body/identifier/Secret/Plan/Run/Step content was retrieved or returned; no T7/T8/T9, production write, workflow/worker/gate/config change, deployment, deletion or disallowed query/retry. Future production text or even Draft structure inspection requires **new, explicit authorization**; T3 #57 stays **Open / Partial**. Do not reuse the historical exact-seven guard.


### T3 one-time 46-row Draft structural inventory (2026-11-03)

The Owner explicitly authorized **one** limited production `workflow-mcp-db.workflows` read: only `draft` and `deleted_at` plus a same-statement guard `(SELECT COUNT(*) FROM workflows)=46`; return **at most 46 rows**, for execution-environment-only classification. The exact single read completed at **2026-11-03 00:29:57.322Z**. It returned exactly 46 rows, `rows_written=0`; required per-group and grand-total arithmetic passed. No retry, alternative connector, export, or other D1 query occurred.

| Classification (structured JSON Draft only) | Current visible (`deleted_at IS NULL`) | Soft-deleted (`deleted_at IS NOT NULL`) | Total |
| --- | ---: | ---: | ---: |
| **weixin** — unambiguous top-level historical Cloudflare `action.run` matched `isRetiredWeixinAction` identity | **1** | **3** | **4** |
| **other** — JSON top-level Steps contained no matching retired Weixin Action or flagged unknown shape under the reviewed rules | **5** | **15** | **20** |
| **indeterminate** — non-JSON/YAML, JSON parse failure, malformed or unsupported top-level/nested form | **8** | **14** | **22** |
| **Total** | **14** | **32** | **46** |

**Validated invariants:** `1+5+8=14`; `3+15+14=32`; `4+20+22=46`; `14+32=46`, and the same-statement 46-row physical-population gate. Only the above aggregate counts and timestamp were returned, **not** raw Draft text, notification bodies, Workflow names/IDs, URLs, credentials, secrets, immutable Plans, Runs, Steps or backups.

**Execution-only classifier and unavoidable limitations:** The classifier used `JSON.parse` for Draft source strings, **not** the full current `compilePlan` (which intentionally rejects historical Weixin Actions). For top-level `uses='action.run'`, it matched the existing `isRetiredWeixinAction` identity rule: `with.executor='cloudflare'` and either case-insensitive `provider='weixin'` or `with.action` beginning `weixin.`, `weixin_` or `weixin-` (case-insensitive). Unparseable YAML and malformed/missing Step structure, unsupported Flow and detected unknown nested Action shapes were **indeterminate**, never defaulted to non-Weixin. The `other` bucket is solely a **structural non-match on successfully classified JSON**; it is **not** a proof of absence of any hidden historical action or sensitive content. The 22 indeterminate rows have **not** been subdivided into YAML versus malformed or other unknowns, and neither their text nor any individual identity was emitted. This scope must not be silently expanded.

**Interpretation:** 4 current physical Draft *definitions* conclusively match a historical retired Weixin Action under the constrained rule, of which 1 is visible and 3 soft-deleted; **22 additional Draft definitions remain unclassified**. These figures cannot be compared directly with the historical point-in-time **7** Weixin Action Drafts to infer specific removals: time, soft-delete scope, legacy alias coverage and indeterminate handling differ. `visible_draft=0` from the preceding metadata-only check counts **Workflow state** `draft`, not all `workflows.draft` definitions (Active/Paused Workflows also have this source field).

**Hard stop on deletion decisions:** This checkpoint is a bounded source-content *structure* classification, **not** a semantic sensitivity audit, a deletion manifest or evidence that any of the 20 `other` rows are safely purgeable. Do not delete or rewrite immutable Plan/Run/Step, 19 historical Weixin-related invocation reservations or dedicated receipts; do not reinterpret historical unknown/indeterminate delivery, or infer old Provider #5/#6 authority was revoked. The previously platform-blocked four-Weixin-only-Plan Run-reference query remains untouched, and T7/T8/T9 plus controlled-copy/recovery gates stay independent. **Any additional production Draft content/format access requires new, precise authorization.** T3 #57 stays **Open / Partial**.


### T3 non-production YAML and historical nested Draft regression (2026-11-03)

**Scope:** Extended the **existing** [mcp-workers synthetic Draft regression](https://github.com/lirtual/mcp-workers/blob/main/apps/workflow-mcp-worker/tests/spec54-t3-draft-inventory.test.ts) as a test-only change; no new runtime classifier, worker, migration, separate service, release pipeline or production data read. [mcp-workers PR #701](https://github.com/lirtual/mcp-workers/pull/701) was squash-merged to `main` at `49fc61a4f9230e057128256c8be377e1098b82dc`, independently verified in the main test file. Previous [PR #699](https://github.com/lirtual/mcp-workers/pull/699) remains the origin of the 46/7 vs 14 denominator regression.

**Additional synthetic acceptance:**

- Strict YAML source parsing with the existing `yaml` package and `YAML.parseDocument(source,{uniqueKeys:true,strict:true})` followed by `toJS({maxAliasCount:16})`: reviewable top-level Cloudflare `action.run` using mixed-case historical provider `WEIXIN` or `WeIxIn_legacy` Action ID is a **positive**; a regular `result.emit` Step with `weixin.send_text` in *prose only* remains a structural **other**, not a positive.
- Source `flow.repeat` and `flow.foreach`, compiled `uses='flow.foreach'`, an executable-shaped object nested in a Step payload, unknown `flow.*` and malformed/duplicate-key YAML are conservatively **indeterminate**; do not assume present-day compiler rejection eliminates historic executable shapes.
- Found and corrected a **test-helper-only** underclassification: `steps: []` is now **indeterminate**, not `other`; malformed or null Steps also remain indeterminate. A definite top-level retired Action remains a positive even if another Step is unknown.
- Verification: focused suite **5/5 Pass**; complete Workflow suite **515/515 Pass**; TypeScript `tsc --noEmit` and `git diff --check` Pass. PR checks Application, Required checks gate and GitGuardian all Success (Database integration skipped as in existing CI). This is non-production evidence only. Main push CI [#41554927708](https://github.com/lirtual/mcp-workers/actions/runs/41554927708) for squash merge `49fc61a4f9230e057128256c8be377e1098b82dc` independently completed **Success** (attempt 1).

**Limits / disposition:** This test-only helper deliberately reuses the existing `isRetiredWeixinAction` identity predicate and source YAML parsing semantics. It is **not** a deployed parser and cannot, by itself, classify the **22 live indeterminate Drafts** from the previously authorized one-time JSON-only production read (8 currently visible, 14 soft-deleted). Those 22 have not been accessed again or split by JSON/YAML format. The historic 4 positive / 20 structural other / 22 indeterminate aggregate is unchanged. No extra D1/Run/Plan/Step/backup or sensitive-body read, no repeat/alternate route for earlier platform-blocked four-Weixin-only-Plan linkage, and no Worker, Provider #5/#6, Secret, production-config, Workflow, Gate, release or deletion operation. A future parser-capable production inspection would require demonstrated execution-environment capability plus **new explicit authorization**, fail-closed boundaries and aggregate-only returns; T3 #57 stays Open / Partial, T7/T8/T9 unchanged.


### T3 controlled execution YAML reuse capability (2026-11-03)

**Scope:** Owner-authorized **non-production execution-environment capability check only**, with **zero Cloudflare API requests and zero D1 reads**. The probe used a hardcoded synthetic YAML sample (not a historical Draft). It returned only the following capability flags:

| Execution-environment check | Observed |
| --- | --- |
| Global `YAML` or `jsyaml` parser available | **No** (`undefined`) |
| CommonJS `require` available | **No** (`undefined`) |
| `importScripts` available | **No** (`undefined`) |
| `JSON.parse` safely rejects synthetic YAML | **Yes** |
| Existing project `yaml` package loaded/reused in this execution environment | **Not verified / unavailable through tested interfaces** |

These results demonstrate that the current Cloudflare command execution interface **has no confirmed direct mechanism** to reuse the project's installed `yaml@2.8.2` parser. They do **not** prove that every conceivable module-loading/bundling mechanism is impossible. Neither a runtime import, external dependency fetch, alternate tool route nor a bespoke parser was attempted; none is a validated production solution. Non-production [PR #701](https://github.com/lirtual/mcp-workers/pull/701) tests remain valid **only in the Node project test environment**, where the existing YAML dependency is installed.

**Decision:** Fail closed and **do not perform a new production Draft query** under a JSON-only parser, do not reclassify YAML/unknown historical shapes by `JSON.parse` failure, and do not replace the existing parser with ad hoc YAML string matching. Preserve the previous single authorized production result **4 structurally identified retired Weixin / 20 narrow JSON structural nonmatches / 22 indeterminate** (8 visible and 14 soft-deleted unknown); these counts are **unchanged**, and the 22 unknown Drafts were **not read again**.

Further YAML-capable production classification would first require a genuinely supported and prevalidated reuse mechanism with synthetic tests, bounded in-executor source handling and aggregate-only output, **plus separate explicit production authorization**. No new service, database, workflow, Worker release or one-off privileged path is justified merely to close an informational count. This capability check does not resolve the four previously safety-blocked Plan→Run references, semantic sensitivity, backups, old Provider #5/#6 authority or no-replay constraints. T3 #57 stays **Open / Partial**; T7/T8/T9 remain independently blocked and unauthorized.


### T3 synthetic reservation attribution identity regression (2026-11-03)

[Existing test-only Draft PR #702 in `mcp-workers`](https://github.com/lirtual/mcp-workers/pull/702)
corrects a subtle test/implementation mismatch: the earlier synthetic
`weixin-retirement-history.test.ts` selected only two exact Weixin Action
names in SQL, while the production admission-denial
`isRetiredWeixinAction` predicate also recognizes `weixin.`,
`weixin_` and `weixin-` historical Action aliases.
The test now joins reservations to their original Run, immutable Plan and
exact Step and **reuses that existing predicate** rather than maintaining
a parallel Action-name allowlist. A synthetic mixed-case `WeIxIn_legacy`
with an unrelated provider correctly matches; an unmatched historical
Step is explicitly `indeterminate`, not a deletable negative. The Bark
reservation remains distinct. This is **test-only** and modifies no
production classification or storage schema.

**Verification:** Focused test file 15/15 Pass; full Workflow test suite
515/515 Pass; TypeScript typecheck Pass. Draft PR #702 head
`0ee3284867403ef0660fa58527502b22cb0fa666` independently passed
Application checks, Required checks gate and GitGuardian Security Checks
([PR CI Run #41590999795](https://github.com/lirtual/mcp-workers/actions/runs/41590999795));
existing Database integration was skipped. The PR is **Draft/Open, not
merged**. No Worker runtime, D1, Workflow, source publisher or production
operation was changed.

**No evidentiary upgrade:** These fabricated fixtures are not a live
history inventory, a production Run→Plan→Step ownership proof, or a
deletion manifest. The earlier 19 Weixin-attributed reservations and
4 Weixin-only Plan references retain their historical classification
limits; the blocked production Run-reference query must not be retried or
rerouted. The 22 indeterminate Drafts, 16 Plan literal sensitivity,
shared cancellation/no-replay dependencies, manual backups and old
Provider #5/#6 authority remain unresolved. Do not delete any
reservation, history or receipt on the strength of these tests.
