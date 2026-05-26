# shuffle query evidence

Captured on 2026-05-18 against local pgvector Postgres
`postgresql://test:****@localhost:5432/sploot_test?sslmode=disable`.

Dataset:

- temporary user `explain-shuffle-user`
- 10,000 live assets
- random `shuffle_key` values
- query shape matching `/api/assets?sortBy=shuffle&shuffleSeed=500000&limit=50`

Query plan summary:

```text
Limit
  -> Index Scan using assets_owner_live_shuffle_key_id_idx on assets a
       Index Cond: owner_user_id = explain-shuffle-user
                   and shuffle_key >= 4611686018427387903
Execution Time: 0.111 ms
Buffers: shared hit=53
```

The plan proves the shipped seeded ring segment query can seek into
`assets_owner_live_shuffle_key_id_idx` and stop after the page limit. It avoids
`ORDER BY RANDOM()` and avoids sorting all matching user assets before limiting;
the final sort is only over the 50 picked rows after the index-backed limit.
