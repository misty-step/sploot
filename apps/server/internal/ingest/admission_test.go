package ingest

import (
	"context"
	"errors"
	"testing"
	"testing/synctest"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/model"
)

type admissionResult struct {
	name string
	err  error
}

func queueIngest(ctx context.Context, admission *ingestAdmission, owner, name string, results chan<- admissionResult, proceed <-chan struct{}) {
	go func() {
		err := admission.acquire(ctx, owner)
		results <- admissionResult{name, err}
		if err == nil {
			select {
			case <-ctx.Done():
			case <-proceed:
			}
			admission.release()
		}
	}()
}

func TestIngestAdmissionOverflowIsImmediate(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		ctx := t.Context()
		var admission ingestAdmission
		if err := admission.acquire(ctx, "active"); err != nil {
			t.Fatal(err)
		}
		results := make(chan admissionResult, ingestQueueLimit+1)
		proceed := make(chan struct{})
		for i := range ingestQueueLimit {
			queueIngest(ctx, &admission, string(rune('a'+i)), string(rune('a'+i)), results, proceed)
			synctest.Wait()
		}
		err := admission.acquire(ctx, "overflow")
		var api *model.APIError
		if !errors.As(err, &api) || api.Status != 429 || api.Code != "upload_busy" || !api.Retryable || api.RetryAfter != ingestRetryAfter {
			t.Fatalf("overflow must reject without waiting: %v", err)
		}
		select {
		case result := <-results:
			t.Fatalf("overflow blocked a queued save: %+v", result)
		default:
		}
		admission.release()
		for range ingestQueueLimit {
			result := <-results
			if result.err != nil {
				t.Fatalf("queued save was not admitted after overflow: %+v", result)
			}
			proceed <- struct{}{}
		}
		synctest.Wait()
	})
}

func TestIngestAdmissionPrefersAnotherOwner(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		ctx := t.Context()
		var admission ingestAdmission
		if err := admission.acquire(ctx, "owner-a"); err != nil {
			t.Fatal(err)
		}
		results := make(chan admissionResult, 3)
		proceed := make(chan struct{})
		queueIngest(ctx, &admission, "owner-a", "a-again", results, proceed)
		synctest.Wait()
		if err := admission.acquire(ctx, "owner-a"); !busyError(err) {
			t.Fatalf("owner with a waiting save was not rejected promptly: %v", err)
		}
		queueIngest(ctx, &admission, "owner-b", "b", results, proceed)
		synctest.Wait()
		select {
		case result := <-results:
			t.Fatalf("another owner was not allowed to wait: %+v", result)
		default:
		}
		admission.release()
		synctest.Wait()
		if result := <-results; result.name != "b" || result.err != nil {
			t.Fatalf("another owner did not receive the next turn: %+v", result)
		}
		select {
		case result := <-results:
			t.Fatalf("the same owner ran ahead of the other owner: %+v", result)
		default:
		}
		proceed <- struct{}{}
		synctest.Wait()
		if result := <-results; result.name != "a-again" || result.err != nil {
			t.Fatalf("the first owner did not run after the other owner: %+v", result)
		}
		proceed <- struct{}{}
		synctest.Wait()
	})
}

func TestIngestAdmissionCancellationReleasesCapacity(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		ctx := t.Context()
		var admission ingestAdmission
		if err := admission.acquire(ctx, "active"); err != nil {
			t.Fatal(err)
		}
		results := make(chan admissionResult, ingestQueueLimit+1)
		proceed := make(chan struct{})
		cancellations := make([]context.CancelFunc, ingestQueueLimit)
		for i := range ingestQueueLimit {
			var waiting context.Context
			waiting, cancellations[i] = context.WithCancel(ctx)
			name := string(rune('a' + i))
			queueIngest(waiting, &admission, name, name, results, proceed)
			synctest.Wait()
		}
		if err := admission.acquire(ctx, "overflow"); !busyError(err) {
			t.Fatalf("full queue did not reject: %v", err)
		}
		canceled := string(rune('a' + 1))
		cancellations[1]()
		synctest.Wait()
		if result := <-results; result.name != canceled || !errors.Is(result.err, context.Canceled) {
			t.Fatalf("canceled waiter was not removed: %+v", result)
		}
		queueIngest(ctx, &admission, "replacement", "replacement", results, proceed)
		synctest.Wait()
		select {
		case result := <-results:
			t.Fatalf("cancellation did not free a waiting place: %+v", result)
		default:
		}
		admission.release()
		seen := map[string]bool{}
		for range ingestQueueLimit {
			result := <-results
			if result.err != nil || seen[result.name] {
				t.Fatalf("surviving waiter was not admitted once: %+v", result)
			}
			seen[result.name] = true
			proceed <- struct{}{}
			synctest.Wait()
		}
		for i := range ingestQueueLimit {
			name := string(rune('a' + i))
			if name != canceled && !seen[name] {
				t.Fatalf("waiter %s did not run after cancellation: %v", name, seen)
			}
		}
		if !seen["replacement"] {
			t.Fatalf("replacement did not run after cancellation: %v", seen)
		}
	})
}

func TestIngestAdmissionWaitExpiryReturns429(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		ctx := t.Context()
		var admission ingestAdmission
		if err := admission.acquire(ctx, "active"); err != nil {
			t.Fatal(err)
		}
		results := make(chan admissionResult, 1)
		proceed := make(chan struct{})
		queueIngest(ctx, &admission, "waiting", "waiting", results, proceed)
		synctest.Wait()
		time.Sleep(ingestWaitTimeout)
		synctest.Wait()
		if result := <-results; result.name != "waiting" || !busyError(result.err) {
			t.Fatalf("expired wait did not return 429: %+v", result)
		}
		queueIngest(ctx, &admission, "next", "next", results, proceed)
		synctest.Wait()
		select {
		case result := <-results:
			t.Fatalf("expired waiter still occupied the queue: %+v", result)
		default:
		}
		admission.release()
		if result := <-results; result.name != "next" || result.err != nil {
			t.Fatalf("the freed place was not given to the next save: %+v", result)
		}
		proceed <- struct{}{}
		synctest.Wait()
	})
}

func TestIngestAdmissionCancellationAfterGrantReleasesSlot(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		ctx := t.Context()
		var admission ingestAdmission
		if err := admission.acquire(ctx, "active"); err != nil {
			t.Fatal(err)
		}
		waiting, stopWaiting := context.WithCancel(ctx)
		defer stopWaiting()
		results := make(chan admissionResult, 2)
		proceed := make(chan struct{})
		queueIngest(waiting, &admission, "canceled", "canceled", results, proceed)
		synctest.Wait()
		queueIngest(ctx, &admission, "other", "other", results, proceed)
		synctest.Wait()
		admission.release()
		stopWaiting()
		synctest.Wait()
		first, second := <-results, <-results
		var canceled, other admissionResult
		if first.name == "canceled" {
			canceled, other = first, second
		} else {
			canceled, other = second, first
		}
		if canceled.name != "canceled" || (canceled.err != nil && !errors.Is(canceled.err, context.Canceled)) || other.name != "other" || other.err != nil {
			t.Fatalf("canceled grant leaked the save slot: %+v %+v", first, second)
		}
		proceed <- struct{}{}
		synctest.Wait()
	})
}

func busyError(err error) bool {
	var api *model.APIError
	return errors.As(err, &api) && api.Status == 429 && api.Code == "upload_busy" && api.Retryable && api.RetryAfter == ingestRetryAfter
}
