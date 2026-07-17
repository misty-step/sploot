-- Privileged post-migration bootstrap. Run as the separately held bootstrap
-- authority after restricted Prisma migrations. This script is idempotent and
-- leaves the marker non-ready until every owner, function, trigger, and grant
-- has been installed successfully.
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
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sploot_stripe_ledger_owner')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sploot_stripe_ledger_issuer')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sploot_stripe_ledger_consumer')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sploot_stripe_ledger_maintenance')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sploot_stripe_app') THEN
    RAISE EXCEPTION 'Stripe ledger privileged roles are incomplete';
  END IF;
  -- Schema is Prisma-owned. The privileged script asserts it, never creates it.
  IF to_regclass('public.stripe_cancellation_events') IS NULL
     OR to_regclass('public.stripe_cancellation_audit') IS NULL
     OR to_regclass('public.stripe_cancellation_alerts') IS NULL
     OR to_regclass('public.stripe_cancellation_deliveries') IS NULL
     OR to_regclass('public.stripe_cancellation_maintenance') IS NULL
     OR to_regclass('public.stripe_cancellation_maintenance_tokens') IS NULL THEN
    RAISE EXCEPTION 'Stripe ledger migrations are incomplete';
  END IF;
  -- The embedding resilience migrations must precede this authority contract:
  -- the runtime app role is granted DML on the provider circuit below.
  IF to_regclass('public.embedding_provider_circuits') IS NULL THEN
    RAISE EXCEPTION 'Embedding resilience migrations are incomplete';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'stripe_cancellation_maintenance_tokens' AND column_name = 'legal_minimum_since')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'stripe_cancellation_maintenance_tokens' AND column_name = 'subject_kind')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'stripe_cancellation_maintenance_tokens' AND column_name = 'subject_id')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'stripe_cancellation_maintenance_tokens' AND column_name = 'time_basis')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'stripe_cancellation_deliveries' AND column_name = 'payload_bytes') THEN
    RAISE EXCEPTION 'Stripe ledger migrations are behind the declared bootstrap contract version';
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS sploot_bootstrap;
CREATE TABLE IF NOT EXISTS sploot_bootstrap.stripe_ledger_bootstrap_state (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  phase TEXT NOT NULL,
  version TEXT NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ready_digest TEXT
);
INSERT INTO sploot_bootstrap.stripe_ledger_bootstrap_state(id, phase, version)
VALUES (TRUE, 'installing', current_setting('sploot.bootstrap_version'))
ON CONFLICT (id) DO UPDATE SET phase = 'installing', version = EXCLUDED.version, updated_at = CURRENT_TIMESTAMP, ready_digest = NULL;

ALTER TABLE public.stripe_cancellation_events OWNER TO sploot_stripe_ledger_owner;
ALTER TABLE public.stripe_cancellation_audit OWNER TO sploot_stripe_ledger_owner;
ALTER TABLE public.stripe_cancellation_alerts OWNER TO sploot_stripe_ledger_owner;
ALTER TABLE public.stripe_cancellation_deliveries OWNER TO sploot_stripe_ledger_owner;
ALTER TABLE public.stripe_cancellation_maintenance OWNER TO sploot_stripe_ledger_owner;
ALTER TABLE public.stripe_cancellation_maintenance_tokens OWNER TO sploot_stripe_ledger_owner;
ALTER TABLE sploot_bootstrap.stripe_ledger_bootstrap_state OWNER TO sploot_stripe_ledger_owner;
REVOKE ALL ON SCHEMA sploot_bootstrap FROM PUBLIC;
REVOKE ALL ON TABLE sploot_bootstrap.stripe_ledger_bootstrap_state FROM PUBLIC, sploot_stripe_app;
GRANT USAGE ON SCHEMA sploot_bootstrap TO sploot_stripe_app;
GRANT SELECT ON TABLE sploot_bootstrap.stripe_ledger_bootstrap_state TO sploot_stripe_app;

-- Deliberate mid-install failure hook for rollback/recovery proof. Enabled by
-- running the script under PGOPTIONS="-c sploot.stripe_bootstrap_fault=post".
DO $$
BEGIN
  IF current_setting('sploot.stripe_bootstrap_fault', true) = 'post' THEN
    RAISE EXCEPTION 'injected post-bootstrap fault (sploot.stripe_bootstrap_fault=post)';
  END IF;
END
$$;

-- Remove superseded paper-contract overloads before installing the
-- authority-fenced signatures. This also prevents an old PUBLIC EXECUTE grant
-- from surviving an upgrade, and clears functions whose OUT columns changed
-- (CREATE OR REPLACE cannot alter a return type).
DROP FUNCTION IF EXISTS public.sploot_append_stripe_event(TEXT,TEXT,INTEGER,BOOLEAN,TEXT,TEXT,TEXT,INTEGER,JSONB,TEXT,TEXT);
DROP FUNCTION IF EXISTS public.sploot_record_stripe_cancellation(TEXT,TEXT,INTEGER,BOOLEAN,TEXT,TEXT,TEXT,INTEGER,JSONB,TEXT,TEXT,BYTEA,BYTEA,TEXT,TEXT,INTEGER,INTEGER,INTEGER);
DROP FUNCTION IF EXISTS public.sploot_stripe_claim_deliveries(TEXT,INTEGER,INTEGER,TEXT);
DROP FUNCTION IF EXISTS public.sploot_stripe_drain_deliveries(INTEGER,INTEGER,TEXT);
DROP FUNCTION IF EXISTS public.sploot_issue_stripe_maintenance_token(TEXT,INTEGER,TEXT,TEXT,TIMESTAMP(3),TIMESTAMP(3),TIMESTAMP(3),TIMESTAMP(3),TIMESTAMP(3));
DROP FUNCTION IF EXISTS public.sploot_issue_stripe_maintenance_token(TEXT,INTEGER,TEXT,TEXT,TEXT,TEXT,TIMESTAMP(3),TIMESTAMP(3),TIMESTAMP(3),TIMESTAMP(3),TIMESTAMP(3));
DROP FUNCTION IF EXISTS public.sploot_purge_stripe_audit(TEXT,TEXT,TEXT,TIMESTAMP(3),TIMESTAMP(3));
DROP FUNCTION IF EXISTS public.sploot_purge_stripe_audit(TEXT,TEXT,TEXT,TIMESTAMP(3),TIMESTAMP(3),TIMESTAMP(3));
DROP FUNCTION IF EXISTS public.sploot_purge_stripe_audit(TEXT,INTEGER,TEXT,TEXT,TIMESTAMP(3),TIMESTAMP(3),TIMESTAMP(3));
DROP FUNCTION IF EXISTS public.sploot_purge_stripe_raw_provenance(TEXT,TEXT,TEXT,TIMESTAMP(3),TIMESTAMP(3),TIMESTAMP(3));
DROP FUNCTION IF EXISTS public.sploot_purge_stripe_raw_provenance(TEXT,INTEGER,TEXT,TEXT,TIMESTAMP(3),TIMESTAMP(3),TIMESTAMP(3));

CREATE OR REPLACE FUNCTION public.sploot_append_stripe_event(
  p_event_id TEXT, p_event_type TEXT, p_created_epoch INTEGER, p_livemode BOOLEAN,
  p_account_id TEXT, p_object_id TEXT, p_object_type TEXT, p_signature_timestamp INTEGER,
  p_raw_payload JSONB, p_payload_digest TEXT, p_raw_body_digest TEXT,
  p_raw_body_ciphertext BYTEA, p_raw_body_nonce BYTEA, p_raw_body_key_id TEXT,
  p_signature_header_digest TEXT
)
RETURNS TABLE(event_id TEXT, payload_digest TEXT, raw_body_digest TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE existing RECORD;
BEGIN
  IF session_user <> 'sploot_stripe_ledger_issuer' THEN RAISE EXCEPTION 'Stripe event append requires the issuer role'; END IF;
  IF p_event_id IS NULL OR btrim(p_event_id) = '' OR p_event_type IS NULL OR btrim(p_event_type) = ''
     OR p_created_epoch < 0 OR p_object_id IS NULL OR btrim(p_object_id) = ''
     OR p_object_type IS NULL OR btrim(p_object_type) = '' OR p_signature_timestamp < 0
     OR p_raw_payload IS NULL OR p_payload_digest !~ '^[0-9a-f]{64}$' OR p_raw_body_digest !~ '^[0-9a-f]{64}$'
     OR p_raw_body_ciphertext IS NULL OR octet_length(p_raw_body_nonce) <> 12
     OR p_raw_body_key_id IS NULL OR btrim(p_raw_body_key_id) = ''
     OR p_signature_header_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Stripe event provenance is incomplete';
  END IF;
  SELECT e.* INTO existing FROM public.stripe_cancellation_events AS e WHERE e.event_id = p_event_id FOR UPDATE;
  IF FOUND THEN
    -- Idempotency authority is the verified event ID plus the exact
    -- authenticated event bytes (raw body digest and canonical payload
    -- digest). A legitimate Stripe retry re-sends identical bytes under a
    -- fresh timestamp and signature header, so the signature header digest is
    -- deliberately NOT part of the identity check; it is retained below as
    -- separate signature audit.
    IF existing.payload_digest <> p_payload_digest OR existing.raw_body_digest <> p_raw_body_digest THEN
      RAISE EXCEPTION 'Stripe event ID was replayed with different authenticated bytes';
    END IF;
    INSERT INTO public.stripe_cancellation_audit(id, event_id, action, provenance_digest, details)
      VALUES (public.gen_random_uuid()::TEXT, p_event_id, 'event-deduplicated', p_raw_body_digest,
              jsonb_build_object(
                'event_type', p_event_type,
                'stored_signature_header_digest', existing.signature_header_digest,
                'retry_signature_header_digest', p_signature_header_digest,
                'retry_signature_timestamp', p_signature_timestamp,
                'signature_header_changed', existing.signature_header_digest <> p_signature_header_digest));
  ELSE
    INSERT INTO public.stripe_cancellation_events(
      event_id, event_type, created_epoch, payload_digest, raw_body_digest, raw_payload,
      raw_body_ciphertext, raw_body_nonce, raw_body_key_id, signature_header_digest,
      livemode, account_id, object_id, object_type, signature_timestamp
    ) VALUES (
      p_event_id, p_event_type, p_created_epoch, p_payload_digest, p_raw_body_digest, p_raw_payload,
      p_raw_body_ciphertext, p_raw_body_nonce, p_raw_body_key_id, p_signature_header_digest,
      p_livemode, p_account_id, p_object_id, p_object_type, p_signature_timestamp
    );
    INSERT INTO public.stripe_cancellation_audit(id, event_id, action, provenance_digest, details)
      VALUES (public.gen_random_uuid()::TEXT, p_event_id, 'event-recorded', p_raw_body_digest,
              jsonb_build_object('event_type', p_event_type, 'livemode', p_livemode, 'account_id', p_account_id, 'object_id', p_object_id, 'object_type', p_object_type, 'signature_header_digest', p_signature_header_digest));
  END IF;
  RETURN QUERY SELECT p_event_id, p_payload_digest, p_raw_body_digest;
END
$$;

CREATE OR REPLACE FUNCTION public.sploot_record_stripe_cancellation(
  p_event_id TEXT, p_event_type TEXT, p_created_epoch INTEGER, p_livemode BOOLEAN,
  p_account_id TEXT, p_object_id TEXT, p_object_type TEXT, p_signature_timestamp INTEGER,
  p_raw_payload JSONB, p_payload_digest TEXT, p_raw_body_digest TEXT,
  p_raw_body_ciphertext BYTEA, p_raw_body_nonce BYTEA, p_raw_body_key_id TEXT,
  p_signature_header_digest TEXT, p_reason TEXT, p_max_cancellations INTEGER,
  p_window_seconds INTEGER, p_now INTEGER
)
RETURNS TABLE(alert_key TEXT, cancellation_count INTEGER, event_ids JSONB, breach BOOLEAN, circuit_opened BOOLEAN, page_sent BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE observed RECORD; current_alert RECORD; alert_payload JSONB; computed_alert_key TEXT;
        circuit_wrapper JSONB; page_wrapper JSONB; circuit_bytes TEXT; page_bytes TEXT;
BEGIN
  IF session_user <> 'sploot_stripe_ledger_issuer' THEN RAISE EXCEPTION 'Stripe cancellation recording requires the issuer role'; END IF;
  IF p_max_cancellations IS NULL OR p_max_cancellations < 0 OR p_window_seconds IS NULL OR p_window_seconds <= 0 OR p_now IS NULL OR p_now < 0 THEN RAISE EXCEPTION 'Stripe cancellation bounds are invalid'; END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' OR length(p_reason) > 200 THEN RAISE EXCEPTION 'Stripe cancellation alert reason is invalid'; END IF;
  PERFORM pg_advisory_xact_lock(pg_catalog.hashtext('sploot:stripe-cancellation-ledger:v3'));
  PERFORM * FROM public.sploot_append_stripe_event(p_event_id, p_event_type, p_created_epoch, p_livemode, p_account_id, p_object_id, p_object_type, p_signature_timestamp, p_raw_payload, p_payload_digest, p_raw_body_digest, p_raw_body_ciphertext, p_raw_body_nonce, p_raw_body_key_id, p_signature_header_digest);
  SELECT count(*)::INTEGER AS count,
         COALESCE(jsonb_agg(event_id ORDER BY created_epoch, event_id), '[]'::jsonb) AS ids
    INTO observed
    FROM public.stripe_cancellation_events
   WHERE event_type = 'customer.subscription.deleted'
     AND created_epoch BETWEEN p_now - p_window_seconds AND p_now;
  IF observed.count <= p_max_cancellations THEN
    RETURN QUERY SELECT NULL::TEXT, observed.count, observed.ids, FALSE, FALSE, FALSE;
    RETURN;
  END IF;
  computed_alert_key := 'stripe-cancellation:' || (pg_catalog.floor(p_now::NUMERIC / p_window_seconds) * p_window_seconds)::INTEGER || ':' || p_window_seconds;
  alert_payload := jsonb_build_object('alert_key', computed_alert_key, 'count', observed.count, 'event_ids', observed.ids, 'max_cancellations', p_max_cancellations, 'window_seconds', p_window_seconds, 'reason', p_reason);
  -- The exact serialized HTTP body bytes are authored here, once, per adapter
  -- wrapper. The digest covers exactly these bytes; the HTTP client sends the
  -- persisted bytes verbatim, so every retry is byte-identical.
  circuit_wrapper := jsonb_build_object('action', 'open', 'reason', p_reason, 'alert', alert_payload);
  page_wrapper := jsonb_build_object('action', 'page', 'alert', alert_payload);
  circuit_bytes := circuit_wrapper::TEXT;
  page_bytes := page_wrapper::TEXT;
  INSERT INTO public.stripe_cancellation_alerts(alert_key, window_start, window_seconds, count, event_ids, created_at, updated_at)
    VALUES (computed_alert_key, p_now - p_window_seconds, p_window_seconds, observed.count, observed.ids, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (alert_key) DO UPDATE SET count = EXCLUDED.count, event_ids = EXCLUDED.event_ids, updated_at = CURRENT_TIMESTAMP;
  INSERT INTO public.stripe_cancellation_deliveries(delivery_key, replay_key, alert_key, adapter, payload_digest, payload_version, payload, payload_bytes, next_attempt_at, created_at, updated_at)
    VALUES (computed_alert_key || ':circuit', 'stripe-delivery-replay:' || computed_alert_key || ':circuit', computed_alert_key, 'circuit', encode(public.digest(circuit_bytes, 'sha256'), 'hex'), 'stripe-cancellation-http-v1', circuit_wrapper, circuit_bytes, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
           (computed_alert_key || ':page', 'stripe-delivery-replay:' || computed_alert_key || ':page', computed_alert_key, 'page', encode(public.digest(page_bytes, 'sha256'), 'hex'), 'stripe-cancellation-http-v1', page_wrapper, page_bytes, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (delivery_key) DO NOTHING;
  SELECT a.circuit_opened, a.page_sent INTO current_alert FROM public.stripe_cancellation_alerts AS a WHERE a.alert_key = computed_alert_key;
  INSERT INTO public.stripe_cancellation_audit(id, alert_key, action, provenance_digest, details)
    VALUES (public.gen_random_uuid()::TEXT, computed_alert_key, 'breach-observed', p_payload_digest, alert_payload);
  RETURN QUERY SELECT computed_alert_key, observed.count, observed.ids, TRUE, current_alert.circuit_opened, current_alert.page_sent;
END
$$;

CREATE OR REPLACE FUNCTION public.sploot_append_stripe_audit(p_event_id TEXT, p_alert_key TEXT, p_action TEXT, p_provenance_digest TEXT, p_details JSONB)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE audit_id TEXT := public.gen_random_uuid()::TEXT;
BEGIN
  IF session_user <> 'sploot_stripe_ledger_issuer' AND session_user <> 'sploot_stripe_ledger_consumer' THEN RAISE EXCEPTION 'Stripe audit append requires an approved role'; END IF;
  IF (p_event_id IS NULL AND p_alert_key IS NULL) OR p_action NOT IN ('delivery-completed', 'delivery-failed', 'delivery-replayed', 'delivery-dead-lettered') OR p_provenance_digest IS NULL OR p_details IS NULL THEN RAISE EXCEPTION 'Stripe audit provenance is incomplete'; END IF;
  INSERT INTO public.stripe_cancellation_audit(id, event_id, alert_key, action, provenance_digest, details) VALUES (audit_id, p_event_id, p_alert_key, p_action, p_provenance_digest, p_details);
  RETURN audit_id;
END
$$;

CREATE OR REPLACE FUNCTION public.sploot_stripe_claim_deliveries(p_alert_key TEXT, p_now INTEGER, p_lease_seconds INTEGER, p_claim_token TEXT)
RETURNS TABLE(alert_key TEXT, adapter TEXT, delivery_key TEXT, replay_key TEXT, claim_token TEXT, generation INTEGER, lease_expires_at INTEGER, payload_digest TEXT, payload_version TEXT, payload JSONB, payload_bytes TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
#variable_conflict use_column
DECLARE row_data RECORD; lease_until INTEGER;
BEGIN
  IF session_user NOT IN ('sploot_stripe_ledger_issuer', 'sploot_stripe_ledger_consumer') THEN RAISE EXCEPTION 'Stripe delivery claim requires an approved role'; END IF;
  IF p_alert_key IS NULL OR p_now IS NULL OR p_lease_seconds IS NULL OR p_lease_seconds < 1 OR p_lease_seconds > 300 OR p_claim_token IS NULL OR btrim(p_claim_token) = '' THEN RAISE EXCEPTION 'Stripe delivery claim bounds are invalid'; END IF;
  PERFORM pg_advisory_xact_lock(pg_catalog.hashtext('sploot:stripe-cancellation-ledger:v3'));
  lease_until := p_now + p_lease_seconds;
  FOR row_data IN SELECT * FROM public.stripe_cancellation_deliveries d WHERE d.alert_key = p_alert_key AND ((d.status = 'pending' AND d.next_attempt_at <= to_timestamp(p_now)) OR (d.status = 'claimed' AND d.lease_expires_at <= to_timestamp(p_now))) ORDER BY d.adapter FOR UPDATE SKIP LOCKED LOOP
    IF row_data.attempts >= 8 THEN
      UPDATE public.stripe_cancellation_deliveries SET status = 'dead-letter', claim_token = NULL, lease_expires_at = NULL, dead_lettered_at = COALESCE(dead_lettered_at, to_timestamp(p_now)), last_error = COALESCE(last_error, 'stripe_delivery_failed') WHERE delivery_key = row_data.delivery_key;
      PERFORM public.sploot_append_stripe_audit(NULL, row_data.alert_key, 'delivery-dead-lettered', 'delivery:' || row_data.delivery_key, jsonb_build_object('delivery_key', row_data.delivery_key, 'payload_digest', row_data.payload_digest, 'payload_version', row_data.payload_version, 'reason', 'attempts-exhausted'));
      CONTINUE;
    END IF;
    UPDATE public.stripe_cancellation_deliveries SET status = 'claimed', claim_token = p_claim_token, generation = generation + 1, lease_expires_at = to_timestamp(lease_until), attempts = attempts + 1 WHERE delivery_key = row_data.delivery_key;
    RETURN QUERY SELECT row_data.alert_key, row_data.adapter, row_data.delivery_key, row_data.replay_key, p_claim_token, row_data.generation + 1, lease_until, row_data.payload_digest, row_data.payload_version, row_data.payload, row_data.payload_bytes;
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.sploot_stripe_drain_deliveries(p_now INTEGER, p_lease_seconds INTEGER, p_claim_token TEXT)
RETURNS TABLE(alert_key TEXT, adapter TEXT, delivery_key TEXT, replay_key TEXT, claim_token TEXT, generation INTEGER, lease_expires_at INTEGER, payload_digest TEXT, payload_version TEXT, payload JSONB, payload_bytes TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
#variable_conflict use_column
DECLARE key_row RECORD;
BEGIN
  IF session_user <> 'sploot_stripe_ledger_consumer' THEN RAISE EXCEPTION 'scheduled Stripe drain requires the consumer role'; END IF;
  FOR key_row IN SELECT DISTINCT d.alert_key FROM public.stripe_cancellation_deliveries d WHERE d.status = 'pending' AND d.next_attempt_at <= to_timestamp(p_now) OR d.status = 'claimed' AND d.lease_expires_at <= to_timestamp(p_now) LOOP
    RETURN QUERY SELECT * FROM public.sploot_stripe_claim_deliveries(key_row.alert_key, p_now, p_lease_seconds, p_claim_token);
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.sploot_stripe_complete_delivery(p_delivery_key TEXT, p_alert_key TEXT, p_adapter TEXT, p_replay_key TEXT, p_payload_digest TEXT, p_payload_version TEXT, p_claim_token TEXT, p_generation INTEGER, p_succeeded BOOLEAN, p_error TEXT, p_now INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE row_data RECORD; terminal BOOLEAN; delay_seconds INTEGER; error_code TEXT;
BEGIN
  IF session_user NOT IN ('sploot_stripe_ledger_issuer', 'sploot_stripe_ledger_consumer') THEN RAISE EXCEPTION 'Stripe delivery completion requires an approved role'; END IF;
  PERFORM pg_advisory_xact_lock(pg_catalog.hashtext('sploot:stripe-cancellation-ledger:v3'));
  SELECT * INTO row_data FROM public.stripe_cancellation_deliveries WHERE delivery_key = p_delivery_key FOR UPDATE;
  IF NOT FOUND OR row_data.status <> 'claimed' OR row_data.alert_key <> p_alert_key OR row_data.adapter <> p_adapter OR row_data.replay_key <> p_replay_key OR row_data.payload_digest <> p_payload_digest OR row_data.payload_version <> p_payload_version OR row_data.claim_token <> p_claim_token OR row_data.generation <> p_generation OR row_data.lease_expires_at IS NULL OR row_data.lease_expires_at <= to_timestamp(p_now) THEN RETURN FALSE; END IF;
  IF p_succeeded THEN
    UPDATE public.stripe_cancellation_deliveries SET status = 'delivered', claim_token = NULL, lease_expires_at = NULL, delivered_at = to_timestamp(p_now), generation = generation + 1, last_error = NULL WHERE delivery_key = p_delivery_key;
    IF p_adapter = 'circuit' THEN UPDATE public.stripe_cancellation_alerts SET circuit_opened = TRUE WHERE alert_key = p_alert_key; ELSE UPDATE public.stripe_cancellation_alerts SET page_sent = TRUE WHERE alert_key = p_alert_key; END IF;
    PERFORM public.sploot_append_stripe_audit(NULL, p_alert_key, 'delivery-completed', 'delivery:' || p_delivery_key, jsonb_build_object('delivery_key', p_delivery_key, 'payload_digest', p_payload_digest, 'payload_version', p_payload_version));
  ELSE
    error_code := CASE WHEN p_error IN ('stripe_delivery_failed', 'stripe_delivery_claim_fenced') THEN p_error ELSE 'stripe_delivery_failed' END;
    terminal := row_data.attempts >= 8;
    delay_seconds := LEAST(300, (2 ^ GREATEST(0, row_data.attempts - 1)) + (get_byte(public.digest(p_delivery_key, 'sha256'), 0) % 8));
    UPDATE public.stripe_cancellation_deliveries SET status = CASE WHEN terminal THEN 'dead-letter' ELSE 'pending' END, claim_token = NULL, lease_expires_at = NULL, dead_lettered_at = CASE WHEN terminal THEN to_timestamp(p_now) ELSE NULL END, next_attempt_at = CASE WHEN terminal THEN to_timestamp(p_now) ELSE to_timestamp(p_now + delay_seconds) END, generation = CASE WHEN terminal THEN generation ELSE generation + 1 END, last_error = error_code WHERE delivery_key = p_delivery_key;
    PERFORM public.sploot_append_stripe_audit(NULL, p_alert_key, 'delivery-failed', 'delivery:' || p_delivery_key, jsonb_build_object('delivery_key', p_delivery_key, 'payload_digest', p_payload_digest, 'payload_version', p_payload_version, 'terminal', terminal, 'error', error_code));
    IF terminal THEN
      PERFORM public.sploot_append_stripe_audit(NULL, p_alert_key, 'delivery-dead-lettered', 'delivery:' || p_delivery_key, jsonb_build_object('delivery_key', p_delivery_key, 'payload_digest', p_payload_digest, 'payload_version', p_payload_version, 'error', error_code, 'reason', 'terminal-attempts-exhausted'));
    END IF;
  END IF;
  RETURN TRUE;
END
$$;

CREATE OR REPLACE FUNCTION public.sploot_replay_stripe_dead_letter(p_replay_key TEXT, p_now INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE row_data RECORD;
BEGIN
  IF session_user <> 'sploot_stripe_ledger_maintenance' THEN RAISE EXCEPTION 'dead-letter replay requires the maintenance consumer role'; END IF;
  SELECT * INTO row_data FROM public.stripe_cancellation_deliveries WHERE replay_key = p_replay_key FOR UPDATE;
  IF NOT FOUND OR row_data.status <> 'dead-letter' THEN RETURN FALSE; END IF;
  UPDATE public.stripe_cancellation_deliveries SET status = 'pending', claim_token = NULL, lease_expires_at = NULL, dead_lettered_at = NULL, attempts = 0, next_attempt_at = to_timestamp(p_now), generation = generation + 1 WHERE replay_key = p_replay_key;
  INSERT INTO public.stripe_cancellation_audit(id, alert_key, action, provenance_digest, details) VALUES (public.gen_random_uuid()::TEXT, row_data.alert_key, 'delivery-replayed', 'delivery:' || row_data.delivery_key, jsonb_build_object('replay_key', p_replay_key, 'payload_digest', row_data.payload_digest, 'payload_version', row_data.payload_version));
  RETURN TRUE;
END
$$;

CREATE OR REPLACE FUNCTION public.sploot_stripe_delivery_health(p_alert_key TEXT DEFAULT NULL)
RETURNS TABLE(pending INTEGER, claimed INTEGER, dead_letter INTEGER, unresolved INTEGER)
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    COUNT(*) FILTER (WHERE status = 'pending')::INTEGER AS pending,
    COUNT(*) FILTER (WHERE status = 'claimed')::INTEGER AS claimed,
    COUNT(*) FILTER (WHERE status = 'dead-letter')::INTEGER AS dead_letter,
    COUNT(*) FILTER (WHERE status IN ('pending', 'claimed', 'dead-letter'))::INTEGER AS unresolved
  FROM public.stripe_cancellation_deliveries
  WHERE p_alert_key IS NULL OR alert_key = p_alert_key;
$$;

-- Maintenance tokens bind actor, purpose, exact subject (one Stripe account or
-- one Stripe object), time range, legal cutoff, and expiry. A purge scoped to
-- one subject can never remove another subject's rows in the same time range.
CREATE OR REPLACE FUNCTION public.sploot_issue_stripe_maintenance_token(p_token_digest TEXT, p_generation INTEGER, p_actor TEXT, p_purpose TEXT, p_subject_kind TEXT, p_subject_id TEXT, p_time_basis TEXT, p_range_start TIMESTAMP(3), p_range_end TIMESTAMP(3), p_legal_minimum_since TIMESTAMP(3), p_issued_at TIMESTAMP(3), p_expires_at TIMESTAMP(3))
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF session_user <> 'sploot_stripe_ledger_issuer' THEN RAISE EXCEPTION 'maintenance token issuance requires the issuer authority'; END IF;
  IF p_token_digest !~ '^[0-9a-f]{64}$' OR p_generation < 1 OR p_actor IS NULL OR p_purpose IS NULL OR p_range_start IS NULL OR p_range_end IS NULL OR p_legal_minimum_since IS NULL OR p_issued_at IS NULL OR p_expires_at IS NULL OR p_expires_at <= p_issued_at OR p_range_end < p_range_start OR p_range_end > p_legal_minimum_since OR p_legal_minimum_since > p_issued_at OR p_issued_at > CURRENT_TIMESTAMP THEN RAISE EXCEPTION 'maintenance token contract is invalid'; END IF;
  IF p_subject_kind IS NULL OR p_subject_kind NOT IN ('account', 'object') OR p_subject_id IS NULL OR btrim(p_subject_id) = '' THEN RAISE EXCEPTION 'maintenance token subject binding is invalid'; END IF;
  IF p_time_basis IS NULL OR p_time_basis NOT IN ('audit.created_at', 'event.received_at') THEN RAISE EXCEPTION 'maintenance token time basis is invalid'; END IF;
  INSERT INTO public.stripe_cancellation_maintenance_tokens(token_digest, generation, actor, purpose, subject_kind, subject_id, time_basis, range_start, range_end, legal_minimum_since, issued_at, expires_at) VALUES (p_token_digest, p_generation, p_actor, p_purpose, p_subject_kind, p_subject_id, p_time_basis, p_range_start, p_range_end, p_legal_minimum_since, p_issued_at, p_expires_at) ON CONFLICT (token_digest) DO NOTHING;
  RETURN TRUE;
END
$$;

CREATE OR REPLACE FUNCTION public.sploot_stripe_ledger_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF current_user = 'sploot_stripe_ledger_owner' AND pg_catalog.current_setting('sploot.ledger_fenced_mutation', true) IN ('purge:v1', 'purge-provenance:v1') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'Stripe ledger rows are append-only; use the approved fenced function';
END
$$;

ALTER FUNCTION public.sploot_append_stripe_event(TEXT,TEXT,INTEGER,BOOLEAN,TEXT,TEXT,TEXT,INTEGER,JSONB,TEXT,TEXT,BYTEA,BYTEA,TEXT,TEXT) OWNER TO sploot_stripe_ledger_owner;
ALTER FUNCTION public.sploot_record_stripe_cancellation(TEXT,TEXT,INTEGER,BOOLEAN,TEXT,TEXT,TEXT,INTEGER,JSONB,TEXT,TEXT,BYTEA,BYTEA,TEXT,TEXT,TEXT,INTEGER,INTEGER,INTEGER) OWNER TO sploot_stripe_ledger_owner;
ALTER FUNCTION public.sploot_append_stripe_audit(TEXT,TEXT,TEXT,TEXT,JSONB) OWNER TO sploot_stripe_ledger_owner;
ALTER FUNCTION public.sploot_stripe_claim_deliveries(TEXT,INTEGER,INTEGER,TEXT) OWNER TO sploot_stripe_ledger_owner;
ALTER FUNCTION public.sploot_stripe_drain_deliveries(INTEGER,INTEGER,TEXT) OWNER TO sploot_stripe_ledger_owner;
ALTER FUNCTION public.sploot_stripe_complete_delivery(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,BOOLEAN,TEXT,INTEGER) OWNER TO sploot_stripe_ledger_owner;
ALTER FUNCTION public.sploot_replay_stripe_dead_letter(TEXT,INTEGER) OWNER TO sploot_stripe_ledger_owner;
ALTER FUNCTION public.sploot_stripe_delivery_health(TEXT) OWNER TO sploot_stripe_ledger_owner;
ALTER FUNCTION public.sploot_issue_stripe_maintenance_token(TEXT,INTEGER,TEXT,TEXT,TEXT,TEXT,TEXT,TIMESTAMP(3),TIMESTAMP(3),TIMESTAMP(3),TIMESTAMP(3),TIMESTAMP(3)) OWNER TO sploot_stripe_ledger_owner;
ALTER FUNCTION public.sploot_stripe_ledger_append_only() OWNER TO sploot_stripe_ledger_owner;

DROP TRIGGER IF EXISTS stripe_cancellation_events_append_only ON public.stripe_cancellation_events;
DROP TRIGGER IF EXISTS stripe_cancellation_audit_append_only ON public.stripe_cancellation_audit;
DROP TRIGGER IF EXISTS stripe_cancellation_maintenance_append_only ON public.stripe_cancellation_maintenance;
CREATE TRIGGER stripe_cancellation_events_append_only BEFORE DELETE OR UPDATE ON public.stripe_cancellation_events FOR EACH ROW EXECUTE FUNCTION public.sploot_stripe_ledger_append_only();
CREATE TRIGGER stripe_cancellation_audit_append_only BEFORE DELETE OR UPDATE ON public.stripe_cancellation_audit FOR EACH ROW EXECUTE FUNCTION public.sploot_stripe_ledger_append_only();
CREATE TRIGGER stripe_cancellation_maintenance_append_only BEFORE DELETE OR UPDATE ON public.stripe_cancellation_maintenance FOR EACH ROW EXECUTE FUNCTION public.sploot_stripe_ledger_append_only();
ALTER TABLE public.stripe_cancellation_events ENABLE ALWAYS TRIGGER stripe_cancellation_events_append_only;
ALTER TABLE public.stripe_cancellation_audit ENABLE ALWAYS TRIGGER stripe_cancellation_audit_append_only;
ALTER TABLE public.stripe_cancellation_maintenance ENABLE ALWAYS TRIGGER stripe_cancellation_maintenance_append_only;

-- Purge is the only fenced delete path. The issuer creates the token; the
-- maintenance consumer can consume it exactly once and cannot self-issue.
-- Every purge is bound to the token's exact subject in addition to its time
-- range and legal cutoff.
CREATE OR REPLACE FUNCTION public.sploot_purge_stripe_audit(p_token TEXT, p_generation INTEGER, p_actor TEXT, p_purpose TEXT, p_subject_kind TEXT, p_subject_id TEXT, p_range_start TIMESTAMP(3), p_range_end TIMESTAMP(3), p_legal_minimum_since TIMESTAMP(3))
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
#variable_conflict use_column
DECLARE token_row RECORD; purge_row RECORD; previous_digest TEXT; record_digest TEXT;
BEGIN
  IF session_user <> 'sploot_stripe_ledger_maintenance' THEN RAISE EXCEPTION 'audit purge requires the maintenance role'; END IF;
  PERFORM pg_advisory_xact_lock(pg_catalog.hashtext('sploot:stripe-maintenance-chain:v1'));
  SELECT * INTO token_row FROM public.stripe_cancellation_maintenance_tokens WHERE token_digest = encode(public.digest(p_token, 'sha256'), 'hex') AND consumed_at IS NULL FOR UPDATE;
  IF NOT FOUND OR token_row.generation <> p_generation OR token_row.actor <> p_actor OR token_row.purpose <> p_purpose OR token_row.subject_kind <> p_subject_kind OR token_row.subject_id <> p_subject_id OR token_row.time_basis <> 'audit.created_at' OR token_row.range_start <> p_range_start OR token_row.range_end <> p_range_end OR token_row.legal_minimum_since <> p_legal_minimum_since OR token_row.legal_minimum_since > token_row.issued_at OR token_row.expires_at <= CURRENT_TIMESTAMP THEN RAISE EXCEPTION 'maintenance token is invalid, expired, mismatched, or already consumed'; END IF;
  IF p_subject_kind NOT IN ('account', 'object') OR btrim(p_subject_id) = '' THEN RAISE EXCEPTION 'audit purge subject binding is invalid'; END IF;
  SELECT count(*)::INTEGER AS count, min(a.created_at) AS range_start, max(a.created_at) AS range_end, encode(public.digest(COALESCE(string_agg(a.id || ':' || a.provenance_digest, '|' ORDER BY a.id), 'empty'), 'sha256'), 'hex') AS digest
    INTO purge_row
    FROM public.stripe_cancellation_audit a
   WHERE a.created_at >= p_range_start AND a.created_at <= p_range_end AND a.created_at < p_legal_minimum_since
     AND a.event_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.stripe_cancellation_events e
        WHERE e.event_id = a.event_id
          AND ((p_subject_kind = 'object' AND e.object_id = p_subject_id) OR (p_subject_kind = 'account' AND e.account_id = p_subject_id)));
  SELECT record_digest INTO previous_digest FROM public.stripe_cancellation_maintenance ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE;
  record_digest := encode(public.digest(concat_ws('|', p_actor, p_purpose, p_subject_kind, p_subject_id, p_range_start, p_range_end, purge_row.range_start, purge_row.range_end, purge_row.count, purge_row.digest, previous_digest), 'sha256'), 'hex');
  INSERT INTO public.stripe_cancellation_maintenance(id, actor, reason, range_start, range_end, purged_count, purged_digest, previous_record_digest, record_digest) VALUES (public.gen_random_uuid()::TEXT, p_actor, p_purpose || ' [subject ' || p_subject_kind || ':' || p_subject_id || ']', purge_row.range_start, purge_row.range_end, purge_row.count, purge_row.digest, previous_digest, record_digest);
  PERFORM pg_catalog.set_config('sploot.ledger_fenced_mutation', 'purge:v1', true);
  DELETE FROM public.stripe_cancellation_audit a
   WHERE a.created_at >= p_range_start AND a.created_at <= p_range_end AND a.created_at < p_legal_minimum_since
     AND a.event_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.stripe_cancellation_events e
        WHERE e.event_id = a.event_id
          AND ((p_subject_kind = 'object' AND e.object_id = p_subject_id) OR (p_subject_kind = 'account' AND e.account_id = p_subject_id)));
  UPDATE public.stripe_cancellation_maintenance_tokens SET consumed_at = CURRENT_TIMESTAMP WHERE token_digest = token_row.token_digest;
  RETURN purge_row.count;
END
$$;
ALTER FUNCTION public.sploot_purge_stripe_audit(TEXT,INTEGER,TEXT,TEXT,TEXT,TEXT,TIMESTAMP(3),TIMESTAMP(3),TIMESTAMP(3)) OWNER TO sploot_stripe_ledger_owner;

-- Raw signed-request bytes have a separate retention contract: once the
-- legal minimum permits removal, only the encrypted payload is erased. Event
-- identity, digests, and the maintenance-chain record remain forensic proof.
CREATE OR REPLACE FUNCTION public.sploot_purge_stripe_raw_provenance(p_token TEXT, p_generation INTEGER, p_actor TEXT, p_purpose TEXT, p_subject_kind TEXT, p_subject_id TEXT, p_range_start TIMESTAMP(3), p_range_end TIMESTAMP(3), p_legal_minimum_since TIMESTAMP(3))
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
#variable_conflict use_column
DECLARE token_row RECORD; purge_row RECORD; previous_digest TEXT; record_digest TEXT;
BEGIN
  IF session_user <> 'sploot_stripe_ledger_maintenance' THEN RAISE EXCEPTION 'raw provenance purge requires the maintenance role'; END IF;
  PERFORM pg_advisory_xact_lock(pg_catalog.hashtext('sploot:stripe-maintenance-chain:v1'));
  SELECT * INTO token_row FROM public.stripe_cancellation_maintenance_tokens WHERE token_digest = encode(public.digest(p_token, 'sha256'), 'hex') AND consumed_at IS NULL FOR UPDATE;
  IF NOT FOUND OR token_row.generation <> p_generation OR token_row.actor <> p_actor OR token_row.purpose <> p_purpose OR token_row.subject_kind <> p_subject_kind OR token_row.subject_id <> p_subject_id OR token_row.time_basis <> 'event.received_at' OR token_row.range_start <> p_range_start OR token_row.range_end <> p_range_end OR token_row.legal_minimum_since <> p_legal_minimum_since OR token_row.legal_minimum_since > token_row.issued_at OR token_row.expires_at <= CURRENT_TIMESTAMP THEN RAISE EXCEPTION 'raw provenance purge token is invalid, expired, mismatched, or already consumed'; END IF;
  IF p_subject_kind NOT IN ('account', 'object') OR btrim(p_subject_id) = '' THEN RAISE EXCEPTION 'raw provenance purge subject binding is invalid'; END IF;
  SELECT count(*)::INTEGER AS count, encode(public.digest(COALESCE(string_agg(event_id || ':' || raw_body_digest || ':' || signature_header_digest, '|' ORDER BY event_id), 'empty'), 'sha256'), 'hex') AS digest
    INTO purge_row
    FROM public.stripe_cancellation_events
   WHERE received_at >= p_range_start AND received_at <= p_range_end AND received_at < p_legal_minimum_since AND raw_body_key_id <> 'purged:v1'
     AND ((p_subject_kind = 'object' AND object_id = p_subject_id) OR (p_subject_kind = 'account' AND account_id = p_subject_id));
  SELECT record_digest INTO previous_digest FROM public.stripe_cancellation_maintenance ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE;
  record_digest := encode(public.digest(concat_ws('|', p_actor, p_purpose, p_subject_kind, p_subject_id, p_range_start, p_range_end, purge_row.count, purge_row.digest, previous_digest), 'sha256'), 'hex');
  INSERT INTO public.stripe_cancellation_maintenance(id, actor, reason, range_start, range_end, purged_count, purged_digest, previous_record_digest, record_digest) VALUES (public.gen_random_uuid()::TEXT, p_actor, p_purpose || ' [subject ' || p_subject_kind || ':' || p_subject_id || ']', p_range_start, p_range_end, purge_row.count, purge_row.digest, previous_digest, record_digest);
  PERFORM pg_catalog.set_config('sploot.ledger_fenced_mutation', 'purge-provenance:v1', true);
  UPDATE public.stripe_cancellation_events
     SET raw_body_ciphertext = decode('', 'hex'), raw_body_nonce = decode(repeat('00', 12), 'hex'), raw_body_key_id = 'purged:v1'
   WHERE received_at >= p_range_start AND received_at <= p_range_end AND received_at < p_legal_minimum_since AND raw_body_key_id <> 'purged:v1'
     AND ((p_subject_kind = 'object' AND object_id = p_subject_id) OR (p_subject_kind = 'account' AND account_id = p_subject_id));
  UPDATE public.stripe_cancellation_maintenance_tokens SET consumed_at = CURRENT_TIMESTAMP WHERE token_digest = token_row.token_digest;
  RETURN purge_row.count;
END
$$;
ALTER FUNCTION public.sploot_purge_stripe_raw_provenance(TEXT,INTEGER,TEXT,TEXT,TEXT,TEXT,TIMESTAMP(3),TIMESTAMP(3),TIMESTAMP(3)) OWNER TO sploot_stripe_ledger_owner;

-- Remove every inherited/public/table/function grant before adding the exact
-- role contract. No app role can mutate event, audit, alert, or outbox rows.
REVOKE ALL ON TABLE public.stripe_cancellation_events, public.stripe_cancellation_audit, public.stripe_cancellation_alerts, public.stripe_cancellation_deliveries, public.stripe_cancellation_maintenance, public.stripe_cancellation_maintenance_tokens FROM PUBLIC, sploot_stripe_app, sploot_stripe_schema_migrator, sploot_stripe_ledger_issuer, sploot_stripe_ledger_consumer, sploot_stripe_ledger_maintenance;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM sploot_stripe_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM sploot_stripe_app;
GRANT ALL ON TABLE public.stripe_cancellation_events, public.stripe_cancellation_audit, public.stripe_cancellation_alerts, public.stripe_cancellation_deliveries, public.stripe_cancellation_maintenance, public.stripe_cancellation_maintenance_tokens TO sploot_stripe_ledger_owner;
GRANT USAGE ON SCHEMA public TO sploot_stripe_ledger_issuer, sploot_stripe_ledger_consumer, sploot_stripe_ledger_maintenance;
REVOKE CREATE ON SCHEMA public FROM sploot_stripe_app;

-- Runtime application DML is explicit and excludes every Stripe ledger table.
-- Ledger reads and writes are only through the typed SECURITY DEFINER surface.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.users, public.upload_tokens, public.user_identities,
  public.user_storage_quotas, public.storage_quota_reservations,
  public.assets, public.asset_embeddings, public.tags, public.asset_tags,
  public.search_logs, public.text_embedding_cache, public.embedding_rate_buckets,
  public.embedding_rate_leases, public.embedding_provider_circuits, public.library_exports, public.upload_idempotency
TO sploot_stripe_app;
-- Health may inspect migration names to bind the ready marker to the newest
-- applied schema version. The runtime remains unable to mutate Prisma's ledger.
GRANT SELECT ON TABLE public._prisma_migrations TO sploot_stripe_app;

-- Runtime cutover validation may read only the durable state row; journal,
-- inventory, and migration-entry tables remain denied to the app role.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sploot_stripe_app') THEN
    GRANT SELECT ON TABLE public.storage_cutover_state TO sploot_stripe_app;
    -- Upload recording inserts immutable provider receipts; explicit delete only
    -- reads the provider-local columns below. Cutover/update/delete remain
    -- reserved for the storage operator role.
    REVOKE ALL ON TABLE public.asset_storage_replicas FROM sploot_stripe_app;
    GRANT INSERT ON TABLE public.asset_storage_replicas TO sploot_stripe_app;
    GRANT SELECT (asset_id, provider, source_key, logical_key, delivery_url, active)
      ON TABLE public.asset_storage_replicas TO sploot_stripe_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.storage_cutover_state, public.storage_migration_entries, public.storage_inventory_state, public.storage_inventory_failures, public.asset_storage_replicas, public.storage_cleanup_outbox TO sploot_storage_operator;
    GRANT SELECT, INSERT, UPDATE ON TABLE public.storage_cleanup_outbox TO sploot_stripe_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sploot_storage_operator;
  END IF;
END $$;

-- Strip PUBLIC EXECUTE from every SECURITY DEFINER function and from trigger
-- functions, then re-grant only the exact runtime or migration-authority
-- contract.
DO $$
DECLARE fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.prosecdef OR p.proname IN (
        'sploot_stripe_ledger_append_only',
        'enforce_asset_embedding_revival_budget'
      ))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, sploot_stripe_app, sploot_stripe_schema_migrator, sploot_stripe_ledger_issuer, sploot_stripe_ledger_consumer, sploot_stripe_ledger_maintenance', fn.signature);
  END LOOP;
END
$$;

-- The schema migrator must be able to recreate its own trigger during an
-- idempotent migration replay. Runtime roles and PUBLIC retain no direct call.
GRANT EXECUTE ON FUNCTION public.enforce_asset_embedding_revival_budget() TO sploot_stripe_schema_migrator;

GRANT EXECUTE ON FUNCTION public.sploot_append_stripe_event(TEXT,TEXT,INTEGER,BOOLEAN,TEXT,TEXT,TEXT,INTEGER,JSONB,TEXT,TEXT,BYTEA,BYTEA,TEXT,TEXT) TO sploot_stripe_ledger_issuer;
GRANT EXECUTE ON FUNCTION public.sploot_record_stripe_cancellation(TEXT,TEXT,INTEGER,BOOLEAN,TEXT,TEXT,TEXT,INTEGER,JSONB,TEXT,TEXT,BYTEA,BYTEA,TEXT,TEXT,TEXT,INTEGER,INTEGER,INTEGER) TO sploot_stripe_ledger_issuer;
GRANT EXECUTE ON FUNCTION public.sploot_stripe_claim_deliveries(TEXT,INTEGER,INTEGER,TEXT) TO sploot_stripe_ledger_issuer, sploot_stripe_ledger_consumer;
GRANT EXECUTE ON FUNCTION public.sploot_stripe_drain_deliveries(INTEGER,INTEGER,TEXT) TO sploot_stripe_ledger_consumer;
GRANT EXECUTE ON FUNCTION public.sploot_stripe_complete_delivery(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,BOOLEAN,TEXT,INTEGER) TO sploot_stripe_ledger_issuer, sploot_stripe_ledger_consumer;
GRANT EXECUTE ON FUNCTION public.sploot_replay_stripe_dead_letter(TEXT,INTEGER) TO sploot_stripe_ledger_maintenance;
GRANT EXECUTE ON FUNCTION public.sploot_stripe_delivery_health(TEXT) TO sploot_stripe_ledger_issuer, sploot_stripe_ledger_consumer, sploot_stripe_ledger_maintenance;
GRANT EXECUTE ON FUNCTION public.sploot_issue_stripe_maintenance_token(TEXT,INTEGER,TEXT,TEXT,TEXT,TEXT,TEXT,TIMESTAMP(3),TIMESTAMP(3),TIMESTAMP(3),TIMESTAMP(3),TIMESTAMP(3)) TO sploot_stripe_ledger_issuer;
GRANT EXECUTE ON FUNCTION public.sploot_purge_stripe_audit(TEXT,INTEGER,TEXT,TEXT,TEXT,TEXT,TIMESTAMP(3),TIMESTAMP(3),TIMESTAMP(3)) TO sploot_stripe_ledger_maintenance;
GRANT EXECUTE ON FUNCTION public.sploot_purge_stripe_raw_provenance(TEXT,INTEGER,TEXT,TEXT,TEXT,TEXT,TIMESTAMP(3),TIMESTAMP(3),TIMESTAMP(3)) TO sploot_stripe_ledger_maintenance;

-- Verify the catalog contract after grants are applied. The deployment
-- verifier performs the corresponding normalized body comparison; this SQL
-- gate independently refuses wrong signatures, owners, SECURITY DEFINER
-- posture, search_path, or a leaked PUBLIC/app EXECUTE grant.
DO $$
DECLARE bad RECORD;
BEGIN
  SELECT * INTO bad
  FROM (VALUES
    ('sploot_append_stripe_event', 'p_event_id text, p_event_type text, p_created_epoch integer, p_livemode boolean, p_account_id text, p_object_id text, p_object_type text, p_signature_timestamp integer, p_raw_payload jsonb, p_payload_digest text, p_raw_body_digest text, p_raw_body_ciphertext bytea, p_raw_body_nonce bytea, p_raw_body_key_id text, p_signature_header_digest text', TRUE),
    ('sploot_record_stripe_cancellation', 'p_event_id text, p_event_type text, p_created_epoch integer, p_livemode boolean, p_account_id text, p_object_id text, p_object_type text, p_signature_timestamp integer, p_raw_payload jsonb, p_payload_digest text, p_raw_body_digest text, p_raw_body_ciphertext bytea, p_raw_body_nonce bytea, p_raw_body_key_id text, p_signature_header_digest text, p_reason text, p_max_cancellations integer, p_window_seconds integer, p_now integer', TRUE),
    ('sploot_append_stripe_audit', 'p_event_id text, p_alert_key text, p_action text, p_provenance_digest text, p_details jsonb', TRUE),
    ('sploot_stripe_claim_deliveries', 'p_alert_key text, p_now integer, p_lease_seconds integer, p_claim_token text', TRUE),
    ('sploot_stripe_drain_deliveries', 'p_now integer, p_lease_seconds integer, p_claim_token text', TRUE),
    ('sploot_stripe_complete_delivery', 'p_delivery_key text, p_alert_key text, p_adapter text, p_replay_key text, p_payload_digest text, p_payload_version text, p_claim_token text, p_generation integer, p_succeeded boolean, p_error text, p_now integer', TRUE),
    ('sploot_replay_stripe_dead_letter', 'p_replay_key text, p_now integer', TRUE),
    ('sploot_stripe_delivery_health', 'p_alert_key text', TRUE),
    ('sploot_issue_stripe_maintenance_token', 'p_token_digest text, p_generation integer, p_actor text, p_purpose text, p_subject_kind text, p_subject_id text, p_time_basis text, p_range_start timestamp without time zone, p_range_end timestamp without time zone, p_legal_minimum_since timestamp without time zone, p_issued_at timestamp without time zone, p_expires_at timestamp without time zone', TRUE),
    ('sploot_stripe_ledger_append_only', '', FALSE),
    ('sploot_purge_stripe_audit', 'p_token text, p_generation integer, p_actor text, p_purpose text, p_subject_kind text, p_subject_id text, p_range_start timestamp without time zone, p_range_end timestamp without time zone, p_legal_minimum_since timestamp without time zone', TRUE),
    ('sploot_purge_stripe_raw_provenance', 'p_token text, p_generation integer, p_actor text, p_purpose text, p_subject_kind text, p_subject_id text, p_range_start timestamp without time zone, p_range_end timestamp without time zone, p_legal_minimum_since timestamp without time zone', TRUE)
  ) AS expected(name, arguments, security_definer)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = expected.name
      AND pg_get_function_identity_arguments(p.oid) = expected.arguments
      AND pg_get_userbyid(p.proowner) = 'sploot_stripe_ledger_owner'
      AND p.prosecdef = expected.security_definer
      AND (expected.security_definer = FALSE OR p.proconfig @> ARRAY['search_path=pg_catalog, public'])
  )
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'final Stripe function signature/security contract is incomplete: % (%)', bad.name, bad.arguments;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'sploot_append_stripe_event', 'sploot_record_stripe_cancellation',
        'sploot_append_stripe_audit', 'sploot_stripe_claim_deliveries',
        'sploot_stripe_drain_deliveries', 'sploot_stripe_complete_delivery',
        'sploot_replay_stripe_dead_letter', 'sploot_stripe_delivery_health',
        'sploot_issue_stripe_maintenance_token', 'sploot_stripe_ledger_append_only',
        'sploot_purge_stripe_audit', 'sploot_purge_stripe_raw_provenance'
      )
      AND (has_function_privilege('sploot_stripe_app', p.oid, 'EXECUTE')
        OR EXISTS (
          SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
          WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
        ))
  ) THEN
    RAISE EXCEPTION 'final Stripe function grant contract leaks PUBLIC or app EXECUTE';
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('asset_embeddings', 'attempt_count', 'integer', TRUE, '0'),
      ('asset_embeddings', 'next_attempt_at', 'timestamp(3) without time zone', FALSE, NULL),
      ('asset_embeddings', 'terminal_at', 'timestamp(3) without time zone', FALSE, NULL),
      ('asset_embeddings', 'processing_claim_token', 'text', FALSE, NULL),
      ('asset_embeddings', 'revive_count', 'integer', TRUE, '0'),
      ('asset_embeddings', 'image_embedding', 'vector(768)', FALSE, NULL),
      ('embedding_provider_circuits', 'generation', 'integer', TRUE, '0'),
      ('embedding_provider_circuits', 'probe_until', 'timestamp(3) without time zone', FALSE, NULL),
      ('embedding_provider_circuits', 'probe_generation', 'integer', FALSE, NULL),
      ('embedding_provider_circuits', 'probe_lease_token', 'text', FALSE, NULL)
    ) AS expected(table_name, column_name, type_name, not_null, column_default)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class table_catalog
      JOIN pg_catalog.pg_namespace namespace_catalog ON namespace_catalog.oid = table_catalog.relnamespace
      JOIN pg_catalog.pg_attribute attribute_catalog ON attribute_catalog.attrelid = table_catalog.oid
      LEFT JOIN pg_catalog.pg_attrdef default_catalog
        ON default_catalog.adrelid = attribute_catalog.attrelid
       AND default_catalog.adnum = attribute_catalog.attnum
      WHERE namespace_catalog.nspname = 'public'
        AND table_catalog.relname = expected.table_name
        AND attribute_catalog.attname = expected.column_name
        AND pg_catalog.format_type(attribute_catalog.atttypid, attribute_catalog.atttypmod) = expected.type_name
        AND attribute_catalog.attnotnull = expected.not_null
        AND pg_catalog.pg_get_expr(default_catalog.adbin, default_catalog.adrelid) IS NOT DISTINCT FROM expected.column_default
        AND attribute_catalog.attnum > 0
        AND NOT attribute_catalog.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'final embedding column type/default/nullability contract is incomplete';
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      -- pg_get_triggerdef emits multi-event triggers in catalog bit order,
      -- independent of the order used by CREATE TRIGGER.
      ('stripe_cancellation_events_append_only', 'create trigger stripe_cancellation_events_append_only before delete or update on stripe_cancellation_events for each row execute function sploot_stripe_ledger_append_only()', 'A', 'sploot_stripe_ledger_owner'),
      ('stripe_cancellation_audit_append_only', 'create trigger stripe_cancellation_audit_append_only before delete or update on stripe_cancellation_audit for each row execute function sploot_stripe_ledger_append_only()', 'A', 'sploot_stripe_ledger_owner'),
      ('stripe_cancellation_maintenance_append_only', 'create trigger stripe_cancellation_maintenance_append_only before delete or update on stripe_cancellation_maintenance for each row execute function sploot_stripe_ledger_append_only()', 'A', 'sploot_stripe_ledger_owner'),
      ('asset_embeddings_revival_budget', 'create trigger asset_embeddings_revival_budget before update on asset_embeddings for each row execute function enforce_asset_embedding_revival_budget()', 'O', 'sploot_stripe_schema_migrator')
    ) AS expected(trigger_name, definition, enabled, function_owner)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_trigger trigger_catalog
      JOIN pg_catalog.pg_class table_catalog ON table_catalog.oid = trigger_catalog.tgrelid
      JOIN pg_catalog.pg_namespace namespace_catalog ON namespace_catalog.oid = table_catalog.relnamespace
      JOIN pg_catalog.pg_proc function_catalog ON function_catalog.oid = trigger_catalog.tgfoid
      WHERE namespace_catalog.nspname = 'public'
        AND trigger_catalog.tgname = expected.trigger_name
        AND NOT trigger_catalog.tgisinternal
        AND trigger_catalog.tgenabled = expected.enabled
        AND pg_catalog.pg_get_userbyid(function_catalog.proowner) = expected.function_owner
        AND replace(replace(regexp_replace(lower(pg_catalog.pg_get_triggerdef(trigger_catalog.oid)), '\s+', '', 'g'), '"', ''), 'public.', '')
            = replace(replace(regexp_replace(expected.definition, '\s+', '', 'g'), '"', ''), 'public.', '')
    )
  ) THEN
    RAISE EXCEPTION 'final trigger definition/owner contract is incomplete';
  END IF;
END;
$$;

-- The bootstrap contract is not ready unless the final embedding resilience
-- schema is present. This closes the old false-green path that checked only
-- the early limiter tables/circuit breaker.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'asset_embeddings'
      AND column_name = 'processing_claim_token'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'asset_embeddings'
      AND column_name = 'revive_count'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'asset_embeddings_processing_claim_token_state'
      AND t.relname = 'asset_embeddings'
      AND n.nspname = 'public'
      AND c.convalidated
      AND regexp_replace(regexp_replace(lower(pg_get_constraintdef(c.oid)), '\s+', '', 'g'), '::[a-z_][a-z0-9_]*(\([0-9]+\))?', '', 'g')
          = 'check(((processing_claim_tokenisnull)or(status=''processing'')))'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'asset_embeddings_revive_count_bounded'
      AND t.relname = 'asset_embeddings'
      AND n.nspname = 'public'
      AND c.convalidated
      AND regexp_replace(regexp_replace(lower(pg_get_constraintdef(c.oid)), '\s+', '', 'g'), '::[a-z_][a-z0-9_]*(\([0-9]+\))?', '', 'g')
          = 'check(((revive_count>=0)and(revive_count<=1)))'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_trigger tr
    JOIN pg_class t ON t.oid = tr.tgrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_proc fn ON fn.oid = tr.tgfoid
    WHERE tr.tgname = 'asset_embeddings_revival_budget'
      AND t.relname = 'asset_embeddings'
      AND n.nspname = 'public'
      AND NOT tr.tgisinternal
      AND pg_get_userbyid(fn.proowner) = 'sploot_stripe_schema_migrator'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'asset_embeddings'
      AND column_name = 'attempt_count'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'asset_embeddings'
      AND column_name = 'next_attempt_at'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'asset_embeddings'
      AND column_name = 'terminal_at'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'embedding_provider_circuits'
      AND column_name = 'generation'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'embedding_provider_circuits'
      AND column_name = 'probe_until'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'embedding_provider_circuits'
      AND column_name = 'probe_generation'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'embedding_provider_circuits'
      AND column_name = 'probe_lease_token'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'embedding_attempt_count_ceiling'
      AND t.relname = 'embedding_rate_buckets'
      AND n.nspname = 'public'
      AND c.convalidated
      AND regexp_replace(regexp_replace(lower(pg_get_constraintdef(c.oid)), '\s+', '', 'g'), '::[a-z_][a-z0-9_]*(\([0-9]+\))?', '', 'g')
          = 'check((((key!~~''embedding:daily:%'')or(count<=2272))and((key!~~''embedding:monthly:%'')or(count<=68181))))'
  ) OR to_regclass('public.asset_embeddings_pending_next_attempt_idx') IS NULL
    OR to_regclass('public.embedding_provider_circuits_open_until_idx') IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_index i ON i.indexrelid = c.oid
      WHERE n.nspname = 'public'
        AND c.relname = 'asset_embeddings_pending_next_attempt_idx'
        AND pg_get_userbyid(c.relowner) = 'sploot_stripe_schema_migrator'
        AND regexp_replace(regexp_replace(lower(pg_get_indexdef(i.indexrelid)), '\s+', '', 'g'), '["]', '', 'g')
            = 'createindexasset_embeddings_pending_next_attempt_idxonpublic.asset_embeddingsusingbtree(status,next_attempt_at,createdat)where((status=''pending''::text)and(terminal_atisnull))'
    ) OR NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_index i ON i.indexrelid = c.oid
      WHERE n.nspname = 'public'
        AND c.relname = 'embedding_provider_circuits_open_until_idx'
        AND pg_get_userbyid(c.relowner) = 'sploot_stripe_schema_migrator'
        AND regexp_replace(regexp_replace(lower(pg_get_indexdef(i.indexrelid)), '\s+', '', 'g'), '["]', '', 'g')
            = 'createindexembedding_provider_circuits_open_until_idxonpublic.embedding_provider_circuitsusingbtree(open_until)'
    ) OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relname = ANY (ARRAY[
              'stripe_cancellation_events', 'stripe_cancellation_audit',
              'stripe_cancellation_alerts', 'stripe_cancellation_deliveries',
              'stripe_cancellation_maintenance', 'stripe_cancellation_maintenance_tokens'
            ])
            AND pg_get_userbyid(c.relowner) = 'sploot_stripe_ledger_owner') <> 6
    OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname = ANY (ARRAY[
              'sploot_append_stripe_event', 'sploot_record_stripe_cancellation',
              'sploot_append_stripe_audit', 'sploot_stripe_claim_deliveries',
              'sploot_stripe_drain_deliveries', 'sploot_stripe_complete_delivery',
              'sploot_replay_stripe_dead_letter', 'sploot_stripe_delivery_health',
              'sploot_issue_stripe_maintenance_token', 'sploot_stripe_ledger_append_only',
              'sploot_purge_stripe_audit', 'sploot_purge_stripe_raw_provenance'
            ])
            AND pg_get_userbyid(p.proowner) = 'sploot_stripe_ledger_owner') <> 12
  THEN
    RAISE EXCEPTION 'final embedding claim-token schema contract is incomplete';
  END IF;
END;
$$;

UPDATE sploot_bootstrap.stripe_ledger_bootstrap_state
SET phase = 'ready', version = current_setting('sploot.bootstrap_version'), updated_at = CURRENT_TIMESTAMP,
    ready_digest = encode(public.digest('stripe-ledger-bootstrap|ready|' || current_setting('sploot.bootstrap_version'), 'sha256'), 'hex')
WHERE id = TRUE;
COMMIT;
