package predecessor

import "golang.org/x/sys/unix"

func renameNew(source, target string) error {
	return unix.RenamexNp(source, target, unix.RENAME_EXCL)
}
