#!/usr/bin/env bash
set -euo pipefail

PG_VERSION="${1:?Postgres version is required}"
export PGPASSWORD=test
admin_url='postgresql://test:test@localhost:5432/sploot_upgrade?sslmode=disable'
bootstrap_version="$(cat apps/web/prisma/stripe-ledger-bootstrap.version)"

# 1) Injected pre-bootstrap fault on the truly empty cluster: the
#    transactional authority setup must leave nothing behind.
if PGOPTIONS='-c sploot.stripe_bootstrap_fault=pre' psql "$admin_url" -v ON_ERROR_STOP=1 -v bootstrap_version="$bootstrap_version" -f apps/web/prisma/stripe-ledger-bootstrap-pre.sql; then
  echo 'expected injected pre-bootstrap fault to fail'; exit 1
fi
leftover_roles="$(psql "$admin_url" -Atc "SELECT count(*) FROM pg_roles WHERE rolname LIKE 'sploot_stripe%'")"
test "$leftover_roles" = '0'
leftover_state="$(psql "$admin_url" -Atc "SELECT count(*) FROM pg_tables WHERE tablename='stripe_ledger_bootstrap_state'")"
test "$leftover_state" = '0'

# 1b) Truly fresh restricted-role path. This database has no
# Prisma ledger and receives every migration through Prisma as the
# restricted migrator, including the claim-token migrations.
fresh_db='sploot_fresh'
psql "$admin_url" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${fresh_db}"
fresh_url="postgresql://test:test@localhost:5432/${fresh_db}?sslmode=disable"
# Existing-role drift falsifier: the privileged pre-bootstrap must
# converge, rather than trust, a pre-existing SUPERUSER/INHERIT role
# and remove its membership before granting the runtime contract.
psql "$admin_url" -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE sploot_stripe_app SUPERUSER INHERIT;
GRANT sploot_stripe_app TO test;
SQL
psql "$fresh_url" -v ON_ERROR_STOP=1 -v bootstrap_version="$bootstrap_version" -f apps/web/prisma/stripe-ledger-bootstrap-pre.sql
role_converged="$(psql "$admin_url" -Atc "SELECT NOT (rolsuper OR rolinherit OR rolbypassrls OR rolcreatedb OR rolcreaterole) AND NOT EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.roleid=pg_roles.oid OR m.member=pg_roles.oid) FROM pg_roles WHERE rolname='sploot_stripe_app'")"
test "$role_converged" = 't'
fresh_migrator_password="$(openssl rand -hex 32)"
fresh_app_password="$(openssl rand -hex 32)"
fresh_issuer_password="$(openssl rand -hex 32)"
fresh_consumer_password="$(openssl rand -hex 32)"
psql "$admin_url" -v ON_ERROR_STOP=1 -v app_password="$fresh_app_password" -v migrator_password="$fresh_migrator_password" -v issuer_password="$fresh_issuer_password" -v consumer_password="$fresh_consumer_password" <<'SQL'
ALTER ROLE sploot_stripe_app LOGIN PASSWORD :'app_password';
ALTER ROLE sploot_stripe_schema_migrator LOGIN PASSWORD :'migrator_password';
ALTER ROLE sploot_stripe_ledger_issuer LOGIN PASSWORD :'issuer_password';
ALTER ROLE sploot_stripe_ledger_consumer LOGIN PASSWORD :'consumer_password';
SQL
fresh_migrator_url="postgresql://sploot_stripe_schema_migrator:${fresh_migrator_password}@localhost:5432/${fresh_db}?sslmode=disable"
DATABASE_URL="$fresh_url" \
STRIPE_LEDGER_BOOTSTRAP_REQUIRED=true \
STRIPE_LEDGER_BOOTSTRAP_DATABASE_URL="$fresh_url" \
STRIPE_LEDGER_MIGRATION_DATABASE_URL="$fresh_migrator_url" \
pnpm --filter web exec node scripts/migrate-deploy.mjs

# Replay the additive/validation SQL twice after Prisma's ledger
# commit. This is the real commit-before-ledger uncertainty oracle.
for migration in \
  20260715000000_add_embedding_resilience \
  20260715010000_add_embedding_circuit_generation \
  20260715020000_add_embedding_probe_lease_token \
  20260715030000_enforce_embedding_attempt_ceiling \
  20260715035000_validate_embedding_attempt_ceiling \
  20260715040000_add_embedding_processing_claim_token \
  20260715045000_validate_embedding_processing_claim_token_state \
  20260715050000_cap_embedding_terminal_revivals \
  20260715055000_validate_embedding_revival_budget \
  20260715060000_update_embedding_attempt_ceiling \
  20260715065000_validate_embedding_attempt_ceiling \
  20260715070000_harden_terminal_revival_exit; do
  for replay in 1 2; do
    PGOPTIONS='-c lock_timeout=5s -c statement_timeout=30s' PGPASSWORD="$fresh_migrator_password" psql "$fresh_migrator_url" -v ON_ERROR_STOP=1 -f "apps/web/prisma/migrations/${migration}/migration.sql"
  done
done
psql "$fresh_url" -v ON_ERROR_STOP=1 -v bootstrap_version="$bootstrap_version" -f apps/web/prisma/stripe-ledger-bootstrap-post.sql
fresh_marker="$(psql "$fresh_url" -Atc "SELECT phase || ':' || version FROM sploot_bootstrap.stripe_ledger_bootstrap_state WHERE id=true")"
test "$fresh_marker" = "ready:${bootstrap_version}"
DATABASE_URL="$fresh_url" node apps/web/scripts/assert-final-embedding-schema.mjs

# The online helper uses its own autocommit connection, so exercise
# the timeout on that connection rather than relying on migrate's
# PGOPTIONS. A held old snapshot must falsify the bounded build.
PGPASSWORD="$fresh_migrator_password" psql "$fresh_migrator_url" -v ON_ERROR_STOP=1 -c 'DROP INDEX CONCURRENTLY IF EXISTS public.asset_embeddings_pending_next_attempt_idx'
(
  PGPASSWORD=test psql "$fresh_url" -v ON_ERROR_STOP=1 -c 'BEGIN; SELECT count(*) FROM public.asset_embeddings; SELECT pg_sleep(7); COMMIT;'
) &
index_holder_pid=$!
sleep 1
if EMBEDDING_INDEX_STATEMENT_TIMEOUT=5s PGPASSWORD="$fresh_migrator_password" DATABASE_URL="$fresh_migrator_url" node apps/web/scripts/apply-online-embedding-index.mjs; then
  echo 'expected bounded online-index statement timeout'; exit 1
fi
wait "$index_holder_pid"
PGPASSWORD="$fresh_migrator_password" DATABASE_URL="$fresh_migrator_url" node apps/web/scripts/apply-online-embedding-index.mjs

# Real lock-contention rehearsal: a holder keeps the circuit table
# locked longer than the migration's bounded timeout. The replay
# must fail fast rather than queue an ACCESS EXCLUSIVE lock.
(
  PGPASSWORD=test psql "$fresh_url" -v ON_ERROR_STOP=1 -c 'BEGIN; LOCK TABLE public.embedding_provider_circuits IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(7); COMMIT;'
) &
holder_pid=$!
sleep 1
if PGOPTIONS='-c lock_timeout=1s -c statement_timeout=5s' PGPASSWORD="$fresh_migrator_password" psql "$fresh_migrator_url" -v ON_ERROR_STOP=1 -f apps/web/prisma/migrations/20260715010000_add_embedding_circuit_generation/migration.sql; then
  echo 'expected bounded lock timeout during migration replay'; exit 1
fi
wait "$holder_pid"

# Rehearse the other initial additive migrations on their actual
# tables too. Their immutable SQL is protected by the migration
# runner's bounded PGOPTIONS; a held lock must still fail closed.
(
  PGPASSWORD=test psql "$fresh_url" -v ON_ERROR_STOP=1 -c 'BEGIN; LOCK TABLE public.asset_embeddings IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(7); COMMIT;'
) &
asset_holder_pid=$!
sleep 1
if PGOPTIONS='-c lock_timeout=1s -c statement_timeout=5s' PGPASSWORD="$fresh_migrator_password" psql "$fresh_migrator_url" -v ON_ERROR_STOP=1 -f apps/web/prisma/migrations/20260715000000_add_embedding_resilience/migration.sql; then
  echo 'expected bounded lock timeout during resilience migration replay'; exit 1
fi
wait "$asset_holder_pid"

(
  PGPASSWORD=test psql "$fresh_url" -v ON_ERROR_STOP=1 -c 'BEGIN; LOCK TABLE public.embedding_provider_circuits IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(7); COMMIT;'
) &
probe_holder_pid=$!
sleep 1
if PGOPTIONS='-c lock_timeout=1s -c statement_timeout=5s' PGPASSWORD="$fresh_migrator_password" psql "$fresh_migrator_url" -v ON_ERROR_STOP=1 -f apps/web/prisma/migrations/20260715020000_add_embedding_probe_lease_token/migration.sql; then
  echo 'expected bounded lock timeout during probe migration replay'; exit 1
fi
wait "$probe_holder_pid"

# 2) Real upgrade flow: install every pre-Stripe migration as the
#    legacy owner, record it in Prisma's ledger, then prove the
#    restricted migrator can evolve that existing schema.
for migration in apps/web/prisma/migrations/*; do
  [[ -d "$migration" ]] || continue
  migration_name="$(basename "$migration")"
  if [[ "$migration_name" == 20260715* ]]; then continue; fi
  psql "$admin_url" -v ON_ERROR_STOP=1 -f "$migration/migration.sql"
  DATABASE_URL="$admin_url" pnpm --filter web exec prisma migrate resolve --applied "$migration_name"
done

# Seed representative rows after the legacy schema is installed but
# before the restricted role executes the new embedding migrations.
# The upgrade must preserve data and later ownership/definitions.
psql "$admin_url" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.users (id, email, "createdAt", "updatedAt") VALUES ('legacy-upgrade-user', 'legacy-upgrade@example.invalid', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.assets (id, owner_user_id, blob_url, pathname, mime, size, checksum_sha256, "createdAt", "updatedAt")
VALUES ('legacy-upgrade-asset', 'legacy-upgrade-user', 'https://legacy.public.blob.vercel-storage.com/legacy.png', 'legacy.png', 'image/png', 7, 'legacy-upgrade-checksum', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.asset_embeddings (asset_id, model_name, model_version, dim, status, "createdAt", "updatedAt")
VALUES ('legacy-upgrade-asset', 'legacy-model', 'legacy-v1', 768, 'processing', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.embedding_rate_buckets (key, count, expires_at)
VALUES ('embedding:daily:legacy', 4, CURRENT_TIMESTAMP + INTERVAL '1 day');
INSERT INTO public.embedding_rate_leases (id, user_id, expires_at)
VALUES ('legacy-upgrade-lease', 'legacy-upgrade-user', CURRENT_TIMESTAMP + INTERVAL '5 minutes');
INSERT INTO public.stripe_cancellation_events
  (event_id, event_type, created_epoch, payload_digest, raw_body_digest, raw_payload,
   raw_body_ciphertext, raw_body_nonce, raw_body_key_id, signature_header_digest,
   livemode, account_id, object_id, object_type, signature_timestamp)
VALUES
  ('legacy-upgrade-event', 'customer.subscription.deleted', 1700000000, 'legacy-payload-digest',
   'legacy-raw-digest', '{"legacy":true}'::jsonb, decode('00', 'hex'), decode('01', 'hex'),
   'legacy-key', 'legacy-signature-digest', false, 'acct_legacy', 'sub_legacy', 'subscription', 1700000000);
INSERT INTO public.stripe_cancellation_alerts
  (alert_key, window_start, window_seconds, count, event_ids, created_at, updated_at)
VALUES ('legacy-upgrade-alert', 1700000000, 3600, 1, '["legacy-upgrade-event"]'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.stripe_cancellation_audit
  (id, event_id, alert_key, action, provenance_digest, details)
VALUES ('legacy-upgrade-audit', 'legacy-upgrade-event', 'legacy-upgrade-alert', 'observe', 'legacy-audit-digest', '{"legacy":true}'::jsonb);
INSERT INTO public.stripe_cancellation_deliveries
  (delivery_key, alert_key, adapter, status, next_attempt_at, replay_key, payload_digest,
   payload_version, payload, payload_bytes, created_at, updated_at)
VALUES ('legacy-upgrade-delivery', 'legacy-upgrade-alert', 'circuit', 'pending', CURRENT_TIMESTAMP,
        'legacy-upgrade-replay', 'legacy-delivery-digest', 'stripe-cancellation-http-v1',
        '{"legacy":true}'::jsonb, '{"legacy":true}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO public.stripe_cancellation_maintenance
  (id, actor, reason, purged_count, purged_digest, record_digest)
VALUES ('legacy-upgrade-maintenance', 'legacy-upgrade-operator', 'upgrade rehearsal', 0, 'legacy-purged-digest', 'legacy-record-digest');
INSERT INTO public.stripe_cancellation_maintenance_tokens
  (token_digest, generation, actor, purpose, range_start, range_end, legal_minimum_since,
   issued_at, expires_at, subject_kind, subject_id, time_basis)
VALUES ('legacy-upgrade-token', 1, 'legacy-upgrade-operator', 'upgrade rehearsal',
        CURRENT_TIMESTAMP - INTERVAL '1 hour', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP - INTERVAL '1 day',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 hour', 'account', 'acct_legacy', 'created_at');
SQL

psql "$admin_url" -v ON_ERROR_STOP=1 -v bootstrap_version="$bootstrap_version" -f apps/web/prisma/stripe-ledger-bootstrap-pre.sql
marker="$(psql "$admin_url" -Atc "SELECT phase || ':' || version FROM sploot_bootstrap.stripe_ledger_bootstrap_state WHERE id=true")"
test "$marker" = "preparing:${bootstrap_version}"
app_password="$(openssl rand -hex 32)"
migrator_password="$(openssl rand -hex 32)"
issuer_password="$(openssl rand -hex 32)"
consumer_password="$(openssl rand -hex 32)"
psql "$admin_url" -v ON_ERROR_STOP=1 -v app_password="$app_password" -v migrator_password="$migrator_password" -v issuer_password="$issuer_password" -v consumer_password="$consumer_password" <<'SQL'
ALTER ROLE sploot_stripe_app LOGIN PASSWORD :'app_password';
ALTER ROLE sploot_stripe_schema_migrator LOGIN PASSWORD :'migrator_password';
ALTER ROLE sploot_stripe_ledger_issuer LOGIN PASSWORD :'issuer_password';
ALTER ROLE sploot_stripe_ledger_consumer LOGIN PASSWORD :'consumer_password';
SQL
DATABASE_URL="$admin_url" \
STRIPE_LEDGER_BOOTSTRAP_REQUIRED=true \
STRIPE_LEDGER_BOOTSTRAP_DATABASE_URL="$admin_url" \
STRIPE_LEDGER_MIGRATION_DATABASE_URL="postgresql://sploot_stripe_schema_migrator:${migrator_password}@localhost:5432/sploot_upgrade?sslmode=disable" \
pnpm --filter web exec node scripts/migrate-deploy.mjs

# Ownership, not a table grant, is the durable migration oracle.
# Exercise representative future DDL against an object that existed
# before Stripe, then roll it back so the fixture stays canonical.
PGPASSWORD="$migrator_password" psql "postgresql://sploot_stripe_schema_migrator:${migrator_password}@localhost:5432/sploot_upgrade?sslmode=disable" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
ALTER TABLE public.users ADD COLUMN stripe_authority_probe TEXT;
ROLLBACK;
SQL

# 3) Injected post-bootstrap replay fault: the transaction must abort
#    without changing the last committed ready marker, and the
#    existence-safe rollback must then commit a durable failed state.
marker_before_fault="$(psql "$admin_url" -Atc "SELECT phase || ':' || version || ':' || COALESCE(ready_digest, '') FROM sploot_bootstrap.stripe_ledger_bootstrap_state WHERE id=true")"
if PGOPTIONS='-c sploot.stripe_bootstrap_fault=post' psql "$admin_url" -v ON_ERROR_STOP=1 -v bootstrap_version="$bootstrap_version" -f apps/web/prisma/stripe-ledger-bootstrap-post.sql; then
  echo 'expected injected post-bootstrap fault to fail'; exit 1
fi
marker_after_fault="$(psql "$admin_url" -Atc "SELECT phase || ':' || version || ':' || COALESCE(ready_digest, '') FROM sploot_bootstrap.stripe_ledger_bootstrap_state WHERE id=true")"
test "$marker_after_fault" = "$marker_before_fault"
psql "$admin_url" -v ON_ERROR_STOP=1 -f apps/web/prisma/stripe-ledger-bootstrap-rollback.sql
marker="$(psql "$admin_url" -Atc "SELECT phase FROM sploot_bootstrap.stripe_ledger_bootstrap_state WHERE id=true")"
test "$marker" = 'failed'
# Rollback is idempotent: a second run must also succeed.
psql "$admin_url" -v ON_ERROR_STOP=1 -f apps/web/prisma/stripe-ledger-bootstrap-rollback.sql

# 4) Recovery replay: a clean post run after the failed attempt
#    reaches 'ready' at the declared contract version.
psql "$admin_url" -v ON_ERROR_STOP=1 -v bootstrap_version="$bootstrap_version" -f apps/web/prisma/stripe-ledger-bootstrap-post.sql
marker="$(psql "$admin_url" -Atc "SELECT phase || ':' || version FROM sploot_bootstrap.stripe_ledger_bootstrap_state WHERE id=true")"
test "$marker" = "ready:${bootstrap_version}"
DATABASE_URL="$admin_url" node apps/web/scripts/assert-final-embedding-schema.mjs
legacy_embedding="$(psql "$admin_url" -Atc "SELECT model_name || ':' || model_version || ':' || status || ':' || attempt_count FROM public.asset_embeddings WHERE asset_id='legacy-upgrade-asset'")"
test "$legacy_embedding" = 'legacy-model:legacy-v1:processing:0'
legacy_bucket_count="$(psql "$admin_url" -Atc "SELECT count(*) FROM public.embedding_rate_buckets WHERE key='embedding:daily:legacy' AND count=4")"
test "$legacy_bucket_count" = '1'
legacy_lease_count="$(psql "$admin_url" -Atc "SELECT count(*) FROM public.embedding_rate_leases WHERE id='legacy-upgrade-lease'")"
test "$legacy_lease_count" = '1'
legacy_stripe_count="$(psql "$admin_url" -Atc "SELECT count(*) FROM public.stripe_cancellation_events e JOIN public.stripe_cancellation_deliveries d ON d.delivery_key='legacy-upgrade-delivery' WHERE e.event_id='legacy-upgrade-event' AND d.payload->>'legacy' = 'true'")"
test "$legacy_stripe_count" = '1'
public_exec="$(psql "$admin_url" -Atc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef AND EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')")"
test "$public_exec" = '0'
app_ledger_dml="$(PGPASSWORD="$app_password" psql "postgresql://sploot_stripe_app:${app_password}@localhost:5432/sploot_upgrade?sslmode=disable" -Atc "SELECT has_table_privilege(current_user, 'public.stripe_cancellation_deliveries', 'INSERT') OR has_table_privilege(current_user, 'public.stripe_cancellation_deliveries', 'UPDATE') OR has_table_privilege(current_user, 'public.stripe_cancellation_deliveries', 'DELETE')")"
test "$app_ledger_dml" = 'f'
app_url="postgresql://sploot_stripe_app:${app_password}@localhost:5432/sploot_upgrade?sslmode=disable"
app_bootstrap_marker="$(PGPASSWORD="$app_password" psql "$app_url" -Atc "SELECT phase || ':' || version FROM sploot_bootstrap.stripe_ledger_bootstrap_state WHERE id=true")"
test "$app_bootstrap_marker" = "ready:${bootstrap_version}"
app_bootstrap_mutation="$(PGPASSWORD="$app_password" psql "$app_url" -Atc "SELECT has_table_privilege(current_user, 'sploot_bootstrap.stripe_ledger_bootstrap_state', 'INSERT,UPDATE,DELETE') OR has_table_privilege(current_user, 'public._prisma_migrations', 'INSERT,UPDATE,DELETE')")"
test "$app_bootstrap_mutation" = 'f'
health_port="$((3100 + $PG_VERSION))"
DATABASE_URL="$app_url" \
STRIPE_LEDGER_BOOTSTRAP_REQUIRED=true \
SPLOOT_DEPLOYMENT_ENV=test \
pnpm --filter web exec next dev --hostname 127.0.0.1 --port "$health_port" >/tmp/sploot-health-$PG_VERSION.log 2>&1 &
health_pid=$!
trap 'kill "$health_pid" 2>/dev/null || true' EXIT
health_json=''
for _ in $(seq 1 60); do
  if health_json="$(curl --fail --silent --show-error "http://127.0.0.1:${health_port}/api/health" 2>/dev/null)"; then break; fi
  sleep 1
done
if [[ -z "$health_json" ]]; then echo "health readiness never returned HTTP 200 on port $health_port" >&2; cat "/tmp/sploot-health-$PG_VERSION.log" >&2; exit 1; fi
HEALTH_JSON="$health_json" node -e 'try { const h=JSON.parse(process.env.HEALTH_JSON); if(h.status!=="ok"||h.dependencies?.database!=="up"||h.dependencies?.embedding_limiter!=="up") { console.error("unexpected health payload:", process.env.HEALTH_JSON); process.exit(1); } } catch (error) { console.error("invalid health payload:", process.env.HEALTH_JSON, error); process.exit(1); }'
kill "$health_pid"
wait "$health_pid" 2>/dev/null || true
trap - EXIT

# Flag-absent app-role readback: production runs without
# STRIPE_LEDGER_BOOTSTRAP_REQUIRED until billing activates, so the
# same restricted role must report healthy without referencing the
# marker, and the liveness routing probe must answer from the real
# Next server (incident 2026-07-15: platform routing must never
# depend on the deep DB oracle).
absent_port="$((3200 + $PG_VERSION))"
DATABASE_URL="$app_url" \
SPLOOT_DEPLOYMENT_ENV=test \
pnpm --filter web exec next dev --hostname 127.0.0.1 --port "$absent_port" >/tmp/sploot-health-absent-$PG_VERSION.log 2>&1 &
absent_pid=$!
trap 'kill "$absent_pid" 2>/dev/null || true' EXIT
absent_json=''
for _ in $(seq 1 60); do
  if absent_json="$(curl --fail --silent --show-error "http://127.0.0.1:${absent_port}/api/health" 2>/dev/null)"; then break; fi
  sleep 1
done
if [[ -z "$absent_json" ]]; then echo "absent-flag health readiness never returned HTTP 200 on port $absent_port" >&2; cat "/tmp/sploot-health-absent-$PG_VERSION.log" >&2; exit 1; fi
HEALTH_JSON="$absent_json" node -e 'const h=JSON.parse(process.env.HEALTH_JSON); if(h.status!=="ok"||h.dependencies?.database!=="up"||h.dependencies?.embedding_limiter!=="up") process.exit(1)'
absent_live_json="$(curl --fail --silent --show-error "http://127.0.0.1:${absent_port}/api/health/live")"
HEALTH_JSON="$absent_live_json" node -e 'const h=JSON.parse(process.env.HEALTH_JSON); if(h.status!=="alive"||h.service!=="sploot-web") process.exit(1)'
kill "$absent_pid"
wait "$absent_pid" 2>/dev/null || true
trap - EXIT

# Fresh/no-bootstrap production shape: flag absent AND no Stripe
# bootstrap anywhere. The deploy-owned runner (including the
# pg-client migration-history gate, which must need no psql binary)
# succeeds with only DATABASE_URL, and the real Next server reports
# deep health 200 without referencing the intentionally absent
# bootstrap marker.
plain_db='sploot_plain'
psql "$admin_url" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${plain_db}"
plain_url="postgresql://test:test@localhost:5432/${plain_db}?sslmode=disable"
DATABASE_URL="$plain_url" pnpm --filter web exec node scripts/migrate-deploy.mjs
DATABASE_URL="$plain_url" node scripts/check-migration-history.mjs
plain_bootstrap="$(psql "$plain_url" -Atc "SELECT count(*) FROM pg_namespace WHERE nspname='sploot_bootstrap'")"
test "$plain_bootstrap" = '0'
plain_port="$((3300 + $PG_VERSION))"
DATABASE_URL="$plain_url" \
SPLOOT_DEPLOYMENT_ENV=test \
pnpm --filter web exec next dev --hostname 127.0.0.1 --port "$plain_port" >/tmp/sploot-health-plain-$PG_VERSION.log 2>&1 &
plain_pid=$!
trap 'kill "$plain_pid" 2>/dev/null || true' EXIT
plain_json=''
for _ in $(seq 1 60); do
  if plain_json="$(curl --fail --silent --show-error "http://127.0.0.1:${plain_port}/api/health" 2>/dev/null)"; then break; fi
  sleep 1
done
if [[ -z "$plain_json" ]]; then echo "plain health readiness never returned HTTP 200 on port $plain_port" >&2; cat "/tmp/sploot-health-plain-$PG_VERSION.log" >&2; exit 1; fi
HEALTH_JSON="$plain_json" node -e 'const h=JSON.parse(process.env.HEALTH_JSON); if(h.status!=="ok"||h.dependencies?.database!=="up"||h.dependencies?.embedding_limiter!=="up") process.exit(1)'
plain_live_json="$(curl --fail --silent --show-error "http://127.0.0.1:${plain_port}/api/health/live")"
HEALTH_JSON="$plain_live_json" node -e 'const h=JSON.parse(process.env.HEALTH_JSON); if(h.status!=="alive"||h.service!=="sploot-web") process.exit(1)'
kill "$plain_pid"
wait "$plain_pid" 2>/dev/null || true
trap - EXIT
legacy_owner="$(psql "$admin_url" -Atc "SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.users'::regclass")"
test "$legacy_owner" = 'sploot_stripe_schema_migrator'
vector_owner="$(psql "$admin_url" -Atc "SELECT pg_get_userbyid(t.typowner) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='vector'")"
test "$vector_owner" != 'sploot_stripe_schema_migrator'
