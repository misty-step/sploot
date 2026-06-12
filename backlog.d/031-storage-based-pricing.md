# Charge for storage with a generous free tier

Priority: P2 · Status: blocked · Estimate: XL

## Goal

Sploot has a real pricing model aligned with its real cost structure:
everyone gets a generous free tier, heavy hoarders pay for storage (blob
bytes are the dominant marginal expense), and a premium tier exists for
future taste/generation features.

## Oracle

- [x] A written pricing spec (free tier size, paid tier(s), price points)
      grounded in actual unit costs: Vercel Blob $/GB-month + egress,
      embedding API cost per image, Neon row/vector cost — measured, not
      guessed.
- [x] Billing integration (Stripe unless shaping finds better) with
      checkout, customer portal, and webhook-driven plan state on the user.
- [x] The existing storage-quota machinery
      (`lib/quota/storage-quota-policy.ts`, settings usage meter) enforces
      per-plan limits; hitting the free cap produces the upgrade prompt,
      lowercase product voice, no data hostage-taking (read/export always
      works).
- [x] Landing/pricing page states the model honestly; `pnpm lint:design`
      green.
- [ ] Evidence packet: free-tier user hits cap → upgrade flow → quota
      raises (Stripe test mode end to end).

## Progress

Implemented the storage pricing foundation on `deliver-031-storage-pricing`:
free/plus/max plan constants, Stripe Checkout/Portal/Webhook routes, user plan
state, plan-aware quota sync, pricing/settings UI, API docs, pricing spec, and
tests. Local CI-parity gates pass after applying
`20260611235000_add_billing_plan_state` to the local pgvector test DB.

Evidence packet:
`docs/qa/evidence/2026-06-11-storage-pricing/packet.md`.

Blocked on live Stripe test-mode proof: local `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_PLUS`, and `STRIPE_PRICE_ID_MAX` are
unset, so the required cap → Checkout → webhook → quota-raise flow has not been
exercised end to end.

## Notes

Raw idea — needs `/shape` (tier sizes, single premium vs storage metering,
annual discounts, grandfathering the current sole user). The quota
plumbing from ticket 008 already meters storage bytes per user, which is
most of the enforcement half. Decide free tier from cost math: e.g. if
1GB ≈ thousands of memes and costs cents/month, free can be genuinely
generous. Per [[vision]]: target users are hoarders — the cap should feel
far away until it isn't.

## Children

1. Cost-model spike: measure real $/user at 1GB/5GB/20GB libraries; write
   the pricing spec.
2. Plan state on users + per-plan quota limits in storage-quota-policy.
3. Stripe checkout + portal + webhooks (test mode).
4. Upgrade UX: cap-hit prompt, settings plan card, pricing page.
5. Go live: prod Stripe keys, grandfather existing data.
