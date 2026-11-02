# Unified Cloudflare Actions — bounded context (Spec #21)

## 2026-11-02 proposed retirement — Owner round-1 decisions, design only

The Owner confirmed Q1=A / Q2=B / Q3=A in [ADR-0002](../../docs/adr/0002-bark-only-weixin-retirement.md):
**Bark-only for existing notification-bearing business Workflows** (`openlist`, `download`; `chrome` already migrated); no new notifications for `windows`, `ubuntu`, `code-server`. Retain strict failure and at-most-once semantics, no automatic fallback or retry. The **target end state** removes both `weixin.send_text` and `weixin.notify_download`, all executable Weixin code/bindings/pairing/Owner domain/release paths, and **permanently deletes Weixin-specific historical D1 receipts and audit evidence**, rather than keeping that history indefinitely. This is a *chosen future outcome*, not the current catalog or a production-deletion approval.

Live catalog below is **still authoritative until protected migration and publication**. The older ADR-0001 and Spec #21 instructions to retain Weixin receipts governed the earlier unified-worker cutover and must remain in force during this retirement's unconfirmed stages. Protect immutable Plans, unknown historical Invocations, shared Worker release versions and unrelated Action histories; none may be silently rewritten or re-sent. Do not delete D1 tables, credentials, production Owner domain, Cloudflare resources, or historical Run metadata until the agreed Q8–Q10 data-scope/compatibility requirements are proven and fresh explicit irreversible-operation approval is obtained. Reuse the current Cloudflare Actions Worker, service binding, action gate, guarded CI/release and runtime proof; do not add another Provider or pipeline.

**Round 2 decided:** Q4=A (extend the *existing* reviewed Chrome Bark trust
and physical-Ready fence with an explicit OpenList Action allowlist);
Q5=A (require signed, reconciled native Download Task terminal plus verified
remote SHA-256 readback before Bark, never caller-declared success);
Q6=A (delete Weixin-exclusive data and controlled copies only, preserve
unrelated/shared business evidence); Q7=A (Bark E2E before old send
disablement, then guarded provider retirement and separately authorized
irreversible data purge). See ADR-0002 and the bounded runbook. Never confuse
the previously required historical receipt retention with permission to
re-execute legacy Plan versions. All round-2 rules are **design only**.

**Round 3 final design:** Q8=A keeps immutable mixed-use Plan/Run provenance
(including inert non-sensitive Weixin Action identifiers and terminal
`indeterminate` states), while Weixin-exclusive receipts, pairing and audit
content are purged only at the separately approved deletion stage. Q9=A
permanently denies any Weixin-capable Provider/Consumer version or rollback
through the existing protected release gates, requiring a verified Bark-only
baseline and fail-closed recovery. Q10=A requires recovery window/copy expiry
or independent proof before claiming **irreversible** deletion; SQL deletion
alone is insufficient. See ADR-0002 for the no-replay/unknown-Run invariant.
**Design closed; no runtime or production state has been changed.**

**Proven live notification state:** Chrome → Bark signed Session Ready, encrypted notification, phone delivery and clickable temporary link passed on 2026-11-02 (Workflow Run `922b90fd-6953-43f8-b5cf-5380f74afc2c`); `openlist` still references `weixin.send_text` and `download` still references `weixin.notify_download`. The paused Weixin test Workflow also remains and needs retirement. OpenList Bark still needs source-reviewed signed Ready URL handling (the existing Bark handler currently restricts the trusted Session to Chrome). Download Bark still needs the existing single-item signed GitHub Task + physical terminal + remote hash-readback proof: a generic “Step succeeded” notification is not equivalent. Bark's Provider `accepted` is not proof of delivery to the handset.

See the retirement design gate at the start of [Spec #21 cutover runbook](../../docs/spec-21-cutover.md). **The rest of this file records existing/historical behavior, not completed retirement.**

The `cloudflare-actions` Worker is the single **physical runtime** for the
static reviewed Action Catalog: `weixin.send_text`, `weixin.notify_download`,
`bark.send_notification`, `dub.shorten_url`, `envshare.share_text`, and
`litterbox.upload_file`.
A logical Provider/Handler is not a separately deployed Worker. All business
orchestration, Published Plans, immutable Action grants, durable dispatch
reservations and cancellation remain in `lirtual/mcp-workers` Workflow.

## Domain vocabulary

- **Action ID**: stable logical name of a reviewed operation, not a URL or
  executable plugin identifier
- **Action Contract**: immutable schema and handler identity digest; source
  and Workflow consumer must independently agree on the digest
- **Worker Version ID**: actual Cloudflare deployment identity shared by all
  Actions; changing any Handler changes this identity
- **Historical Receipt**: original read-only Weixin D1 evidence keyed by the
  original Invocation and generation; never authorizes another send
- **Migration Gate**: Workflow D1 single-row fence that is checked inside the
  same atomic INSERT that claims an external-send entitlement

The original Weixin D1, historical receipts, Access-protected Owner page
and Bark AES-256-GCM sender are reused. Under the 2026-10-30 Owner decision,
the old encrypted binding is explicitly unbound after a safe dispatch freeze;
a fresh key requires one new verified Owner QR pairing. No
runtime plugin loading, cross-Action credential selection, generic HTTP
executor, new storage, or public send endpoint is permitted.

**Current recovery status (2026-11-01, supersedes the historical note
below):** the unified `cloudflare-actions` Provider remains the only
reviewed physical Action runtime; the Workflow Consumer has one
`ACTIONS -> cloudflare-actions#ActionsEntrypoint` Service Binding.
Cloudflare inventory returned **HTTP 404** for both former physical
`weixin-mcp-worker` and `bark-provider`, so neither can be used as a live
Owner-domain rollback target. The former GitHub release publishers still
exist; do not invoke them merely to recreate missing Workers.
`weixin.lirtual.dpdns.org` remains on the unified Worker.

Five original business Workflows remain active. `download` and `openlist`
were separately re-Published against the current unified Provider Version
`39c5c470-040b-4ae7-b81a-6c47d04f548f` and independently read back,
without a new notification E2E. `chrome` remains paused at Draft revision
15 after its production write was refused by the ChatGPT platform.

The only maintained physical rollback candidate is a **reviewed earlier
Version of the same unified Worker**. Version #4,
`adf7d9d1-5bc1-424a-b74c-7c7dff699fd4`, is retained and has the same
required Secret binding names and D1 binding type as current Version #5;
this **does not certify compatibility**. In particular, Version #5 added
Litterbox, so a rollback to #4 reduces the Action Catalog. Exact-version
production rollback **has not been exercised**.

The `scripts/actions-protected-upgrade.mjs` rollback gate requires the
Consumer to pin the **current** Provider before switching; when frozen
and drained, the existing Owner-authorized rollback job may switch the
Provider, then the independently protected `mcp-workers` Consumer release
pins the now-active target under the still-frozen gate. Business Plans must
be separately revalidated/re-Published before reopening admission. This
is a source-verified **procedure**, not permission for live rollback;
it requires explicit production maintenance approval. For evidence and
remaining gates see [Spec #21](https://github.com/lirtual/cloudflare-actions/issues/21)
and `docs/spec-21-cutover.md`.

**Historical 2026-10-31 snapshot (superseded by the current inventory):**
the unified Worker, protected producer/consumer releases, domain transfer,
new Owner QR/proof pairing, source receipt preservation, and Weixin/Bark
single-shot handset E2E were verified. Five of six Workflows were active;
`chrome` remained paused. At that time the old Weixin Worker was still
documented as a physical Owner-domain fallback. That statement is not a
claim of its present existence.

## Adding another logical Cloudflare Action

1. Keep the existing `cloudflare-actions` Worker and private `ACTIONS` binding.
   Add a small source-reviewed Handler with a bounded input/output contract,
   fixed destination and independent credential checks. Do not provide a new
   public send endpoint, runtime-loaded plugin, or general HTTP executor.
2. Register its Action ID and immutable manifest in `src/dispatch.ts`,
   explicitly routing `execute`, `getContract` and any supported read-only
   receipt/binding operations. Omit unsupported methods by rejecting them;
   absence of a published digest is not authority to execute.
3. Mirror the exact reviewed manifest in Workflow's static compiler and
   execution path. Discovery must never implicitly authorize an Action.
   `getContract(id, digest)` must return that exact reviewed digest or reject;
   calls without a digest advertise the current version. Keep prior immutable
   contract digests available only where historical compatibility requires.
4. Add unit/workerd regressions for catalog identity, side-effect denial,
   input bounds, credential isolation and any indeterminate upstream outcome.
   Verify matching producer/consumer digest, then use the existing CI and
   manually approved `release-actions.yml` publisher. Do not add another
   Worker, Service Binding, deploy workflow, Registry database or scheduler.
5. Since all Actions share one Worker Version ID, a live upgrade requires
   explicit maintenance authorization, frozen admission, drained Runs,
   reviewed version pins and a controlled reopening of business Workflows.
   A successful CI or merge never publishes production code automatically.

## Spec #35 · Final production acceptance (2026-11-01)

The **six static logical Actions** above share the existing unified Worker and private
`ACTIONS` binding; they are not six separate deployed Workers. Three #35
utilities are now **production functionally accepted**, each with its own
explicitly authorized, single-use evidence. This current section supersedes
the older source-stage notes below, which are retained as historical context.

- **Dub `dub.shorten_url` — PASS for anonymous TEMPORARY links only.**
  A single production Run `0db31eef-1130-4858-9086-40dbe13d5a4e`
  returned accepted after the Provider's no-follow HEAD verified the exact
  destination including its query. No login, API key, custom slug, target
  fetch, automatic retry or permanent-link promise. Upstream schedules
  unclaimed anonymous-link deletion after roughly 30 minutes, not an exact
  contractual TTL. Prior later dashboard redirect / HTTP 429 did **not**
  establish a specific deletion cause or durable availability. A manual
  one-shot Owner instruction is the consent boundary; `public_stats=false`
  by default. Full original URL/query is persisted in Workflow inputs and
  disclosed to Dub only when the Owner explicitly requests the Run.
- **EnvShare `envshare.share_text` — PASS for one-use encrypted sharing.**
  Protected Provider/Consumer production releases and real Run
  `3a7a54fa-1bfa-4706-b9b0-bb97f54d4de3` succeeded. Independent first
  retrieval returned HTTP 200 with `remainingReads=0`, AES-128-GCM
  decryption matched the source, and the second retrieval returned HTTP 404.
  The plaintext and decryption key were not persisted in Workflow D1.
  The test Workflow is paused. A configured 24h TTL was **not** independently
  observed to elapse; this was a one-read acceptance, not a 24h expiry test.
- **Litterbox `litterbox.upload_file` — PASS for one real synthetic TXT
  and observed 1h expiry.** The one approved manual Plan uploaded a 379-byte
  file once (Run `3f8b7010-e28b-4a94-8793-ba7277769b0c`), via a
  user-selected temporary Azure Blob SAS external GET, private Service
  Binding and pinned Provider. Independent HTTP 200 download at about
  `2026-11-01T05:17:21Z` matched SHA-256
  `576d129577bf7b6819cf73d6581ac80f7b0e8b96c51f84ba1b8046febec64ddb`.
  The only post-expiry no-follow GET at `2026-11-01T06:33:19Z` returned
  **HTTP 404** (curl exit 63 because its 65,536-byte error-page body cap
  was reached). This is an observed unavailable/expired response after the
  selected 1h lifetime, **not** an exact deletion timestamp. The test
  Workflow is paused; five business Workflows remain active. File input
  accepts only exact `files.oaiusercontent.com` HTTPS or a narrowly bounded
  `<account>.blob.core.windows.net/<container>/<blob>` read-only SAS shape.
  A fileParams descriptor, Azure account name or SAS **does not prove
  OpenAI-owned provenance**; `file_id` is opaque, not `file_`-prefixed.
  Signed URLs and file bytes never enter D1. Upload is public plaintext,
  at most 10 MiB, one-shot, no redirects or unknown-effect retry.

Evidence: [Issue #35](https://github.com/lirtual/cloudflare-actions/issues/35),
[Owner closure checklist](https://github.com/lirtual/cloudflare-actions/issues/35#issuecomment-6554271453),
[Litterbox upload/independent hash](https://github.com/lirtual/cloudflare-actions/issues/35#issuecomment-6553845927),
and [Consumer file boundary](https://github.com/lirtual/mcp-workers/blob/main/docs/spec35-litterbox-file-upload.md).
No new Provider, deployment, storage, release or Portal change is authorized
or performed by this documentation-only reconciliation.

## Historical Spec #35 source-stage and intermediate acceptance notes

## Spec #35 · Dub anonymous short-link Action (historical implementation notes)

`dub.shorten_url` is another static logical Action in the same private
`ActionsEntrypoint`/`ACTIONS` binding. Its bounded input is one `inputs.url`
HTTP(S) target plus a reviewed optional `public_stats` boolean (default false).
The target and its entire query are disclosed to the fixed Dub upstream only
upon a new manually invoked, explicitly user-requested Workflow Run; the
Workflow persists `runs.inputs`, including the complete URL and query, as
expressly accepted by the Owner. Do not use URL targets containing credentials
unless that storage and third-party disclosure are intentional.

The caller cannot choose the upstream endpoint, account, recipient, slug,
headers, or any token. The Handler never fetches the URL destination and
returns only a validated `dub.sh` result. Re-entry after a durable dispatch
reservation yields Unknown (Dub has no reviewed read-only receipt recovery);
no lost-ack or 5xx retry is permitted. The Workflow compiler forbids all
triggers for this Action, admits only the literal `inputs.url` reference,
requires one exact immutable Contract/Worker Version grant, and retains the
existing gate/cancel fences. The API approval/grant is not independently
verified UI consent: the operator must only dispatch from an explicit Owner
instruction such as `@Workflow 缩短 <URL>`. No popup guarantee is claimed.

**Approved consent and privacy boundary (2026-10-31):** The Owner
superseded the earlier mandatory per-invocation ChatGPT popup requirement
with a fresh, explicit **manual one-shot Workflow Run instruction**.
A Published Plan grant or model-generated `approved` flag alone is not a
new instruction. Original full URL/query may be persisted in Workflow
`runs.inputs` and disclosed to Dub, by explicit Owner decision.
`public_stats` is a **literal Plan-time boolean** (default `false`);
`true` deliberately makes Dub statistics public. It cannot be supplied
as a dynamic Run input. Do not send sensitive query tokens unless D1
storage and external disclosure are intended.

### Spec #35 · Deployed redirect integrity guard and acceptance limits

The Provider added a bounded, no-follow `HEAD` against the newly created
fixed `https://dub.sh/<key>` link. Only a 301/302/303/307/308 whose raw
`Location` equals the complete original destination **including query**
can return `accepted`. Any mismatch, failure, timeout, or ambiguous
result yields `unknown`; never follow redirects, fetch the target or
POST a second time for the same Invocation.

**Verified as of 2026-10-31:** PR #37 source and CI passed; protected
release #41205370664 deployed Provider Version
`3564c2ae-538f-4fe7-beee-b4e0e328c7e8` (100%). Protected Consumer
release #41207448615 deployed Version
`52a5f18f-9364-4479-8dd3-86546506c9be` (100%), with the exact
Provider Version pinned. Five original business Workflows were restored.
One **new** manual-only Dub Run
`0db31eef-1130-4858-9086-40dbe13d5a4e` returned accepted after
the Provider's own complete-Location verification. Its test Workflow
remains paused, and no repeat invocation is permitted.

**Do not repeat the superseded query-loss conclusion:** HTTP MCP
intentionally redacts query parameters from reported redirect
`Location`, so its displayed 302 without query cannot prove Dub
lost that query. An independent raw CLI `HEAD` encountered HTTP 429,
not an exact cross-client destination proof. An earlier anonymous link
later showed `Link Not Found`; its upstream cause was not established.
A point-in-time `HEAD` is not a durability or availability guarantee;
the anonymous Header is not a documented stable public Dub API.

**Historical stage note (superseded by the current acceptance section):**
Cross-client long-lived availability was not established and is not required
under the Owner-approved temporary-link scope. EnvShare and Litterbox were
later implemented and accepted independently. No DuckDuckMail; preserve
Weixin/Bark digests and fallback, and use the existing protected release
path for any subsequent production change.


## Spec #35 · EnvShare boundary (historical design, now deployed)

The earlier source-only EnvShare plan was subsequently released and passed
the one-time real decryption E2E described in the current section above.
Workflow inputs/outputs remain durable in D1, so normal `inputs.text`
would persist plaintext and a full `unseal#...` result would persist its
decryption key. The deployed Workflow encrypts before D1 and returns a
random key only in the first `workflow_run` response; the keyed
`workflow_result` constructs the share URL without persisting the key.
Lost first-response key delivery cannot be silently recovered or replayed.
The one-use read test passed; wall-clock 24h expiry was not tested.
See `docs/spec-35-envshare-boundary.md` for the historical crypto design
and replay-loss tradeoff. Do not reuse the cancelled CandyBox Worker/PR.
