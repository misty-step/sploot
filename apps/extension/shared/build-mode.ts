/**
 * Build-mode flag, isolated so production gating is testable and greppable.
 *
 * `IS_DEV_BUILD` is true for `wxt dev` / `WXT_MODE=development wxt build` and
 * false for `build:prod`. WXT config resolves this flag at build time so Vite's
 * production bundling can still produce a development-flavor unpacked build.
 * Store artifacts must carry neither diagnostics nor update QA affordances.
 */
export const IS_DEV_BUILD: boolean = import.meta.env.WXT_MODE === 'development';
