Type-check the whole monorepo and triage failures.

Run `pnpm type-check` (Turbo fans out to web `tsc --noEmit`, extension `tsc
--noEmit`, and `@sploot/common`).

If it fails, group errors by package, show the file:line for each, and fix the
root cause — do not silence with `any`, `@ts-ignore`, or by relaxing
`tsconfig`. Re-run until clean.
