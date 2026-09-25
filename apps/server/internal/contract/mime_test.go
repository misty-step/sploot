package contract

import "testing"

func TestNormalizeMIMECanonicalizesWireAliases(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{"image/jpeg", "image/jpeg"},
		{"IMAGE/JPG; charset=utf-8", "image/jpeg"},
		{" image/png ", "image/png"},
		{"video/mp4; codecs=avc1", "video/mp4"},
		{"text/html", "text/html"},
	}
	for _, test := range cases {
		if got := NormalizeMIME(test.input); got != test.want {
			t.Fatalf("NormalizeMIME(%q)=%q, want %q", test.input, got, test.want)
		}
	}
	if !IsAllowedMIME("IMAGE/JPG") || !IsAllowedMIME("image/jpeg") {
		t.Fatal("jpeg wire aliases must remain allowed")
	}
	if IsAllowedMIME("text/html") {
		t.Fatal("unlisted types must stay rejected after normalization")
	}
}
