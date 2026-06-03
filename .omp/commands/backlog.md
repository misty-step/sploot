Show the sploot work backlog and explain how to close an item.

`backlog.d/` is the source of truth for work (not GitHub Issues). Do this:

1. Read `backlog.d/README.md` (the human-readable index / active queue).
2. List active items: the `backlog.d/*.md` files (excluding `_done/` and
   `README.md`). If only `_done/` and `README.md` exist, the queue is empty.
3. List recently completed items in `backlog.d/_done/`.

Closure protocol for an item: move it to `backlog.d/_done/` with `Status:
done`, add a `## What Was Built` note, and link it from the commit/PR with a
conventional trailer — `Backlog: backlog.d/<id>-<slug>.md`,
`Closes-backlog:`, or `Ships-backlog:`. Keep `backlog.d/README.md` aligned with
the active queue.
