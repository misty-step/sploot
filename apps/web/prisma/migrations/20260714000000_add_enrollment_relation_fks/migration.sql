-- Never destroy legacy data as a side effect of deployment. If an earlier
-- runtime left ownerless analytics or leases, stop before DDL so an operator
-- can inventory, preserve, and deliberately reconcile those rows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "search_logs" AS search_log
    WHERE NOT EXISTS (
      SELECT 1 FROM "users" AS user_row WHERE user_row."id" = search_log."user_id"
    )
  ) THEN
    RAISE EXCEPTION 'enrollment FK migration refused: orphan search_logs require reconciliation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "embedding_rate_leases" AS lease
    WHERE NOT EXISTS (
      SELECT 1 FROM "users" AS user_row WHERE user_row."id" = lease."user_id"
    )
  ) THEN
    RAISE EXCEPTION 'enrollment FK migration refused: orphan embedding_rate_leases require reconciliation';
  END IF;
END
$$;

ALTER TABLE "search_logs"
ADD CONSTRAINT "search_logs_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "embedding_rate_leases"
ADD CONSTRAINT "embedding_rate_leases_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
