//go:build !linux

package recovery

func adoptParentDeathSignal() error { return nil }
