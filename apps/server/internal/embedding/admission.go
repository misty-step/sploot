package embedding

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

var errClaimLost = errors.New("embedding processing claim was lost")

type circuitLease struct {
	generation      int
	probeGeneration *int
	token           *string
}

type paidAdmission struct {
	id      string
	owner   string
	circuit circuitLease
}

type circuitState struct {
	generation int
	openUntil  *time.Time
	probeUntil *time.Time
}

// reserve admits one prediction, never a retrying HTTP operation. All counters,
// the provider probe and the worker attempt are committed together before POST.
// A crash may conservatively consume an attempt; it can never create free work.
func (s *Service) reserve(ctx context.Context, owner, capability string, job *claim) (paidAdmission, error) {
	admission, err := s.reserveTransaction(ctx, owner, capability, job)
	if err == nil || errors.Is(err, errClaimLost) {
		return admission, err
	}
	var denied *admissionError
	if errors.As(err, &denied) {
		return admission, err
	}
	s.opts.Logger.Error("embedding-admission.database-failed", "error", err)
	s.report("embedding-admission.store-unavailable", "limiter_unavailable", 30)
	return paidAdmission{}, &admissionError{reason: "limiter_unavailable", retryAfter: 30}
}

func (s *Service) reserveTransaction(ctx context.Context, owner, capability string, job *claim) (paidAdmission, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return paidAdmission{}, err
	}
	defer tx.Rollback(context.Background())
	// Match the existing Node lock namespaces during overlap. The old runtime
	// never nests cost or circuit transactions inside a held limiter lock.
	for _, lock := range []string{limiterLock, "sploot:enrollment:user:" + owner, costLock, circuitLock} {
		if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, lock); err != nil {
			return paidAdmission{}, err
		}
	}
	var userID string
	if err = tx.QueryRow(ctx, `SELECT id FROM users WHERE id=$1 FOR KEY SHARE`, owner).Scan(&userID); err != nil {
		return paidAdmission{}, err
	}
	var now time.Time
	if err = tx.QueryRow(ctx, `SELECT clock_timestamp()`).Scan(&now); err != nil {
		return paidAdmission{}, err
	}
	now = now.UTC()
	for _, statement := range []string{
		`DELETE FROM embedding_rate_leases WHERE expires_at <= $1`,
		`DELETE FROM embedding_rate_buckets WHERE expires_at <= $1`,
		`DELETE FROM cost_admission_counters WHERE expires_at <= $1`,
	} {
		if _, err = tx.Exec(ctx, statement, now); err != nil {
			return paidAdmission{}, err
		}
	}
	if _, err = tx.Exec(ctx, `INSERT INTO embedding_provider_circuits (key,updated_at) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING`, providerCircuitKey, now); err != nil {
		return paidAdmission{}, err
	}
	var circuit circuitState
	if err = tx.QueryRow(ctx, `SELECT generation,open_until,probe_until FROM embedding_provider_circuits WHERE key=$1 FOR UPDATE`, providerCircuitKey).Scan(&circuit.generation, &circuit.openUntil, &circuit.probeUntil); err != nil {
		return paidAdmission{}, err
	}
	for _, until := range []*time.Time{circuit.openUntil, circuit.probeUntil} {
		if until != nil && until.After(now) {
			return paidAdmission{}, &admissionError{"provider_circuit_open", retrySeconds(*until, now)}
		}
	}

	minute := now.Unix() / 60
	windowEnd := time.Unix((minute+1)*60, 0).UTC()
	indexPeriod := now.Unix() / int64(indexWindow/time.Second)
	indexEnd := time.Unix((indexPeriod+1)*int64(indexWindow/time.Second), 0).UTC()
	rateKeys := []string{
		fmt.Sprintf("embedding:rate:user:%s:%d", owner, minute),
		fmt.Sprintf("embedding:rate:global:%d", minute),
		"embedding:daily:" + now.Format("2006-01-02"),
		"embedding:monthly:" + now.Format("2006-01"),
		fmt.Sprintf("embedding:index:window:%d", indexPeriod),
	}
	costKeys := []string{
		"cost:" + capability + ":acct:" + owner + ":daily:" + now.Format("2006-01-02"),
		"cost:" + capability + ":acct:" + owner + ":monthly:" + now.Format("2006-01"),
	}
	rates, err := readCounters(ctx, tx, `SELECT key,count FROM embedding_rate_buckets WHERE key=ANY($1::text[])`, rateKeys)
	if err != nil {
		return paidAdmission{}, err
	}
	costs, err := readCounters(ctx, tx, `SELECT key,count FROM cost_admission_counters WHERE key=ANY($1::text[])`, costKeys)
	if err != nil {
		return paidAdmission{}, err
	}
	var userInflight, globalInflight int
	if err = tx.QueryRow(ctx, `SELECT count(*) FILTER (WHERE user_id=$1),count(*) FROM embedding_rate_leases WHERE expires_at>$2`, owner, now).Scan(&userInflight, &globalInflight); err != nil {
		return paidAdmission{}, err
	}
	checks := []struct {
		count, limit int
		reason       string
		until        time.Time
	}{
		{userInflight, userConcurrencyLimit, "user_concurrency", now.Add(inflightTTL)},
		{globalInflight, globalConcurrencyLimit, "global_concurrency", now.Add(inflightTTL)},
		{rates[rateKeys[0]], userMinuteLimit, "user_rate", windowEnd},
		{rates[rateKeys[1]], globalMinuteLimit, "global_rate", windowEnd},
		{rates[rateKeys[2]], s.opts.GlobalDailyAttempts, "daily_budget", nextDay(now)},
		{rates[rateKeys[3]], s.opts.GlobalMonthlyAttempts, "monthly_budget", nextMonth(now)},
		{costs[costKeys[0]], s.opts.UserDailyAttempts, "user_daily_budget", nextDay(now)},
		{costs[costKeys[1]], s.opts.UserMonthlyAttempts, "user_monthly_budget", nextMonth(now)},
	}
	if job != nil {
		checks = append(checks, struct {
			count, limit int
			reason       string
			until        time.Time
		}{rates[rateKeys[4]], indexWindowLimit, "index_window", indexEnd})
	}
	for _, check := range checks {
		if check.count < check.limit {
			continue
		}
		denied := &admissionError{check.reason, retrySeconds(check.until, now)}
		if circuitOpening(check.reason) {
			if _, err = tx.Exec(ctx, `UPDATE embedding_provider_circuits SET failure_count=failure_count+1,generation=generation+1,
				open_until=$2,probe_until=NULL,probe_generation=NULL,probe_lease_token=NULL,last_reason=$3,last_failure_at=$4,last_alerted_at=$4,updated_at=$4 WHERE key=$1`,
				providerCircuitKey, now.Add(time.Duration(max(30, denied.retryAfter))*time.Second), check.reason, now); err != nil {
				return paidAdmission{}, err
			}
		}
		if err = tx.Commit(ctx); err != nil {
			return paidAdmission{}, err
		}
		if circuitOpening(check.reason) {
			s.report("embedding-provider.circuit-open", check.reason, denied.retryAfter)
		}
		return paidAdmission{}, denied
	}

	if job != nil {
		changed, claimErr := tx.Exec(ctx, `UPDATE asset_embeddings e SET attempt_count=attempt_count+1,"updatedAt"=$4
			WHERE asset_id=$1 AND owner_user_id=$2 AND processing_claim_token=$3 AND status='processing'
			AND terminal_at IS NULL AND image_embedding IS NULL AND dim=0 AND attempt_count<$5
			AND "updatedAt">$4::timestamp-$6::interval
			AND EXISTS (SELECT 1 FROM assets a WHERE a.id=e.asset_id AND a.owner_user_id=$2 AND a.deleted_at IS NULL)`,
			job.id, owner, job.token, now, maxAttempts, durationInterval(processingTTL))
		if claimErr != nil {
			return paidAdmission{}, claimErr
		}
		if changed.RowsAffected() != 1 {
			return paidAdmission{}, errClaimLost
		}
	}

	expires := []time.Time{windowEnd, windowEnd, now.Add(26 * time.Hour), now.Add(32 * 24 * time.Hour)}
	keys := rateKeys[:4]
	if job != nil {
		keys = rateKeys
		expires = append(expires, indexEnd)
	}
	for i, key := range keys {
		if _, err = tx.Exec(ctx, `INSERT INTO embedding_rate_buckets (key,count,expires_at,updated_at) VALUES ($1,1,$2,$3)
			ON CONFLICT (key) DO UPDATE SET count=embedding_rate_buckets.count+1,expires_at=EXCLUDED.expires_at,updated_at=EXCLUDED.updated_at`, key, expires[i], now); err != nil {
			return paidAdmission{}, err
		}
	}
	for i, key := range costKeys {
		if _, err = tx.Exec(ctx, `INSERT INTO cost_admission_counters (key,count,expires_at,updated_at) VALUES ($1,1,$2,$3)
			ON CONFLICT (key) DO UPDATE SET count=cost_admission_counters.count+1,expires_at=EXCLUDED.expires_at,updated_at=EXCLUDED.updated_at`, key, expires[i+2], now); err != nil {
			return paidAdmission{}, err
		}
	}
	lease := paidAdmission{id: newToken(), owner: owner, circuit: circuitLease{generation: circuit.generation}}
	if _, err = tx.Exec(ctx, `INSERT INTO embedding_rate_leases (id,user_id,expires_at) VALUES ($1,$2,$3)`, lease.id, owner, now.Add(inflightTTL)); err != nil {
		return paidAdmission{}, err
	}
	if circuit.openUntil != nil {
		token := newToken()
		lease.circuit.token = &token
		lease.circuit.probeGeneration = &lease.circuit.generation
		if _, err = tx.Exec(ctx, `UPDATE embedding_provider_circuits SET probe_until=$2,probe_generation=generation,probe_lease_token=$3,updated_at=$4 WHERE key=$1`, providerCircuitKey, now.Add(probeTTL), token, now); err != nil {
			return paidAdmission{}, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return paidAdmission{}, err
	}
	if (costs[costKeys[0]]+1)*5 >= s.opts.UserDailyAttempts*4 || (costs[costKeys[1]]+1)*5 >= s.opts.UserMonthlyAttempts*4 {
		s.opts.Logger.Warn("cost-admission.warn-threshold", "capability", capability, "user_id", owner, "daily_count", costs[costKeys[0]]+1, "monthly_count", costs[costKeys[1]]+1)
	}
	return lease, nil
}

func readCounters(ctx context.Context, tx pgx.Tx, query string, keys []string) (map[string]int, error) {
	rows, err := tx.Query(ctx, query, keys)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	counts := make(map[string]int, len(keys))
	for rows.Next() {
		var key string
		var count int
		if err := rows.Scan(&key, &count); err != nil {
			return nil, err
		}
		counts[key] = count
	}
	return counts, rows.Err()
}

func circuitOpening(reason string) bool {
	return reason == "global_rate" || reason == "daily_budget" || reason == "monthly_budget" || reason == "limiter_unavailable"
}
func durationInterval(duration time.Duration) string {
	return fmt.Sprintf("%d seconds", int64(duration/time.Second))
}

func (s *Service) release(admission paidAdmission) {
	ctx, cancel := detachedContext()
	defer cancel()
	if _, err := s.pool.Exec(ctx, `DELETE FROM embedding_rate_leases WHERE id=$1 AND user_id=$2`, admission.id, admission.owner); err != nil {
		s.opts.Logger.Error("embedding-admission.release-failed", "error", err)
	}
}

func (s *Service) settleCircuit(lease circuitLease, failure *providerError) {
	if failure == nil && lease.token == nil {
		return
	}
	if failure != nil && failure.reason != "provider_rate_limit" && failure.reason != "provider_unavailable" {
		return
	}
	ctx, cancel := detachedContext()
	defer cancel()
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		s.report("embedding-provider.circuit-write-failed", "limiter_unavailable", 30)
		return
	}
	defer tx.Rollback(context.Background())
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, circuitLock); err != nil {
		s.report("embedding-provider.circuit-write-failed", "limiter_unavailable", 30)
		return
	}
	var applied int64
	if failure == nil {
		result, execErr := tx.Exec(ctx, `UPDATE embedding_provider_circuits SET failure_count=0,generation=generation+1,
			open_until=NULL,probe_until=NULL,probe_generation=NULL,probe_lease_token=NULL,last_reason=NULL,updated_at=CURRENT_TIMESTAMP
			WHERE key=$1 AND generation=$2 AND probe_generation IS NOT DISTINCT FROM $3::integer
			AND probe_lease_token IS NOT DISTINCT FROM $4::text AND (open_until IS NULL OR open_until<=CURRENT_TIMESTAMP)`,
			providerCircuitKey, lease.generation, lease.probeGeneration, lease.token)
		err = execErr
		applied = result.RowsAffected()
	} else {
		result, execErr := tx.Exec(ctx, `UPDATE embedding_provider_circuits SET failure_count=failure_count+1,generation=generation+1,
			open_until=CURRENT_TIMESTAMP+$5::interval,probe_until=NULL,probe_generation=NULL,probe_lease_token=NULL,
			last_reason=$6,last_failure_at=CURRENT_TIMESTAMP,last_alerted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
			WHERE key=$1 AND generation=$2 AND probe_generation IS NOT DISTINCT FROM $3::integer
			AND probe_lease_token IS NOT DISTINCT FROM $4::text`,
			providerCircuitKey, lease.generation, lease.probeGeneration, lease.token, durationInterval(time.Duration(max(30, failure.retryAfter))*time.Second), failure.reason)
		err = execErr
		applied = result.RowsAffected()
	}
	if err == nil {
		err = tx.Commit(ctx)
	}
	if err != nil {
		s.report("embedding-provider.circuit-write-failed", "limiter_unavailable", 30)
		return
	}
	if failure != nil && applied == 1 {
		s.report("embedding-provider.circuit-open", failure.reason, max(30, failure.retryAfter))
	}
}
