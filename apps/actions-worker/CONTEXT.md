# Cloudflare Actions — context

A single Cloudflare Worker exposes a build-time Action catalog through the private `ACTIONS` Service Binding. The authoritative action names, manifests, schemas and handlers are in the worker source. There is no dynamic provider registry or public general-purpose action endpoint.

Workflow MCP owns orchestration, Published Plans, approvals, D1 reservations, admission and cancellation. This Provider executes the reviewed effect only for a matching Action identity and contract, binding the actual Provider deployment identity to the invocation. The current catalog includes Bark, Dub, EnvShare, Litterbox and a non-side-effect diagnostic; historical Weixin actions are not available for new execution.

Changing authorization-relevant behavior, side effects or output semantics requires a new reviewed contract/grant, even if the JSON schema is unchanged. A compatible deployment may change the Worker Version, but must not bypass the runtime identity check. Reserved, Unknown or otherwise indeterminate external effects must never be replayed automatically.

Bark remains a fixed-destination encrypted notification Action. Historical Weixin D1 receipts are retained as evidence, not as dispatch permission. Do not restore retired Weixin credentials, endpoints or executable versions; do not delete historical data as part of source maintenance.

The existing manually dispatched protected release workflow owns production upgrade/recovery. Explicit Owner authorization, compatibility checks, in-flight/Unknown safety and independent live readback still apply. A merged change or passing CI is not proof of production state. See the current source and the remaining [compatibility decision](../../docs/adr/0003-compatible-action-contracts.md); dated evidence is retained in GitHub Issues and Git history.
