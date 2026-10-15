# ADR-0006: Repo-owned SPEC verification

Status: Accepted by Kaylee, 2026-10-15; implementation requires independent review.

The shared harness intentionally retired its foundation catalog and checkers.
Sploot's frozen checker still reads `git show HEAD:USER_STORIES.md`; a symlink to
SPEC yields only `SPEC.md`, rejecting a real three-story/eight-criterion receipt.
A compatibility backport would preserve the retired dual path. Kaylee explicitly
chose repo-owned SPEC verification instead (Kanban t_15ee1573).

Use one Node parser for the walk and check/affected/receipt/review commands.
Current SPEC is the sole regular behavior source. Git readers prefer SPEC and
fall back to the regular legacy story file only in pre-migration history, never
when SPEC exists but is malformed or a symlink. Remove the unused legacy alias.

Retain the existing document/feature-map/verification-procedure checks, story
format requirements, numbered criteria, artifact digests, candidate HEAD/tree,
requested base, bootstrap expiry/ratchet and extension-record review semantics.
Every passing criterion needs actual listed evidence; empty evidence is refused.
`qa/story-baseline.json` owns only the current mode/entries (enforced, no gaps).
Historical `foundation.json` remains readable for ratcheting old bases. Existing
`foundation/extensions/` format and the designated `kaylee-agent[bot]` identity
are unchanged. The privileged review job executes base-branch code and treats
PR source only as data. The first migration PR still runs the old base workflow;
subsequent PRs use the repo-owned trusted reader after this merges.

Delete catalog/adoption metadata and pinned harness/Bun fetches, not product
verification. The former satisfied receipts and pending assessment declarations
remain in Git history at 38ca3a90edf36719abdcdb02e55c82a1f6075f64:foundation.json;
they are not newly satisfied, nor evidence of deployment. No replacement catalog,
shared control plane, compatibility branch, synchronization job or registry is
built. Production-health/release work remains with its existing owners.

CI preserves the foundation/story-walk check names. `merge-gate` also depends on
both so a failed walk can no longer hide behind an unrelated green job subset.
No release/deploy workflow, runtime, credentials, hosting or library data changes.
