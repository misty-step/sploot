package ingest

import (
	"context"
	"sync"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/model"
)

const (
	ingestQueueLimit      = 4
	ingestOwnerQueueLimit = 1
	ingestWaitTimeout     = 2 * time.Second
	ingestRetryAfter      = 1
)

type admissionGrant struct{}

type ingestWaiter struct {
	owner   string
	ready   chan struct{}
	granted bool
}

// ingestAdmission is the in-process save gate shared by byte uploads, share
// targets, and URL fetches. At most four saves wait, for at most two seconds,
// and each owner may hold only one of those places. When the slot frees, the
// earliest waiter from another owner is preferred so one account cannot spend
// the whole queue on itself. Overflow and an expired wait are 429. The gate
// starts no goroutines and does not create idempotency claims.
type ingestAdmission struct {
	mu          sync.Mutex
	active      bool
	activeOwner string
	queue       [ingestQueueLimit]*ingestWaiter
	count       int
}

func admitted(ctx context.Context) bool {
	_, ok := ctx.Value(admissionGrant{}).(struct{})
	return ok
}

func (s *Service) Admit(ctx context.Context, owner string) (context.Context, func(), error) {
	if err := s.ready(owner); err != nil {
		return ctx, nil, err
	}
	return s.admit(ctx, owner)
}

func (s *Service) admit(ctx context.Context, owner string) (context.Context, func(), error) {
	if admitted(ctx) {
		return ctx, func() {}, nil
	}
	if err := s.admission.acquire(ctx, owner); err != nil {
		return ctx, nil, err
	}
	var once sync.Once
	release := func() { once.Do(s.admission.release) }
	return context.WithValue(ctx, admissionGrant{}, struct{}{}), release, nil
}

func (a *ingestAdmission) acquire(ctx context.Context, owner string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	a.mu.Lock()
	if !a.active {
		a.active = true
		a.activeOwner = owner
		a.mu.Unlock()
		if err := ctx.Err(); err != nil {
			a.release()
			return err
		}
		return nil
	}
	if a.count == len(a.queue) || a.ownerWaiting(owner) >= ingestOwnerQueueLimit {
		a.mu.Unlock()
		return uploadBusy()
	}
	waiter := &ingestWaiter{owner: owner, ready: make(chan struct{})}
	a.queue[a.count] = waiter
	a.count++
	a.mu.Unlock()

	timer := time.NewTimer(ingestWaitTimeout)
	defer timer.Stop()
	select {
	case <-ctx.Done():
	case <-timer.C:
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
	a.remove(waiter)
	a.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return err
	}
	return uploadBusy()
}

func (a *ingestAdmission) ownerWaiting(owner string) int {
	waiting := 0
	for i := range a.count {
		if a.queue[i].owner == owner {
			waiting++
		}
	}
	return waiting
}

func (a *ingestAdmission) remove(waiter *ingestWaiter) {
	for i := range a.count {
		if a.queue[i] != waiter {
			continue
		}
		copy(a.queue[i:], a.queue[i+1:a.count])
		a.count--
		a.queue[a.count] = nil
		return
	}
}

func (a *ingestAdmission) release() {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.count == 0 {
		a.active = false
		a.activeOwner = ""
		return
	}
	pick := 0
	for i := range a.count {
		if a.queue[i].owner != a.activeOwner {
			pick = i
			break
		}
	}
	next := a.queue[pick]
	copy(a.queue[pick:], a.queue[pick+1:a.count])
	a.count--
	a.queue[a.count] = nil
	a.active = true
	a.activeOwner = next.owner
	next.granted = true
	close(next.ready)
}

func uploadBusy() error {
	return &model.APIError{
		Status:     429,
		Code:       "upload_busy",
		Message:    "Another upload is being received. Retry shortly.",
		Retryable:  true,
		RetryAfter: ingestRetryAfter,
	}
}

func (s *Service) ready(owner string) error {
	if !s.enabled {
		return &model.APIError{Status: 503, Code: "uploads_disabled", Message: "Uploads are temporarily disabled"}
	}
	if owner == "" {
		return &model.APIError{Status: 401, Message: "Authentication is required"}
	}
	return nil
}
