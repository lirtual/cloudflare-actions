# ADR-0001: Build-time Action Catalog in one Worker

**Decision (Spec #21, implementation draft).** Use a single physical
`cloudflare-actions` Worker containing two source-reviewed Handlers. Workflow
uses one private `ACTIONS` Service Binding, but keeps sole authority for
Published Plans, immutable grants, dispatch admission and recovery.

**Why:** new lightweight Actions should not require another Worker, Service
Binding, release environment or orchestration engine. Build-time registration
makes the allowed actions and their contract digests auditable. It reuses the
existing Weixin/Bark Handler constraints, D1 and encryption code.

**Trade-offs:** one Worker Version ID advances for both Actions, so unchanged
Action Contracts can still have incompatible pinned deployment identity;
release blast radius is shared. Runtime Secrets are also co-located, so no
handler may select another Action's recipients/credential or accept dynamic
URLs. Source-bound dispatch and existing provider validations remain required.

**Alternatives rejected:** independent per-Action Workers (binding/release
proliferation), runtime-loaded plugins/registry DB (unnecessary executable
surface), and a second dispatcher/orchestrator (competing authorization).

**Migration/rollback (2026-10-30 revision):** preserve original D1 and
historical receipts, not the encrypted binding. The Owner may unbind the
original session and re-pair with a new key AFTER old instances drain
and atomic migration freeze. Rollback may need another verified QR pairing.
The atomic
Workflow D1 gate protects only code paths that implement it. Old Workflow
instances must be drained or proven unable to send before cutover. No Secret,
Worker, D1, domain or Publisher is migrated merely by merging code; the
separately authorized protected release must supply and prove those.
