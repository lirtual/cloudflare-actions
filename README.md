# Cloudflare Actions

Independent, reviewed Cloudflare Action Providers. Spec: https://github.com/lirtual/mcp-workers/issues/392.

This repository is **not** the production publisher yet. Do not deploy until the single-writer cutover and compatible rollback baseline are separately authorized.

## Weixin Provider (migration candidate)

- Original reviewed source: `lirtual/mcp-workers` commit `55ef67aabaf44f68eebf1f2975d2f7fb75edb96d`, `apps/weixin-mcp-worker`; copied source includes the legacy owner Access page, MCP ingress, D1 migration and durable receipt fence.
- This branch adds `WeixinActionProvider` WorkerEntrypoint RPC (`sendText`, `getReceipt`, `getBinding`), which binds the fixed `weixin.send_text` template to the current Owner generation. No arbitrary recipient, generic message template, or public RPC HTTP endpoint is provided.
- The private `getContract` RPC reports the live `CF_VERSION_METADATA.id` and
  the exact reviewed action-contract digest. Every `sendText` RPC must carry
  both pins and fails before a receipt reservation when either differs.
  Workflow independently checks the same identity at Publish and first dispatch.
- `getReceipt` reads by invocation ID, digest and historic generation even after rebind; no upstream operation occurs. Missing receipt means **indeterminate**, not definitely unsent. A send can return `accepted`, `rejected` or `unknown`; handset delivery is separate evidence.
- The Provider enforces the stable UUID, generation, canonical HTTPS Quick Tunnel URL and 4 KiB bound; the caller must independently authorize the Published Plan and verify signed OpenList Session Ready state *before* issuing this RPC. Provider-only validation does not establish provenance.
- The first RPC operation does not retry an ambiguous external result. Existing D1, encryption keys and URL host bindings are unchanged and **must not be recreated** during migration.
- `pnpm run check` includes TypeScript, offline D1 tests, Wrangler dry-run and real workerd tests, including the Service Binding RPC. All fixtures are synthetic.

**Release gate (source staged in Draft PR, not production enabled):** The only
publisher prepared here is `.github/workflows/release.yml`, manual
`workflow_dispatch` on the current `main` with explicit production confirmation
and the existing `weixin-mcp-worker` GitHub Environment. CI has no deploy step.
Before obtaining production write access it requires all of the following:

- The old repository's current reviewed release source contains no Weixin
  publisher, and old queued/running/waiting release jobs are drained. It refuses
  to deploy while the old repository still holds an enabled release path.
- Existing Cloudflare Worker, D1 ID, host bindings and secret inventory agree
  with the pre-cutover source; neither D1 nor Owner state is recreated.
- The exact reviewed Source SHA is still the repository's current main.
- Required new Environment Secrets are present, and the staged encryption key
  actually decrypts the existing production Owner ciphertext in a **read-only**
  D1 query. No decryption result, credential or ciphertext is logged.
- Wrangler deploy stages both required Secrets atomically. Post-deploy readback
  must match the reported Worker Version ID and expected D1, hosts and Secrets.

**Separate release authorization is still necessary:** do not merge or run the
new production release until the old publishing authority has been revoked,
the new secrets and environment protection have been configured, a compatible
rollback baseline has been defined, and a supervised cutover is approved.
Readback, secrets inventory and CI alone do not prove full rollback safety.
The original Worker, D1, Access administration and legacy MCP must remain
operational until the new RPC has been verified.
