package library

import (
	"reflect"
	"testing"
)

func TestTagNormalizationPreservesExistingUnicodeNames(t *testing.T) {
	names, err := normalizeTagNames([]string{"\ufeffΟΣ\ufeff", "ος", "İ", "i\u0307", "\u0085tag\u0085"}, 10)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"ος", "i\u0307", "\u0085tag\u0085"}
	if !reflect.DeepEqual(names, want) {
		t.Fatalf("normalization would split or rename existing tags: got %#v, want %#v", names, want)
	}
}
