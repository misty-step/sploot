package recovery

import (
	"bufio"
	"context"
	"errors"
	"io"
	"mime"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"path"
	"regexp"
	"strings"
	"sync"
	"time"
)

var blobHost = regexp.MustCompile(`^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$`)
var mediaHost = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$`)
var blockedNetworks = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"), netip.MustParsePrefix("100.64.0.0/10"), netip.MustParsePrefix("192.0.0.0/24"),
	netip.MustParsePrefix("192.0.2.0/24"), netip.MustParsePrefix("198.18.0.0/15"), netip.MustParsePrefix("198.51.100.0/24"), netip.MustParsePrefix("203.0.113.0/24"), netip.MustParsePrefix("240.0.0.0/4"), netip.MustParsePrefix("2001:db8::/32"),
	netip.MustParsePrefix("64:ff9b::/96"), netip.MustParsePrefix("64:ff9b:1::/48"), netip.MustParsePrefix("2002::/16"), netip.MustParsePrefix("2001::/32"),
}

func publicAddress(ip net.IP) bool {
	address, ok := netip.AddrFromSlice(ip)
	if !ok {
		return false
	}
	address = address.Unmap()
	if !address.IsGlobalUnicast() || address.IsPrivate() || address.IsLoopback() || address.IsLinkLocalUnicast() {
		return false
	}
	for _, prefix := range blockedNetworks {
		if prefix.Contains(address) {
			return false
		}
	}
	return true
}

type objectReader struct {
	client  *http.Client
	fixture *os.Root
	allowed map[string]bool
}

func newObjectReader(options Options) (*objectReader, error) {
	reader := &objectReader{allowed: make(map[string]bool)}
	for _, host := range options.AllowMediaHosts {
		if host != strings.ToLower(host) || !mediaHost.MatchString(host) || strings.Contains(host, "..") || net.ParseIP(host) != nil {
			return nil, failure("media-configuration", "additional media hosts must be exact lowercase DNS hostnames")
		}
		reader.allowed[host] = true
	}
	if options.FixtureDirectory != "" {
		root, err := os.OpenRoot(options.FixtureDirectory)
		if err != nil {
			return nil, failure("media-configuration", "cannot open explicit fixture directory")
		}
		reader.fixture = root
	}
	transport := &http.Transport{Proxy: nil, DisableCompression: true, MaxIdleConns: options.Workers, MaxIdleConnsPerHost: options.Workers, ResponseHeaderTimeout: 60 * time.Second, TLSHandshakeTimeout: 15 * time.Second, IdleConnTimeout: 30 * time.Second, MaxResponseHeaderBytes: 64 << 10}
	transport.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, failure("media-fetch", "invalid destination address")
		}
		addresses, err := net.DefaultResolver.LookupIPAddr(ctx, host)
		if err != nil || len(addresses) == 0 {
			return nil, failure("media-fetch", "media hostname resolution failed")
		}
		for _, resolved := range addresses {
			if !publicAddress(resolved.IP) {
				return nil, failure("media-fetch", "nonpublic media destination rejected")
			}
		}
		dialer := net.Dialer{Timeout: 15 * time.Second, KeepAlive: 30 * time.Second}
		for _, resolved := range addresses {
			conn, err := dialer.DialContext(ctx, network, net.JoinHostPort(resolved.IP.String(), port))
			if err == nil {
				remote, ok := conn.RemoteAddr().(*net.TCPAddr)
				if !ok || !publicAddress(remote.IP) {
					conn.Close()
					return nil, failure("media-fetch", "nonpublic connected address rejected")
				}
				return conn, nil
			}
		}
		return nil, failure("media-fetch", "cannot connect to media provider")
	}
	reader.client = &http.Client{Transport: transport, Timeout: options.ObjectTimeout, CheckRedirect: func(request *http.Request, via []*http.Request) error {
		if len(via) > 3 {
			return failure("media-fetch", "media redirect limit exceeded")
		}
		request.Header.Del("Referer")
		if request.URL.Hostname() == FixtureHost {
			return failure("media-fetch", "remote redirects cannot enter the local fixture authority")
		}
		return reader.validateURL(request.URL)
	}}
	return reader, nil
}

func (r *objectReader) close() {
	r.client.CloseIdleConnections()
	if r.fixture != nil {
		_ = r.fixture.Close()
	}
}

func (r *objectReader) validateURL(uri *url.URL) error {
	if uri.Scheme != "https" || uri.User != nil || uri.Fragment != "" || uri.Host == "" || uri.Port() != "" && uri.Port() != "443" || !(blobHost.MatchString(uri.Hostname()) || r.allowed[uri.Hostname()]) {
		return failure("media-fetch", "media URL is outside approved HTTPS delivery hosts")
	}
	return nil
}

func (r *objectReader) open(ctx context.Context, raw string) (io.ReadCloser, string, error) {
	uri, err := url.Parse(raw)
	if err != nil {
		return nil, "", failure("media-fetch", "invalid media URL")
	}
	if err := r.validateURL(uri); err != nil {
		return nil, "", err
	}
	if uri.Hostname() == FixtureHost {
		if r.fixture == nil {
			return nil, "", failure("media-fetch", "reserved fixture media requires --fixture-directory")
		}
		relative := strings.TrimPrefix(uri.Path, "/")
		if !validRelative(relative) || path.Clean(uri.Path) != "/"+relative || uri.RawQuery != "" {
			return nil, "", failure("media-fetch", "unsafe fixture object path")
		}
		file, err := r.fixture.Open(relative)
		if err != nil {
			return nil, "", failure("media-fetch", "fixture object is missing or escapes its root")
		}
		info, err := file.Stat()
		if err != nil || !info.Mode().IsRegular() {
			file.Close()
			return nil, "", failure("media-fetch", "fixture object is not a regular file")
		}
		return file, "", nil
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, uri.String(), nil)
	if err != nil {
		return nil, "", failure("media-fetch", "cannot construct media request")
	}
	request.Header.Set("Accept-Encoding", "identity")
	response, err := r.client.Do(request)
	if err != nil {
		return nil, "", failure("media-fetch", "media request failed or exceeded its deadline; URL and diagnostics withheld")
	}
	if response.StatusCode != http.StatusOK {
		response.Body.Close()
		if response.StatusCode == http.StatusNotFound || response.StatusCode == http.StatusGone {
			return nil, "", failure("media-fetch", "original or thumbnail is missing from its provider")
		}
		return nil, "", failure("media-fetch", "provider refused media download")
	}
	if encoding := response.Header.Get("Content-Encoding"); encoding != "" && encoding != "identity" {
		response.Body.Close()
		return nil, "", failure("media-fetch", "encoded response would change original bytes")
	}
	contentType, _, _ := mime.ParseMediaType(response.Header.Get("Content-Type"))
	return response.Body, contentType, nil
}

func validateSource(source objectSource) error {
	if source.AssetID == "" || source.OwnerID == "" || source.Rendition != "original" && source.Rendition != "thumbnail" || source.Path != mediaPath(source.AssetID, source.Rendition) || len(source.URLs) == 0 || len(source.URLs) > 1024 {
		return assetFailure("media-manifest", source.AssetID, "invalid object identity, rendition, path, or source list")
	}
	if source.ExpectedBytes != nil && *source.ExpectedBytes < 0 || source.ExpectedSHA256 != "" && !validSHA(source.ExpectedSHA256) || source.Rendition == "original" && (source.ExpectedBytes == nil || source.ExpectedSHA256 == "") {
		return assetFailure("media-manifest", source.AssetID, "invalid expected object checksum")
	}
	return nil
}

func validReceipt(source objectSource, entry MediaEntry) bool {
	return entry.AssetID == source.AssetID && entry.OwnerID == source.OwnerID && entry.Rendition == source.Rendition && entry.Path == source.Path && entry.Bytes >= 0 && validSHA(entry.SHA256) && (source.ExpectedBytes == nil || *source.ExpectedBytes == entry.Bytes) && (source.ExpectedSHA256 == "" || source.ExpectedSHA256 == entry.SHA256)
}

func recoverObject(ctx context.Context, dir *snapshotDirectory, reader *objectReader, options Options, source objectSource) error {
	if err := validateSource(source); err != nil {
		return err
	}
	if source.ExpectedBytes != nil && *source.ExpectedBytes > options.MaxObjectBytes {
		return assetFailure("media-download", source.AssetID, "declared size exceeds --max-object-bytes")
	}
	var receipt MediaEntry
	if err := dir.readJSON(source.Path+".receipt.json", &receipt); err == nil && validReceipt(source, receipt) {
		if err := dir.verifyArtifact(Artifact{Path: receipt.Path, Bytes: receipt.Bytes, SHA256: receipt.SHA256}); err == nil {
			return nil
		}
	}
	if err := dir.mkdir(path.Dir(source.Path)); err != nil {
		return assetFailure("media-download", source.AssetID, "cannot create private object directory")
	}
	var lastError error
	for _, sourceURL := range source.URLs {
		if ctx.Err() != nil {
			return assetFailure("media-download", source.AssetID, "canceled; completed objects can be resumed")
		}
		objectCtx, cancel := context.WithTimeout(ctx, options.ObjectTimeout)
		body, contentType, err := reader.open(objectCtx, sourceURL)
		if err != nil {
			cancel()
			lastError = err
			continue
		}
		buffered := bufio.NewReaderSize(body, 64<<10)
		first, peekErr := buffered.Peek(512)
		if peekErr != nil && !errors.Is(peekErr, io.EOF) {
			body.Close()
			cancel()
			lastError = failure("media-download", "cannot read object header")
			continue
		}
		if sniffed := http.DetectContentType(first); strings.HasPrefix(sniffed, "image/") || strings.HasPrefix(sniffed, "video/") {
			contentType = sniffed
		}
		if contentType == "" {
			contentType = source.MIME
		}
		if contentType == "" {
			contentType = "application/octet-stream"
		}
		limit := options.MaxObjectBytes
		if source.ExpectedBytes != nil && *source.ExpectedBytes < limit {
			limit = *source.ExpectedBytes
		}
		artifact, err := dir.writeFile(source.Path, func(w io.Writer) error {
			n, err := io.Copy(w, io.LimitReader(buffered, limit+1))
			if err != nil {
				return failure("media-download", "media stream failed or timed out")
			}
			if n > limit {
				return failure("media-download", "object exceeds its expected byte bound")
			}
			if source.ExpectedBytes != nil && n != *source.ExpectedBytes {
				return failure("media-download", "object byte count differs from database inventory")
			}
			return nil
		})
		closeErr := body.Close()
		cancel()
		if err != nil {
			lastError = err
			continue
		}
		if closeErr != nil {
			lastError = failure("media-download", "object stream did not close cleanly")
			continue
		}
		if source.ExpectedSHA256 != "" && artifact.SHA256 != source.ExpectedSHA256 {
			lastError = failure("media-download", "object SHA-256 differs from database inventory")
			continue
		}
		receipt = MediaEntry{AssetID: source.AssetID, OwnerID: source.OwnerID, Rendition: source.Rendition, Path: source.Path, Bytes: artifact.Bytes, SHA256: artifact.SHA256, MIME: contentType}
		if _, err := dir.writeJSON(source.Path+".receipt.json", receipt); err != nil {
			return assetFailure("media-download", source.AssetID, "cannot persist verified object receipt")
		}
		return nil
	}
	var phase *PhaseError
	if errors.As(lastError, &phase) {
		return assetFailure("media-download", source.AssetID, phase.Reason+"; resume the same database-ready snapshot after fixing the cause")
	}
	return assetFailure("media-download", source.AssetID, "no matching original bytes could be recovered; resume after repairing the source")
}

func downloadObjects(ctx context.Context, dir *snapshotDirectory, options Options) error {
	reader, err := newObjectReader(options)
	if err != nil {
		return err
	}
	defer reader.close()
	if err := dir.mkdir("media"); err != nil {
		return err
	}
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	jobs := make(chan objectSource, options.Workers)
	var workers sync.WaitGroup
	var once sync.Once
	var firstError error
	fail := func(err error) { once.Do(func() { firstError = err; cancel() }) }
	for range options.Workers {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for source := range jobs {
				if ctx.Err() != nil {
					return
				}
				if err := recoverObject(ctx, dir, reader, options, source); err != nil {
					fail(err)
					return
				}
			}
		}()
	}
	err = scanRecords[objectSource](dir, "sources.ndjson", func(source objectSource) error {
		select {
		case jobs <- source:
			return nil
		case <-ctx.Done():
			return contextFailure(ctx, "media-download")
		}
	})
	if err != nil {
		fail(err)
	}
	close(jobs)
	workers.Wait()
	return firstError
}
