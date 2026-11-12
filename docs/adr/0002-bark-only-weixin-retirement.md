# ADR-0002: Retire Weixin, preserve Bark and historical safety

**Decision:** The maintained Cloudflare Action Provider is Bark-only for notifications. Former Weixin sending, owner ingress, credentials and executable versions are retired; they must not be restored by an ordinary release or rollback. The fixed-destination Bark Action retains its encryption, immutable reviewed contract and private Service Binding.

Historical Weixin D1 records and receipts remain available for audit, but never authorize a fresh invocation or a replay of an Unknown result. Historical D1 deletion was not performed and is not implied by this decision. Any future destructive cleanup requires separate evidence and explicit authorization.

Production maintenance uses the existing protected manual workflow. It must verify the live Provider/Consumer identity, compatible contracts, immutable Plans, pending/Unknown effects and the reviewed recovery target; neither a source merge nor passing CI authorizes a release.

Recorded decisions and acceptance evidence: [Spec #54](https://github.com/lirtual/cloudflare-actions/issues/54), [T7 #61](https://github.com/lirtual/cloudflare-actions/issues/61), [T8 #62](https://github.com/lirtual/cloudflare-actions/issues/62), [T9 #63](https://github.com/lirtual/cloudflare-actions/issues/63) and [Spec #711](https://github.com/lirtual/mcp-workers/issues/711).
