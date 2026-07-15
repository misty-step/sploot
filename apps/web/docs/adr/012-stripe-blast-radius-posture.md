# ADR 012: Stripe blast-radius posture before billing

Status: repo-owned safety slice implemented; external Stripe/Mint proof pending

## Decision

All repository-owned Stripe work runs in Stripe test mode. The policy accepts
only `sk_test_` or `rk_test_` credentials. Live credentials and Mint aliases
are not repository credentials. A future production caller must obtain a
verifiable, verb-scoped lease with finite TTL, lease ID, provenance digest, and
restricted IP scope from an external Mint authority; without that adapter the
action is refused.

The capability contract is explicit and least privilege:

- read Customers, PaymentMethods, Subscriptions, and Products;
- create Checkout Sessions and Subscriptions;
- allow `cancel_at_period_end`;
- do not grant `subscriptions.delete` or any wildcard operation.

`stripe-cancellation-monitor.ts` owns delivery policy and exposes no plain
event observer. The Next.js Stripe route reads raw request bytes and uses the
repository's concrete Stripe HMAC verifier; absent signing secret, Postgres,
or configured HTTPS circuit/page endpoints it refuses the request. The
production factory constructs `PrismaStripeCancellationLedger`, whose Postgres
transaction lock deduplicates events, records event digests, persists alert
state, and appends audit rows for recording, dedupe, breach, and delivery.
Idempotency authority is the verified event ID plus the exact authenticated
event bytes (raw-body digest and canonical payload digest): a legitimate
Stripe retry carries a fresh timestamp and signature header over identical
bytes and is accepted as a dedupe, with the retry's signature header digest
retained as separate signature audit; the same event ID with different bytes
is refused. The HMAC is checked over exact raw bytes before JSON parsing. The
event stores the complete parsed payload plus encrypted provenance containing
the raw bytes and exact signature header; digests, event type, livemode,
account, and object identity remain queryable without exposing secrets.
Events, audit rows, and maintenance records are database-enforced append-only
for runtime roles; only a separately provisioned issuer can issue a token, and
only the separate maintenance authority can consume its exact
actor/purpose/subject/time-basis/range/expiry token. Every maintenance token is
bound to exactly one subject (one Stripe account or one Stripe object) and to
either audit `created_at` or event `received_at`, so it cannot cross tenants or
be repurposed from audit retention to encrypted-provenance erasure.
Raw provenance has a bounded body size and an explicit purge path that erases
only encrypted bytes after the legal minimum while preserving digests and a
maintenance-chain record. Circuit/page work is a durable outbox with stable
replay and idempotency keys, leased claims, generation fencing, bounded
exponential backoff/jitter, terminal dead-letter, and an authenticated
scheduled drain route independent of new webhooks. The exact serialized HTTP
body bytes for each adapter — the full wrappers
`{"action":"open","reason":…,"alert":…}` and `{"action":"page","alert":…}` —
are authored once inside the database at breach time and persisted as
`payload_bytes`; `X-Sploot-Payload-Digest` covers exactly those bytes, the
HTTP client re-verifies the digest and transmits the persisted bytes verbatim,
and every retry of a delivery key is byte-identical. The test-only memory
adapter is declared inside tests.

`stripe-recreate-subscriptions.ts` is a sandbox-only recovery tool. It requires
an immutable preincident snapshot with complete customers, active prices,
quantities, currencies, item/default tax rates, coupons, promotion codes,
payment methods, and cross-reference/runtime validation. The snapshot carries
an Ed25519-signed manifest with source reference, capture time, expiry, key ID,
and a SHA-256 digest over its canonical serialized content; serialization
retains every validated field. Current Stripe listings and event-ledger
reconstruction are not recovery sources. The tool defaults to a read-only
plan, and `--apply` requires explicit test-mode confirmation. Recreated writes
use deterministic idempotency keys and `payment_behavior=default_incomplete`.

## SCA and off-session recovery answer

Recreating a Subscription with the same Customer and attached PaymentMethod
does not prove that the original SCA/off-session authorization carries over.
The recovered subscription is therefore allowed to remain incomplete and the
operator/customer must complete the required authentication or setup flow.
This follows Stripe's guidance to authenticate saved payment methods for
off-session use and its documented `default_incomplete` behavior when the
initial invoice requires customer action:

- <https://docs.stripe.com/strong-customer-authentication>
- <https://docs.stripe.com/api/subscriptions/create>
- <https://docs.stripe.com/api/subscriptions/object>

## Mint integration audit

The repository has a production-shaped Stripe webhook route and verifier, but
no live credential, Mint SDK, or provider wiring. Existing Sploot “mint” code
is the unrelated personal upload-token feature. No fake Mint adapter or live
receipt is added. The explicit authority interface is a refused handoff
boundary until an external implementation can prove the caller nonce, exact
requested TTL, lease identity/audience/purpose/resource scope, authenticated
provenance, restricted IP CIDRs, and exact HTTPS egress binding. The Stripe
recovery client pins the Stripe origin, uses `redirect: error`, revalidates
request/response targets, and retries only bounded transient failures with a
stable idempotency key.

The additive ledger schema can land inertly under the existing migration owner
before billing activation; its first migration installs trusted `pgcrypto`
idempotently so later digest backfills do not depend on an undeclared database
prerequisite. Billing activation is a two-authority operation: with
`STRIPE_LEDGER_BOOTSTRAP_REQUIRED=true`, the privileged `migrate-deploy.mjs`
path runs the transactional pre-bootstrap, restricted Prisma migration, and
transactional post-bootstrap; missing either production URL or the bootstrap
authority fails closed. The bootstrap is an explicit
durable state machine (`sploot_bootstrap.stripe_ledger_bootstrap_state`:
`preparing` → `ready`, any failure → `failed`) versioned by the single
declared contract version in `prisma/stripe-ledger-bootstrap.version`, which
every consumer (pre/post SQL via the `bootstrap_version` psql variable, the
helper, and CI assertions) reads from that one file. A failed phase runs the
existence-safe, idempotent rollback; if the rollback itself fails the helper
still writes a last-resort `failed` marker and a durable failure report.
Both phases carry `sploot.stripe_bootstrap_fault` injection hooks. The
pre-bootstrap transfers every pre-existing Prisma-managed public object to the
restricted schema migrator while excluding extension-owned objects; table
grants alone cannot authorize future `ALTER` or `DROP` statements. Canonical
CI installs the pre-Stripe schema as a legacy owner, proves representative DDL
through the restricted migrator, and exercises injected pre/post faults,
rollback, durable failed state, and recovery replay against pg15 and pg16 with
a restricted application role.

Maintenance tokens also bind the exact legal-retention cutoff, reject a cutoff
later than their issuance time, and bind the exact purge subject and time
basis. Purge operations therefore cannot trust a fresh caller-supplied cutoff,
reach across tenants, or reinterpret which timestamp governs retention. The
scheduled drain route reports unresolved dead
letters as unhealthy until replay or replayable recovery clears them.

The route requires `STRIPE_WEBHOOK_SIGNING_SECRET`,
`STRIPE_ALERT_DELIVERY_TOKEN`, `STRIPE_CIRCUIT_ENDPOINT`, and
`STRIPE_PAGE_ENDPOINT`; snapshot apply requires
`RECOVERY_SNAPSHOT_MANIFEST_KEY_ID` and
`RECOVERY_SNAPSHOT_MANIFEST_PUBLIC_KEY`. These are runtime authorities, not
test fixtures.

## Acceptance evidence and residual authority

Repo evidence consists of the sandbox scanner in canonical CI, policy,
snapshot, webhook, durable-ledger, and bounded HTTP tests, real
verifier→Postgres→route composition acceptance (two valid signatures over
identical bytes accepted as one event; forged same-ID bytes refused; exact
byte-identical delivery retries with digests over the sent wrapper bytes; a
two-subject purge adversary), script- and SQL-level bootstrap failure
injection, the Prisma migrations, and the dry-run-only default of the
recovery tool. No live key, Mint lease,
IP allow-list, mass-cancel refusal transcript, real Stripe sandbox recreation,
or external page receipt is claimed here. External residual proof remains:
wire the real Mint verb-scoped authority, prove restricted-key and egress
policy, send signed Stripe test-mode cancellation events through a deployed
verified route, capture circuit/page receipts, and run recovery in Stripe test
mode with the SCA outcome recorded.
