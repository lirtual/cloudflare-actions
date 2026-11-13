# Cloudflare Actions — context

A single Cloudflare Worker exposes a build-time Action catalog through the private `ACTIONS` Service Binding. The authoritative action names, manifests, schemas and handlers are in the worker source. There is no dynamic provider registry or public general-purpose action endpoint.

Workflow MCP owns orchestration, Published Plans, approvals, D1 reservations, admission and cancellation. This Provider executes the reviewed effect only for a matching Action identity and contract, binding the actual Provider deployment identity to the invocation. The current catalog includes Bark, Dub, EnvShare, Litterbox and a non-side-effect diagnostic; historical Weixin actions are not available for new execution.

Changing authorization-relevant behavior, side effects or output semantics requires a new reviewed contract/grant, even if the JSON schema is unchanged. A compatible deployment may change the Worker Version, but must not bypass the runtime identity check. Reserved, Unknown or otherwise indeterminate external effects must never be replayed automatically.

Bark remains a fixed-destination encrypted notification Action. Historical Weixin D1 receipts are retained as evidence, not as dispatch permission. Do not restore retired Weixin credentials, endpoints or executable versions; do not delete historical data as part of source maintenance.

The existing manually dispatched protected release workflow owns production upgrade/recovery. Explicit Owner authorization, compatibility checks, in-flight/Unknown safety and independent live readback still apply. A merged change or passing CI is not proof of production state. See the current source and the remaining [compatibility decision](../../docs/adr/0003-compatible-action-contracts.md); dated evidence is retained in GitHub Issues and Git history.

## Diagnosing an Action failure

Use existing receipts and logs; do not initiate a second external effect as a diagnostic probe.

1. Inspect the **published** Workflow Run with `workflow_status` / `workflow_result`. Record its Run ID, Published Version, business Step status and independent Bark Step status. `notify_bark=skipped` after a failed upload is expected, not evidence of a Bark failure.
2. Query the existing Workflow D1 database **read-only** for the same Run ID (never change records to force recovery):
   ```sql
   SELECT step_id, status, error_code FROM run_steps WHERE run_id = ? ORDER BY step_id;
   SELECT step_id, invocation_id, created_at, contract_digest, deployment_id
     FROM cloudflare_action_invocations WHERE run_id = ? ORDER BY step_id;
   ```
   If no Provider invocation exists, investigate admission, plan/grants and input checks before blaming the provider. An invocation reservation proves admission, **not** upstream acceptance; unexpected multiple reservations require stopping for investigation.
3. In Cloudflare Workers Observability, narrow the time window around `created_at`, then match `cloudflare-actions` logs by **exact `invocation_id`**. For Litterbox, `litterbox_upload_rejected` supplies `category` and, on known upstream 4xx, `http_status`. `invalid_invocation`, `invalid_file` and `contract_mismatch` reject before POST; `upstream_http_4xx` means a POST received an explicit HTTP rejection. If the event is absent or sampled away, classify the root cause **Unknown**, not as no request.
4. For HTTP 412, record the upstream status and exact correlated evidence. The status alone **does not distinguish** an origin precondition, upstream policy/WAF or request incompatibility. Cross-check the fixed endpoint and multipart fields against provider documentation without another upload; do not claim a cause or change headers/fetch behavior without proof. The current test covers the response classification but does not prove the external site's compatibility.
5. Preserve the separation between **business outcome**, **Bark acceptance** and **device delivery**. A failed or indeterminate external upload must not be replayed or converted to success; do not expose uploaded bytes, file names, hashes, SAS URLs, response bodies, tokens or secrets in diagnostics. A fresh public file upload requires a newly selected file and explicit Owner approval. A code change requires CI and the separate protected, Owner-approved production release and live readback; merge alone is not deployment.

Record the Run ID, Invocation ID, safely classified failure, relevant Worker/Provider versions, decision, and outstanding evidence in the owning issue. Reuse this path for other Provider Actions, following their existing safe log event names; do not add parallel status stores or monitoring solely for troubleshooting.
