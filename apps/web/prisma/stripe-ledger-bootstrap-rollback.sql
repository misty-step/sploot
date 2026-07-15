-- Fail-closed rollback for a partially completed privileged bootstrap. It
-- removes runtime mutation authority and marks the database unsafe; it does
-- not pretend to reverse arbitrary Prisma DDL.
--
-- This script must succeed from ANY partial state: a fresh database where the
-- fault fired before any object existed, a mid-install failure, or a repeat
-- invocation. Statements therefore run in autocommit (no global transaction)
-- with the durable 'failed' marker FIRST, and every revocation is
-- existence-guarded so an absent object or role can never abort the marker.

-- 1) Durable failed state, committed before anything else is attempted.
CREATE SCHEMA IF NOT EXISTS sploot_bootstrap;
CREATE TABLE IF NOT EXISTS sploot_bootstrap.stripe_ledger_bootstrap_state (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  phase TEXT NOT NULL,
  version TEXT NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ready_digest TEXT
);
INSERT INTO sploot_bootstrap.stripe_ledger_bootstrap_state(id, phase, version)
VALUES (TRUE, 'failed', 'unknown')
ON CONFLICT (id) DO UPDATE SET phase = 'failed', updated_at = CURRENT_TIMESTAMP, ready_digest = NULL;

-- 2) Revoke runtime authority from whatever subset of objects and roles
--    actually exists. Function signatures are discovered dynamically so old
--    and new overloads are both covered; missing roles or tables are skipped.
DO $$
DECLARE
  present_roles TEXT;
  object_name TEXT;
  fn RECORD;
BEGIN
  SELECT string_agg(quote_ident(rolname), ', ') INTO present_roles
    FROM pg_roles
   WHERE rolname IN ('sploot_stripe_app', 'sploot_stripe_schema_migrator', 'sploot_stripe_ledger_issuer', 'sploot_stripe_ledger_consumer', 'sploot_stripe_ledger_maintenance', 'sploot_stripe_adversary');

  FOREACH object_name IN ARRAY ARRAY['stripe_cancellation_events','stripe_cancellation_audit','stripe_cancellation_alerts','stripe_cancellation_deliveries','stripe_cancellation_maintenance','stripe_cancellation_maintenance_tokens'] LOOP
    IF to_regclass('public.' || quote_ident(object_name)) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', object_name);
      IF present_roles IS NOT NULL THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %s', object_name, present_roles);
      END IF;
    END IF;
  END LOOP;

  FOR fn IN SELECT p.oid::regprocedure AS signature
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND (p.prosecdef OR p.proname LIKE 'sploot\_%')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.signature);
    IF present_roles IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s', fn.signature, present_roles);
    END IF;
  END LOOP;
END
$$;
