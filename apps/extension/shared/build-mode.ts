/**
 * Build-mode flag, isolated so production gating is testable and greppable.
 *
 * `IS_DEV_BUILD` is true for `wxt dev` / `WXT_MODE=development wxt build` and
 * false for `build:prod`. Diagnostics surfaces (the "Sploot Debug: Dump Auth
 * State" context-menu item, the popup Debug Auth button) must gate on this so
 * the store-shipped extension carries no debug affordances.
 */
export const IS_DEV_BUILD: boolean = import.meta.env.DEV === true;
