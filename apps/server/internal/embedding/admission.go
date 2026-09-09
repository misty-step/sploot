package embedding

import (
	"context"
	"errors"
	"sync"
	"time"
)

const (
	interactiveQueueLimit  = 8
	interactiveWaitTimeout = 15 * time.Second
	maxInteractiveBurst    = 4
)

type computeWaiter struct {
	ready   chan struct{}
	granted bool
}

// computeAdmission owns one execution slot, at most eight queued queries and the
// sole indexing executor. FIFO interactive work goes first; a waiting executor
// receives one turn after four queries so a continuous query stream cannot starve
// saved media. It creates no goroutines and never preempts an active native run.
type computeAdmission struct {
	mu         sync.Mutex
	active     bool
	queries    [interactiveQueueLimit]*computeWaiter
	queryCount int
	background *computeWaiter
	burst      int
}

func (a *computeAdmission) acquire(ctx context.Context, interactive bool) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	a.mu.Lock()
	if !a.active {
		a.active = true
		a.mu.Unlock()
		if err := ctx.Err(); err != nil {
			a.release()
			return err
		}
		return nil
	}
	if interactive && a.queryCount == len(a.queries) {
		a.mu.Unlock()
		return admissionBusy()
	}
	if !interactive && a.background != nil {
		a.mu.Unlock()
		return errors.New("embedding executor is already waiting")
	}
	waiter := &computeWaiter{ready: make(chan struct{})}
	if interactive {
		a.queries[a.queryCount] = waiter
		a.queryCount++
	} else {
		a.background = waiter
		a.burst = 0
	}
	a.mu.Unlock()

	select {
	case <-ctx.Done():
	case <-waiter.ready:
	}
	a.mu.Lock()
	if waiter.granted {
		a.mu.Unlock()
		if err := ctx.Err(); err != nil {
			a.release()
			return err
		}
		return nil
	}
	if interactive {
		for i := range a.queryCount {
			if a.queries[i] == waiter {
				a.removeQuery(i)
				break
			}
		}
	} else if a.background == waiter {
		a.background = nil
	}
	a.mu.Unlock()
	return ctx.Err()
}

// removeQuery is called under mu; the fixed backing array never grows.
func (a *computeAdmission) removeQuery(index int) {
	copy(a.queries[index:], a.queries[index+1:a.queryCount])
	a.queryCount--
	a.queries[a.queryCount] = nil
}

func (a *computeAdmission) release() {
	a.mu.Lock()
	defer a.mu.Unlock()
	var next *computeWaiter
	if a.queryCount > 0 && (a.background == nil || a.burst < maxInteractiveBurst) {
		next = a.queries[0]
		a.removeQuery(0)
		if a.background != nil {
			a.burst++
		}
	} else if a.background != nil {
		next = a.background
		a.background = nil
		a.burst = 0
	}
	if next == nil {
		a.active = false
		return
	}
	next.granted = true
	close(next.ready)
}

func admissionBusy() error {
	return apiError(429, "Local search queue is full or its wait expired; retry shortly", "embedding_busy", 1)
}
