# Unified Cloudflare Actions — bounded context (Spec #21)

The `cloudflare-actions` Worker is the single **physical runtime** for the
static reviewed Action Catalog: `weixin.send_text`, `weixin.notify_download`
and `bark.send_notification`.
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

## Spec #35 · Dub anonymous short-link Action (source candidate; not deployed)

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

**Acceptance:** Local source/CI and stubbed real workerd RPC are necessary but
not proof the unsupported anonymous Dub endpoint still works in production.
An actual link creation/readback and Provider/Workflow protected releases need
separate explicit authorization. This is not an independent Worker/publisher,
not an MCP tool, and not a revival of cancelled CandyBox MCP #325.

### Spec #35 · Dub post-create redirect integrity gate (source-only remediation)

The first production anonymous Dub Run was accepted exactly once, but an
independent HEAD+GET read initially returned a 302 Location lacking the entire
original query, and a later read returned 307 to Dub's links page with a
public `Link Not Found`. Upstream's reviewed process-link/create-link code and
get-final-url middleware intend to preserve destination query. This does not
establish which upstream layer changed the saved destination or removed the
link; the anonymous header is not a guaranteed public REST contract.

**Fail-closed remedy:** after one successful anonymous POST, verify the exact
validated `dub.sh` short link using one bounded HEAD with `redirect:manual`.
Only 301/302/303/307/308 with an exact original target Location (including
query) can produce `accepted`. Errors, missing/mismatched Location, unexpected
status, HEAD timeout and the later Dub 307 not-found transition return
`unknown`. Never repeat POST or follow the Location / fetch an arbitrary
third-party target. A HEAD success is only a point-in-time integrity proof,
not an uptime/durability guarantee. Consumer uses its *unchanged* original
Contract Digest and immutable Published Versions; it does not need new source.

This source change and its stub-based workerd tests are **not** production
verification, and must not be deployed by direct Wrangler/manual API calls.
A later reviewed protected Provider upgrade will change the Version ID;
first pause/freeze/drain, then use the existing release workflow, repin the
Workflow Consumer and affected Published Plans, and restore existing users.
One separate authorized anonymous create/readback is needed for real acceptance;
never retry the earlier “unknown” or previously completed invocation.
