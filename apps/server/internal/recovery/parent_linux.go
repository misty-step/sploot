//go:build linux

package recovery

import (
	"errors"
	"os"

	"golang.org/x/sys/unix"
)

func adoptParentDeathSignal() error {
	if err := unix.Prctl(unix.PR_SET_PDEATHSIG, uintptr(unix.SIGKILL), 0, 0, 0); err != nil {
		return err
	}
	if os.Getppid() == 1 {
		return errors.New("parent process already exited")
	}
	return nil
}
