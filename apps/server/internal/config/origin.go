package config

import (
	"errors"
	"net"
	"net/url"
	"strings"
)

var (
	// ErrOrigin is a value that is not an HTTP(S) origin: scheme plus host,
	// with no userinfo, path, query, fragment, or opaque data.
	ErrOrigin = errors.New("origin must be an HTTP(S) origin without credentials, path or query")
	// ErrOriginRequiresHTTPS is HTTP to a host that is not loopback. Public
	// and hosted origins are HTTPS; loopback may use HTTP.
	ErrOriginRequiresHTTPS = errors.New("non-loopback origin requires HTTPS")
)

// ParseOrigin returns the canonical application origin. Trailing "/" is the
// origin itself and is stripped; every other path, query, or credential is
// rejected. The returned URL has an empty path and a lowercase host.
func ParseOrigin(value string) (*url.URL, error) {
	base, err := url.Parse(value)
	if err != nil || base == nil || (base.Scheme != "http" && base.Scheme != "https") ||
		base.Hostname() == "" || base.User != nil || base.Opaque != "" ||
		base.RawQuery != "" || base.ForceQuery || base.Fragment != "" ||
		base.RawFragment != "" || base.RawPath != "" ||
		(base.Path != "" && base.Path != "/") {
		return nil, ErrOrigin
	}
	if base.Scheme != "https" && !IsLoopbackHost(base.Hostname()) {
		return nil, ErrOriginRequiresHTTPS
	}
	base.Host = strings.ToLower(base.Host)
	base.Path = ""
	return base, nil
}

// IsLoopbackHost reports whether host is a loopback DNS name or IP. It does
// not treat *.localhost or link-local addresses as loopback.
func IsLoopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
