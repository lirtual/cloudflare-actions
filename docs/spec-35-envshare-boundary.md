# Spec #35 — EnvShare data boundary (source-only design, not an enabled Action)

Status: **Provider and Workflow Consumer source staged, CI pending; no production release**.
The source-reviewed EnvShare Action is registered in the staged Catalog, but
the live production Worker/Workflow do not contain these unmerged changes.
No third-party storage or read was performed.
This is a **new Cloudflare Actions stage**, not a revival of cancelled
`lirtual/mcp-workers#325`.

## Verified existing boundaries

- Workflow `workflow_run` calls `WorkflowService.start` in
  `lirtual/mcp-workers/apps/workflow-mcp-worker/src/store.ts`.
  Its admission stores `json(inputs)` in D1 `runs.inputs`; the Runner
  stores `JSON.stringify(outcome.output)` in `run_steps.output`, and
  stores the emitted result in `runs.result`. This is durable and
  subsequently exposed by `workflow_result`.
- Therefore passing `text` through ordinary inputs stores **plaintext**;
  returning the complete `https://envshare.dev/unseal#...` in an Action
  output stores the **decryption key**. Redacting normal logs alone does
  not fix either problem.
- Upstream `chronark/envshare` current `app/share/page.tsx`,
  `pkg/encryption.ts`, `pkg/encoding.ts`,
  `pages/api/v1/store.ts`, `app/unseal/page.tsx`
  use **envshare.dev** (not envshare.app): AES-128-GCM with 16-byte IV,
  Base58 ciphertext and IV, `POST /api/v1/store` body
  `{encrypted,iv,ttl,reads}`. The key stays out of the store request.
  The client generates `/unseal#Base58(0x02 || 16-byte id || 16-byte key)`.
  `GET /api/v1/load?id=<id>` consumes a read, so a 1-read share
  must **not** be casually read back while testing.

## Implemented source-only data flow — not published

1. Only a reviewed **manual one-shot** `envshare.share_text` Plan may
   accept a bounded plaintext input (default 24h, one read, <=16 KiB
   UTF-8). Reject Cron, Webhook, GitHub-event, arbitrary endpoints and
   any automatic retry. Explicit user instruction remains essential.
2. At the existing authenticated Workflow admission **before D1
   insertion**, validate and encrypt the text with fresh Web Crypto
   AES-128-GCM key/IV. Persist **ciphertext + IV + approved TTL/reads**
   only, not the original text or key. No extra Worker, DB, queue,
   public HTTP endpoint or new orchestration service.
3. The existing private `ACTIONS` RPC sends only
   `{encrypted,iv,ttl,reads}` to fixed
   `https://envshare.dev/api/v1/store`; return a strictly validated
   **id/status only**, never a full URL or key, into the normal
   Workflow step/run results. Apply the existing Contract Digest,
   Provider Version grant, cancellation and durable at-most-once fence.
4. Return the secret key **only in the first** `workflow_run` response
   (`delivery_key`), never as a durable value. The client later supplies
   that key to `workflow_result(run_id,delivery_key)` to combine it with
   the confirmed `share_id`; the server checks a durable SHA-256 verifier
   of the random 128-bit key and produces `share_url` **without a D1 write**.
   A key passed to `workflow_result` is not permission to create anything.
   Real ChatGPT tool-response/URL-delivery verification is still required.
   The key
   appears in the user-facing ChatGPT conversation and MCP tool responses
   by the nature of handing the resulting URL to the user; it must not enter D1,
   Worker logs or third-party store payloads.
5. If a Run admission reply containing the transient key is lost, the
   key is intentionally **unrecoverable** from D1; a resumed/replayed
   admission must not regenerate a new key or trigger another create.
   Report indeterminate/unrecoverable rather than pretending recovery.
   No encrypted key escrow or second registry is introduced.

## Required acceptance before executable registration

- Actual tool admission and result paths prove plaintext, key and
  fragment absent from all Workflow D1 tables, receipts, logs and
  error/Unknown paths, including parallel/repeated admissions and
  failed/unknown acknowledgements.
- Offline independent AES-GCM/Base58 v2 interoperability and output
  validation; real workerd Binding test with **isolated stub upstream**.
  The test-only local fixture in
  `apps/actions-worker/tests/envshare-protocol.test.ts` proves only
  compatibility, **not** a deployed Handler or live endpoint behavior.
- Real ChatGPT-facing transient key delivery/combination verified;
  no invocation without a fresh explicit request. Confirm the minimum
  client behavior without a local Node runtime, plugin refresh or
  additional provider-specific service.
- Separately authorized live ciphertext-only upload, one independent
  decryption/read, and expiry/read-count validation with disposable
  text. Never consume a one-read secret merely for routine checks.
- Preserve all existing Weixin/Bark/Dub Contracts and production
  safety gates. Any source PR/CI is not authorization to deploy or
  perform a real third-party POST.

**Current decision boundary:** Existing production Workflow Runs cannot meet
the privacy contract. The new special-case source path addresses D1 input
and result persistence, but must not be deployed or advertised as live until
protected rollout and real ChatGPT transient delivery E2E are authorized and
verified. The
Client-side pre-encryption alternative also avoids D1 secrets, but
would require a verified native client encryption capability; do not
pretend this is already provided by ChatGPT.
