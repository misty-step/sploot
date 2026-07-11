Inspect the Sploot work board and explain how to claim or close an item.

Powder is the sole source of truth for work. Use the registered Powder MCP/API/CLI; do not read or create repository-local ticket files.

1. Read repository board stats, then enumerate the repository's cards without status filters and reconcile the count.
2. Read the relevant card with its goal, acceptance criteria, proof plan, relations, claim state, and recent activity before acting.
3. Use `list_ready` before claiming work. Claim exactly one card at a time, keep its run alive, and release the claim when stopping.
4. Close work with `update_status` or `complete_card`, attaching exact proof links and criterion evidence. Do not infer completion from a green command alone.
