# Unified Cloudflare Actions — bounded context (Spec #21)

The `cloudflare-actions` Worker is the single **physical runtime** for the
static reviewed Action Catalog: `weixin.send_text`, `weixin.notify_download`,
`bark.send_notification`, and `dub.shorten_url`.
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

**Status (2026-10-31):** the unified Worker, protected producer/consumer
releases, domain transfer, fresh Owner QR/proof pairing, source receipt
preservation and both Weixin/Bark single-shot physical handset E2E are
verified. Five of six original business Workflows have been republished and resumed;
`chrome` remains paused after its update was blocked by the platform.
Legacy Worker/publisher retirement is not performed; the old Weixin Worker
remains a reviewed physical Owner-domain fallback. Prior cutover history
is retained in `docs/spec-21-cutover.md`.

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

## Spec #35 · Dub anonymous short-link Action (deployed; third-party durability pending)

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

**Still open:** independent unsanitized cross-client verification and
reasonable follow-up availability observation, without rate-limit
circumvention or duplicate create; EnvShare and Litterbox are separate
unimplemented acceptance stages. No DuckDuckMail. Preserve existing
Weixin/Bark digests and fallback, and use only the existing protected
release path for any subsequent production change.
