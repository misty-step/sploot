-- Privileged pre-migration bootstrap. Run once as a database administrator;
-- never point DATABASE_URL at this script's owner for application traffic.
-- The application role is deliberately created NOLOGIN here. The operator
-- binds its login/password out of band (or CI uses an ephemeral password); no
-- credential is stored in this repository.
--
-- The entire authority setup is one transaction: either every role, grant,
-- ownership transfer, and the durable 'preparing' marker land together, or
-- nothing does. PostgreSQL supports transactional CREATE ROLE / GRANT /
-- ALTER TABLE OWNER, so a mid-script failure leaves no partial authority.
--
-- Callers MUST pass the single declared contract version:
--   psql --set bootstrap_version="$(cat apps/web/prisma/stripe-ledger-bootstrap.version)" ...
-- An unset variable fails the script immediately (the raw :'bootstrap_version'
-- token is a syntax error under ON_ERROR_STOP).
BEGIN;

SET LOCAL sploot.bootstrap_version = :'bootstrap_version';

DO $$
BEGIN
  IF current_setting('sploot.bootstrap_version', true) !~ '^[0-9]{14}$' THEN
    RAISE EXCEPTION 'bootstrap_version psql variable must be the 14-digit contract version from stripe-ledger-bootstrap.version';
  END IF;
END
$$;

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sploot_stripe_ledger_owner') THEN
    CREATE ROLE sploot_stripe_ledger_owner NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sploot_stripe_schema_migrator') THEN
    CREATE ROLE sploot_stripe_schema_migrator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sploot_stripe_ledger_issuer') THEN
    CREATE ROLE sploot_stripe_ledger_issuer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sploot_stripe_ledger_consumer') THEN
    CREATE ROLE sploot_stripe_ledger_consumer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sploot_stripe_ledger_maintenance') THEN
    CREATE ROLE sploot_stripe_ledger_maintenance NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sploot_stripe_adversary') THEN
    CREATE ROLE sploot_stripe_adversary NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sploot_stripe_app') THEN
    CREATE ROLE sploot_stripe_app NOLOGIN
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

-- Deliberate mid-setup failure hook for atomicity proof. Enabled by running
-- the script under PGOPTIONS="-c sploot.stripe_bootstrap_fault=pre". Because
-- the whole script is one transaction, an injected failure here must leave no
-- roles, no marker, and no grants behind.
DO $$
BEGIN
  IF current_setting('sploot.stripe_bootstrap_fault', true) = 'pre' THEN
    RAISE EXCEPTION 'injected pre-bootstrap fault (sploot.stripe_bootstrap_fault=pre)';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO sploot_stripe_app;
GRANT USAGE, CREATE ON SCHEMA public TO sploot_stripe_schema_migrator;
GRANT USAGE ON SCHEMA public TO sploot_stripe_ledger_issuer, sploot_stripe_ledger_consumer, sploot_stripe_ledger_maintenance;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM sploot_stripe_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM sploot_stripe_app;
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO sploot_stripe_app, sploot_stripe_schema_migrator, sploot_stripe_ledger_issuer, sploot_stripe_ledger_consumer, sploot_stripe_ledger_maintenance', current_database());
END
$$;

-- The app role is never a migration authority. Revoke inherited runtime access
-- before any upgrade DDL runs, including grants left by an older installation.
DO $$
DECLARE fn RECORD;
BEGIN
  FOR fn IN SELECT p.oid::regprocedure AS signature
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, sploot_stripe_app, sploot_stripe_ledger_issuer, sploot_stripe_ledger_consumer, sploot_stripe_ledger_maintenance, sploot_stripe_schema_migrator', fn.signature);
  END LOOP;
END
$$;
DO $$
DECLARE object_name TEXT;
BEGIN
  FOREACH object_name IN ARRAY ARRAY['stripe_cancellation_events','stripe_cancellation_audit','stripe_cancellation_alerts','stripe_cancellation_deliveries','stripe_cancellation_maintenance','stripe_cancellation_maintenance_tokens'] LOOP
    IF to_regclass('public.' || quote_ident(object_name)) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, sploot_stripe_app, sploot_stripe_ledger_issuer, sploot_stripe_ledger_consumer, sploot_stripe_ledger_maintenance', object_name);
    END IF;
  END LOOP;
END
$$;

-- Prisma bookkeeping and every Prisma-managed object are owned by the
-- dedicated migrator. Grants are insufficient for DDL: PostgreSQL requires
-- ownership to ALTER or DROP a pre-existing table. Extension-owned objects are
-- excluded explicitly; their lifecycle remains with CREATE/ALTER EXTENSION and
-- the bootstrap authority. The post-bootstrap restores the narrower ledger
-- owner for the six protected Stripe tables and their SECURITY DEFINER API.
DO $$
DECLARE object RECORD;
BEGIN
  FOR object IN
    SELECT c.relkind, c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p', 'S', 'v', 'm', 'f')
       AND NOT EXISTS (
         SELECT 1 FROM pg_depend d
          WHERE d.classid = 'pg_class'::regclass
            AND d.objid = c.oid
            AND d.deptype = 'e')
     ORDER BY c.relkind, c.relname
  LOOP
    EXECUTE format(
      'ALTER %s public.%I OWNER TO sploot_stripe_schema_migrator',
      CASE object.relkind
        WHEN 'S' THEN 'SEQUENCE'
        WHEN 'v' THEN 'VIEW'
        WHEN 'm' THEN 'MATERIALIZED VIEW'
        WHEN 'f' THEN 'FOREIGN TABLE'
        ELSE 'TABLE'
      END,
      object.relname);
  END LOOP;
END
$$;

DO $$
DECLARE object RECORD;
BEGIN
  FOR object IN
    SELECT p.oid::regprocedure AS signature, p.prokind
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND NOT EXISTS (
         SELECT 1 FROM pg_depend d
          WHERE d.classid = 'pg_proc'::regclass
            AND d.objid = p.oid
            AND d.deptype = 'e')
     ORDER BY p.oid
  LOOP
    EXECUTE format(
      'ALTER %s %s OWNER TO sploot_stripe_schema_migrator',
      CASE object.prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END,
      object.signature);
  END LOOP;
END
$$;

DO $$
DECLARE object RECORD;
BEGIN
  FOR object IN
    SELECT t.oid::regtype AS signature, t.typtype
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public'
       AND t.typtype IN ('d', 'e')
       AND NOT EXISTS (
         SELECT 1 FROM pg_depend d
          WHERE d.classid = 'pg_type'::regclass
            AND d.objid = t.oid
            AND d.deptype = 'e')
     ORDER BY t.oid
  LOOP
    EXECUTE format(
      'ALTER %s %s OWNER TO sploot_stripe_schema_migrator',
      CASE object.typtype WHEN 'd' THEN 'DOMAIN' ELSE 'TYPE' END,
      object.signature);
  END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sploot_stripe_schema_migrator;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO sploot_stripe_schema_migrator;

-- Durable state machine marker: 'preparing' commits together with the
-- completed authority setup above. Later phases: the post-bootstrap commits
-- 'ready'; any failure path commits 'failed' via the rollback script.
CREATE SCHEMA IF NOT EXISTS sploot_bootstrap;
CREATE TABLE IF NOT EXISTS sploot_bootstrap.stripe_ledger_bootstrap_state (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  phase TEXT NOT NULL,
  version TEXT NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ready_digest TEXT
);
INSERT INTO sploot_bootstrap.stripe_ledger_bootstrap_state(id, phase, version)
VALUES (TRUE, 'preparing', current_setting('sploot.bootstrap_version'))
ON CONFLICT (id) DO UPDATE SET phase = 'preparing', version = EXCLUDED.version, updated_at = CURRENT_TIMESTAMP, ready_digest = NULL;

COMMIT;
