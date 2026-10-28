# Cloudflare Actions

Independent, reviewed Cloudflare Action Providers. Spec: https://github.com/lirtual/mcp-workers/issues/392.

This repository is **not** the production publisher yet. Do not deploy until the single-writer cutover and compatible rollback baseline are separately authorized.

## Weixin Provider (migration candidate)

- Original reviewed source: `lirtual/mcp-workers` commit `55ef67aabaf44f68eebf1f2975d2f7fb75edb96d`, `apps/weixin-mcp-worker`; copied source includes the legacy owner Access page, MCP ingress, D1 migration and durable receipt fence.
- This branch adds `WeixinActionProvider` WorkerEntrypoint RPC (`sendText`, `getReceipt`, `getBinding`), which binds the fixed `weixin.send_text` template to the current Owner generation. No arbitrary recipient, generic message template, or public RPC HTTP endpoint is provided.
- `getReceipt` reads by invocation ID, digest and historic generation even after rebind; no upstream operation occurs. Missing receipt means **indeterminate**, not definitely unsent. A send can return `accepted`, `rejected` or `unknown`; handset delivery is separate evidence.
- The Provider enforces the stable UUID, generation, canonical HTTPS Quick Tunnel URL and 4 KiB bound; the caller must independently authorize the Published Plan and verify signed OpenList Session Ready state *before* issuing this RPC. Provider-only validation does not establish provenance.
- The first RPC operation does not retry an ambiguous external result. Existing D1, encryption keys and URL host bindings are unchanged and **must not be recreated** during migration.
- `pnpm run check` includes TypeScript, offline D1 tests, Wrangler dry-run and real workerd tests, including the Service Binding RPC. All fixtures are synthetic.

**Release gate:** This repo has CI only. It has **no production release workflow or credentials** until the existing Weixin release permission is independently revoked and a single authorized main-only manual production path is established. Do not register or deploy the new Provider from CI, nor rename or remove the existing Worker, D1 or Access setup during code review.
