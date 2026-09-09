package embedding

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"testing/synctest"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/model"
)

type admissionResult struct {
	name string
	err  error
}

func queueAdmission(ctx context.Context, admission *computeAdmission, interactive bool, name string, results chan<- admissionResult, proceed <-chan struct{}) {
	go func() {
		err := admission.acquire(ctx, interactive)
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

func TestInteractiveAdmissionPriorityAndBoundedFairness(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		var admission computeAdmission
		if err := admission.acquire(ctx, false); err != nil {
			t.Fatal(err)
		}
		results := make(chan admissionResult, interactiveQueueLimit+1)
		proceed := make(chan struct{})
		queueAdmission(ctx, &admission, false, "index", results, proceed)
		synctest.Wait()
		for i := range maxInteractiveBurst + 2 {
			queueAdmission(ctx, &admission, true, fmt.Sprintf("query-%d", i), results, proceed)
			synctest.Wait()
		}
		select {
		case result := <-results:
			t.Fatalf("overlapping inference was admitted: %+v", result)
		default:
		}
		admission.release()
		expected := []string{"query-0", "query-1", "query-2", "query-3", "index", "query-4", "query-5"}
		for _, name := range expected {
			result := <-results
			if result.err != nil || result.name != name {
				t.Fatalf("want %s before remaining work, got %+v", name, result)
			}
			synctest.Wait()
			select {
			case other := <-results:
				t.Fatalf("a second native execution was admitted before release: %+v", other)
			default:
			}
			proceed <- struct{}{}
		}
		synctest.Wait()
	})
}

func TestInteractiveAdmissionCapacityCancellationAndDeadline(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		var admission computeAdmission
		if err := admission.acquire(ctx, false); err != nil {
			t.Fatal(err)
		}
		results := make(chan admissionResult, interactiveQueueLimit+1)
		proceed := make(chan struct{})
		cancellations := make([]context.CancelFunc, interactiveQueueLimit)
		for i := range interactiveQueueLimit {
			var waiting context.Context
			waiting, cancellations[i] = context.WithCancel(ctx)
			queueAdmission(waiting, &admission, true, fmt.Sprintf("query-%d", i), results, proceed)
			synctest.Wait()
		}
		var api *model.APIError
		if err := admission.acquire(ctx, true); !errors.As(err, &api) || api.Status != 429 || !api.Retryable {
			t.Fatalf("overflow must reject without waiting: %v", err)
		}
		cancellations[3]()
		synctest.Wait()
		if result := <-results; result.name != "query-3" || !errors.Is(result.err, context.Canceled) {
			t.Fatalf("queued cancellation was not returned: %+v", result)
		}
		deadline, stopDeadline := context.WithTimeout(ctx, time.Second)
		defer stopDeadline()
		queueAdmission(deadline, &admission, true, "replacement", results, proceed)
		synctest.Wait()
		select {
		case result := <-results:
			t.Fatalf("cancellation failed to reclaim queue capacity: %+v", result)
		default:
		}
		time.Sleep(time.Second)
		synctest.Wait()
		if result := <-results; result.name != "replacement" || !errors.Is(result.err, context.DeadlineExceeded) {
			t.Fatalf("queue deadline did not remove the waiter: %+v", result)
		}
		queueAdmission(ctx, &admission, true, "final", results, proceed)
		synctest.Wait()
		admission.release()
		for i := range interactiveQueueLimit {
			if i == 3 {
				continue
			}
			result := <-results
			if result.name != fmt.Sprintf("query-%d", i) || result.err != nil {
				t.Fatalf("cancellation changed surviving FIFO order: %+v", result)
			}
			proceed <- struct{}{}
		}
		if result := <-results; result.name != "final" || result.err != nil {
			t.Fatalf("deadline failed to reclaim its slot: %+v", result)
		}
		proceed <- struct{}{}
		synctest.Wait()
	})
}

func TestInteractiveAdmissionCancellationAfterGrantReleasesSlot(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		var admission computeAdmission
		if err := admission.acquire(ctx, false); err != nil {
			t.Fatal(err)
		}
		waiting, stopWaiting := context.WithCancel(ctx)
		defer stopWaiting()
		results := make(chan admissionResult, 2)
		proceed := make(chan struct{})
		queueAdmission(waiting, &admission, true, "canceled", results, proceed)
		synctest.Wait()
		queueAdmission(ctx, &admission, false, "index", results, proceed)
		synctest.Wait()
		// Race cancellation against a grant. Either return path must relinquish
		// ownership before the waiting index executor can proceed.
		admission.release()
		stopWaiting()
		synctest.Wait()
		first, second := <-results, <-results
		var canceled, index admissionResult
		if first.name == "canceled" {
			canceled, index = first, second
		} else {
			canceled, index = second, first
		}
		if canceled.name != "canceled" || (canceled.err != nil && !errors.Is(canceled.err, context.Canceled)) || index.name != "index" || index.err != nil {
			t.Fatalf("canceled grant leaked execution ownership: %+v %+v", first, second)
		}
		proceed <- struct{}{}
		synctest.Wait()
	})
}
