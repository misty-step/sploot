-- Durable, append-audited Stripe cancellation monitoring state. Event and
-- audit rows are intentionally not given update/delete paths in application
-- code; alert delivery flags are the only mutable operational state.
CREATE TABLE "stripe_cancellation_events" (
  "event_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "created_epoch" INTEGER NOT NULL,
  "payload_digest" TEXT NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stripe_cancellation_events_pkey" PRIMARY KEY ("event_id")
);

CREATE INDEX "stripe_cancellation_events_created_epoch_idx"
  ON "stripe_cancellation_events"("created_epoch");

CREATE TABLE "stripe_cancellation_alerts" (
  "alert_key" TEXT NOT NULL,
  "window_start" INTEGER NOT NULL,
  "window_seconds" INTEGER NOT NULL,
  "count" INTEGER NOT NULL,
  "event_ids" JSONB NOT NULL,
  "circuit_opened" BOOLEAN NOT NULL DEFAULT false,
  "page_sent" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "stripe_cancellation_alerts_pkey" PRIMARY KEY ("alert_key")
);

CREATE TABLE "stripe_cancellation_audit" (
  "id" TEXT NOT NULL,
  "event_id" TEXT,
  "alert_key" TEXT,
  "action" TEXT NOT NULL,
  "provenance_digest" TEXT NOT NULL,
  "details" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stripe_cancellation_audit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stripe_cancellation_audit_event_id_created_at_idx"
  ON "stripe_cancellation_audit"("event_id", "created_at");
CREATE INDEX "stripe_cancellation_audit_alert_key_created_at_idx"
  ON "stripe_cancellation_audit"("alert_key", "created_at");
