package ingest

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"path"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/contract"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

// Fetch returns a bounded stream, not an unbounded response buffer. Always close
// it, including on upload failure. SaveURL additionally protects the fetch with
// the durable idempotency boundary; calling Fetch then Save cannot do that.
func (s *Service) Fetch(ctx context.Context, rawURL string) (io.ReadCloser, string, string, error) {
	if !s.enabled {
		return nil, "", "", &model.APIError{Status: 503, Code: "uploads_disabled", Message: "Uploads are temporarily disabled"}
	}
	response, err := s.OpenRemote(ctx, rawURL, "")
	if err != nil {
		return nil, "", "", err
	}
	fail := func(err error) (io.ReadCloser, string, string, error) {
		_ = response.Body.Close()
		return nil, "", "", err
	}
	if response.StatusCode != http.StatusOK {
		return fail(invalid(fmt.Sprintf("The media URL answered HTTP %d", response.StatusCode)))
	}
	contentType := normalizeMIME(response.Header.Get("Content-Type"))
	if !contract.IsAllowedMIME(contentType) {
		return fail(invalid("The URL does not serve supported image or video media"))
	}
	if response.ContentLength == 0 {
		return fail(invalid("The media URL returned an empty file"))
	}
	filename := path.Base(response.Request.URL.Path)
	if _, disposition, parseErr := mime.ParseMediaType(response.Header.Get("Content-Disposition")); parseErr == nil && disposition["filename"] != "" {
		filename = disposition["filename"]
	}
	filename = safeFilename(filename, contentType)
	return response.Body, filename, contentType, nil
}

// OpenRemote streams an owner-authorized delivery URL, including one byte range.
// The caller owns authorization, response headers, and closing Body. Availability
// does not depend on UploadsEnabled: a read-only library still serves its media.
// Successful statuses are 200, 206, and 416; other upstream statuses are errors.
func (s *Service) OpenRemote(ctx context.Context, rawURL, rangeHeader string) (*http.Response, error) {
	target, err := validateRemoteURL(rawURL, s.localImportOrigin)
	if err != nil {
		return nil, err
	}
	if rangeHeader != "" && !validRange(rangeHeader) {
		return nil, &model.APIError{Status: 416, Code: "INVALID_RANGE", Message: "Use one valid byte range"}
	}
	ctx, cancel := context.WithTimeout(ctx, time.Duration(contract.UploadTimeoutMS)*time.Millisecond)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		cancel()
		return nil, err
	}
	setFetchHeaders(request)
	if rangeHeader != "" {
		request.Header.Set("Range", rangeHeader)
	}
	response, err := s.fetchClient.Do(request)
	if err != nil {
		cancel()
		var apiError *model.APIError
		if errors.As(err, &apiError) {
			return nil, apiError
		}
		return nil, &model.APIError{Status: 400, Code: "invalid_upload", Message: "The remote media could not be fetched"}
	}
	fail := func(err error) (*http.Response, error) { _ = response.Body.Close(); cancel(); return nil, err }
	if response.StatusCode != http.StatusOK && response.StatusCode != http.StatusPartialContent && response.StatusCode != http.StatusRequestedRangeNotSatisfiable {
		return fail(invalid(fmt.Sprintf("The media URL answered HTTP %d", response.StatusCode)))
	}
	if encoding := response.Header.Get("Content-Encoding"); encoding != "" && !strings.EqualFold(strings.TrimSpace(encoding), "identity") {
		return fail(invalid("The remote media must be served without content encoding"))
	}
	if response.ContentLength > int64(contract.UploadMaxBytes) {
		return fail(tooLarge())
	}
	response.Body = &boundedBody{body: response.Body, cancel: cancel, remaining: int64(contract.UploadMaxBytes)}
	return response, nil
}

func validRange(value string) bool {
	if len(value) > 128 || !strings.HasPrefix(value, "bytes=") {
		return false
	}
	start, end, found := strings.Cut(strings.TrimPrefix(value, "bytes="), "-")
	if !found || start == "" && end == "" {
		return false
	}
	parse := func(value string) (int64, bool) {
		for _, digit := range value {
			if digit < '0' || digit > '9' {
				return 0, false
			}
		}
		number, err := strconv.ParseInt(value, 10, 64)
		return number, err == nil
	}
	if start == "" {
		suffix, ok := parse(end)
		return ok && suffix > 0
	}
	first, ok := parse(start)
	if !ok {
		return false
	}
	if end == "" {
		return true
	}
	last, ok := parse(end)
	return ok && last >= first
}

func validateLocalImportOrigin(value string, nonproduction bool) (string, error) {
	if value == "" {
		return "", nil
	}
	if !nonproduction {
		return "", errors.New("a local import origin requires an explicit nonproduction environment")
	}
	u, err := url.Parse(value)
	if err != nil || u.Scheme != "http" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" && u.Path != "/" {
		return "", errors.New("local import origin must be an HTTP loopback IP origin")
	}
	address, err := netip.ParseAddr(u.Hostname())
	if err != nil || !address.Unmap().IsLoopback() || address.Zone() != "" || u.Port() == "" {
		return "", errors.New("local import origin requires a literal loopback IP and an explicit port")
	}
	port, err := strconv.Atoi(u.Port())
	if err != nil || port < 1 || port > 65535 {
		return "", errors.New("invalid local import port")
	}
	return u.Scheme + "://" + u.Host, nil
}

func validateRemoteURL(value, localOrigin string) (*url.URL, error) {
	if len(value) > 8192 {
		return nil, invalid("The media URL is too long")
	}
	u, err := url.Parse(value)
	if err != nil || u.Host == "" || u.Opaque != "" || (u.Scheme != "http" && u.Scheme != "https") {
		return nil, invalid("Use an absolute HTTP or HTTPS media URL")
	}
	if u.User != nil {
		return nil, invalid("Media URLs cannot contain credentials")
	}
	if strings.ContainsAny(u.Host, "%\\") {
		return nil, invalid("The media host is not importable")
	}
	if port := u.Port(); port != "" {
		number, err := strconv.Atoi(port)
		if err != nil || number < 1 || number > 65535 {
			return nil, invalid("Invalid media URL port")
		}
	}
	if localOrigin != "" && u.Scheme+"://"+u.Host == localOrigin {
		return u, nil
	}
	host := strings.ToLower(strings.TrimSuffix(u.Hostname(), "."))
	if host == "localhost" || strings.HasSuffix(host, ".localhost") || strings.HasSuffix(host, ".local") || strings.HasSuffix(host, ".internal") || strings.HasSuffix(host, ".home.arpa") || host == "metadata.google.internal" {
		return nil, invalid("The media host is not importable")
	}
	if address, err := netip.ParseAddr(host); err == nil && !publicAddress(address) {
		return nil, invalid("The media host is not importable")
	}
	u.Fragment = ""
	return u, nil
}

var blockedNetworks = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"), netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("192.0.0.0/24"), netip.MustParsePrefix("192.0.2.0/24"), netip.MustParsePrefix("192.88.99.0/24"),
	netip.MustParsePrefix("198.18.0.0/15"), netip.MustParsePrefix("198.51.100.0/24"), netip.MustParsePrefix("203.0.113.0/24"),
	netip.MustParsePrefix("240.0.0.0/4"), netip.MustParsePrefix("2001::/23"), netip.MustParsePrefix("2001:db8::/32"),
	netip.MustParsePrefix("2002::/16"), netip.MustParsePrefix("3fff::/20"),
}
var globalIPv6 = netip.MustParsePrefix("2000::/3")

func publicAddress(address netip.Addr) bool {
	address = address.Unmap()
	if !address.IsValid() || address.Zone() != "" || !address.IsGlobalUnicast() || address.IsPrivate() || address.IsLoopback() || address.IsLinkLocalUnicast() {
		return false
	}
	// Reject mapped transition/synthesis ranges, including NAT64, instead of
	// letting a globally-looking IPv6 destination tunnel to a private IPv4.
	if address.Is6() && !globalIPv6.Contains(address) {
		return false
	}
	for _, network := range blockedNetworks {
		if network.Contains(address) {
			return false
		}
	}
	return true
}

func newFetchClient(localOrigin string) *http.Client {
	transport := &http.Transport{
		Proxy: nil, DisableCompression: true, DisableKeepAlives: true,
		TLSHandshakeTimeout: 5 * time.Second, ResponseHeaderTimeout: 5 * time.Second,
		MaxResponseHeaderBytes: 32 * 1024, ForceAttemptHTTP2: false,
	}
	transport.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		return dialRemote(ctx, network, address, localOrigin, net.DefaultResolver.LookupNetIP)
	}
	return &http.Client{Transport: transport, CheckRedirect: func(request *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return invalid("The media URL redirects too many times")
		}
		if _, err := validateRemoteURL(request.URL.String(), localOrigin); err != nil {
			return err
		}
		if len(via) > 0 && via[len(via)-1].URL.Scheme == "https" && request.URL.Scheme != "https" {
			return invalid("The media URL redirects to an insecure connection")
		}
		// Go normally copies headers across redirects. Start again instead of
		// forwarding cookies, credentials, or a sensitive Referer to any host.
		request.Header = make(http.Header)
		setFetchHeaders(request)
		if len(via) > 0 && via[0].Header.Get("Range") != "" {
			request.Header.Set("Range", via[0].Header.Get("Range"))
		}
		return nil
	}}
}
func setFetchHeaders(request *http.Request) {
	request.Header.Set("Accept", strings.Join(contract.AllowedMIMETypes, ","))
	request.Header.Set("Accept-Encoding", "identity")
	request.Header.Set("User-Agent", "Sploot-Media-Import/1")
}

type lookupAddresses func(context.Context, string, string) ([]netip.Addr, error)

func dialRemote(ctx context.Context, network, address, localOrigin string, lookup lookupAddresses) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, err
	}
	var addresses []netip.Addr
	if literal, err := netip.ParseAddr(host); err == nil {
		addresses = []netip.Addr{literal}
	} else {
		addresses, err = lookup(ctx, "ip", host)
		if err != nil {
			return nil, err
		}
	}
	allowLoopback := false
	if localOrigin != "" {
		origin, _ := url.Parse(localOrigin)
		allowLoopback = origin.Host == net.JoinHostPort(host, port)
	}
	if len(addresses) == 0 {
		return nil, invalid("The media host has no public address")
	}
	// Inspect every answer before attempting any connection. A mixed public /
	// private DNS response is rejected, not merely filtered for the first dial.
	for _, candidate := range addresses {
		if !publicAddress(candidate) && !(allowLoopback && candidate.Unmap().IsLoopback()) {
			return nil, invalid("The media host resolves to a nonpublic address")
		}
	}
	var lastError error
	for _, candidate := range addresses {
		dialer := net.Dialer{Timeout: 5 * time.Second}
		connection, err := dialer.DialContext(ctx, network, net.JoinHostPort(candidate.String(), port))
		if err != nil {
			lastError = err
			continue
		}
		remote, ok := connection.RemoteAddr().(*net.TCPAddr)
		if !ok || remote.AddrPort().Addr().Unmap() != candidate.Unmap() || (!publicAddress(remote.AddrPort().Addr()) && !(allowLoopback && remote.IP.IsLoopback())) {
			_ = connection.Close()
			return nil, invalid("The actual media connection address is not importable")
		}
		return connection, nil
	}
	return nil, lastError
}

type boundedBody struct {
	body      io.ReadCloser
	cancel    context.CancelFunc
	remaining int64
	once      sync.Once
}

func (b *boundedBody) Read(buffer []byte) (int, error) {
	if len(buffer) == 0 {
		return 0, nil
	}
	if b.remaining == 0 {
		var extra [1]byte
		n, err := b.body.Read(extra[:])
		if n > 0 {
			_ = b.Close()
			return 0, tooLarge()
		}
		return 0, err
	}
	if int64(len(buffer)) > b.remaining {
		buffer = buffer[:b.remaining]
	}
	n, err := b.body.Read(buffer)
	b.remaining -= int64(n)
	return n, err
}
func (b *boundedBody) Close() error {
	var err error
	b.once.Do(func() { b.cancel(); err = b.body.Close() })
	return err
}
