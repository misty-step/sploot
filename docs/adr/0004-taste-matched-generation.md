# ADR 0004: Defer taste-matched generation until recommendation quality proves itself

- Status: Accepted
- Date: 2026-06-11

## Context

The 029 taste-engine backlog asks for a written feasibility verdict on
taste-matched generation before any generation code is written. Sploot already
has CLIP image embeddings for saved memes and a `favorite` flag that marks
bangers. That is enough to build taste-aware retrieval without paying for image
generation.

Current provider/pricing facts checked on 2026-06-11:

- OpenAI image generation pricing is token-based; current image models list
  image inputs from $2.50-$8.00 per 1M tokens and image outputs from
  $8.00-$32.00 per 1M tokens depending on model/tier.
- Replicate lists `black-forest-labs/flux-1.1-pro` at $0.04 per output image
  and `flux-schnell` at $3.00 per thousand output images.
- Stability's developer platform bills credits where 1 credit is $0.01.

Even at low per-image prices, a taste feature that invites repeated generation
can outspend storage/embedding costs quickly, and generated meme quality is not
proven by a centroid alone. The product risk is worse than the API risk:
"generate something like my bangers" can easily produce bland or unsafe output
without a prompt and moderation shape.

## Decision

Do not implement taste-matched generation in 029.

Ship taste retrieval first:

1. Compute a user's banger centroid from existing CLIP embeddings.
2. Rank saved assets by similarity to that centroid behind an explicit taste
   mode.
3. Render a minimal "your taste" profile from the same signal.

Revisit generation only after taste retrieval proves the app can infer a useful
preference signal. A future generation ticket must specify provider, per-image
budget, prompt strategy, safety policy, abuse controls, and user opt-in.

## Consequences

- 029 ships useful product value with no new generation provider or recurring
  generation spend.
- The taste model remains explainable: "near your bangers" over existing
  library items.
- Future generation can reuse the profile signal but must earn its own
  evidence packet and cost guardrails.

## Sources

- OpenAI API pricing: https://openai.com/api/pricing/
- Replicate pricing: https://replicate.com/pricing
- Stability AI pricing: https://platform.stability.ai/pricing
