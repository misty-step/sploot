# Upload idempotency receipt migration

This migration adds a new receipt table; no existing rows require a backfill.
The forward migration is transactional (`BEGIN`/`COMMIT`) and creates both
lease and replay-retention indexes before adding the user foreign key.

Readback after applying:

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'upload_idempotency'
ORDER BY ordinal_position;
```

The expected readback includes `owner_user_id`, `key`, `status`, `result`,
`lease_token`, `lease_expires_at`, and `retained_until`. The receipt cleanup
policy retains completed results for seven days, longer than the 24-hour local
queue retry window, then deletes only completed expired receipts.

Rollback is explicit and transactional in `rollback.sql`; it is an operator
action, not part of Prisma's forward migration history. Rollback is safe only
before this receipt contract is relied upon by live queued retries.
