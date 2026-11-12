# ADR-0003: Compatible Action contracts

**Decision:** Keep one source-reviewed Cloudflare Actions Worker and private `ACTIONS` binding. Workflow MCP remains the authority for immutable Published Plan grants, validation and durable single-invocation admission.

For each **new** Action invocation, verify the trusted live Provider identity, approved Action ID, contract digest, arguments and side-effect scope before the one-shot reservation. Store the actual Provider Version identity with that invocation and check it again at execution. A compatible deployment may change the Worker Version without requiring unchanged Plans to pin a new UUID.

Changes to effective effects, destinations, credentials, permissions, outputs, failures or security boundaries require a newly reviewed Action contract and Plan approval, even when JSON schemas appear unchanged. Prior Plans and Run/Step/Invocation evidence remain immutable. Missing or Unknown outcomes must never permit an automatic replay; retired Weixin Actions must not regain execution through compatibility.

Use the existing protected manual release for upgrade/recovery; incompatible updates require appropriate freeze/drain checks, and a rollback target must be a separately reviewed Bark-only implementation. A source merge or CI result is not production acceptance. No dynamic registry, additional Worker, second orchestrator, new credential scope or alternate publisher is needed.

Historical design/acceptance evidence is recorded in [Spec #711](https://github.com/lirtual/mcp-workers/issues/711), Git and associated release Issues.
