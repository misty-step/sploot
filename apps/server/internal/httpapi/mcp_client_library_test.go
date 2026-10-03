package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"image"
	"image/color"
	"image/png"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	_ "image/jpeg"

	"github.com/misty-step/sploot/apps/server/internal/auth"
	"github.com/misty-step/sploot/apps/server/internal/config"
	"github.com/misty-step/sploot/apps/server/internal/contract"
	"github.com/misty-step/sploot/apps/server/internal/database"
	"github.com/misty-step/sploot/apps/server/internal/inference"
)

// contractEngine is a deterministic projection for this contract test. It still
// opens the real private poster, and production never installs it.
type contractEngine struct{}

func (contractEngine) Text(context.Context, string) ([]float32, error) { return contractVector(), nil }

func (contractEngine) Image(_ context.Context, path string) ([]float32, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	if _, _, err := image.Decode(file); err != nil {
		return nil, err
	}
	return contractVector(), nil
}

func contractVector() []float32 {
	vector := make([]float32, inference.Dimension)
	vector[0] = 1
	return vector
}

type mcpFixture struct {
	SearchDefaults struct {
		Threshold float64 `json:"threshold"`
		Limit     int     `json:"limit"`
	} `json:"searchDefaults"`
	Identifiers struct {
		TagIDMaxLength int `json:"tagIdMaxLength"`
	} `json:"identifiers"`
	URLSave struct {
		Tags []string `json:"tags"`
	} `json:"urlSave"`
	SearchPage struct {
		Query        string  `json:"query"`
		Limit        int     `json:"limit"`
		Threshold    float64 `json:"threshold"`
		FavoriteOnly bool    `json:"favoriteOnly"`
		TagName      string  `json:"tagName"`
	} `json:"searchPage"`
	Receipts []struct {
		Name   string `json:"name"`
		Status int    `json:"status"`
		Body   struct {
			Success     bool   `json:"success"`
			IsDuplicate bool   `json:"isDuplicate"`
			Message     string `json:"message"`
		} `json:"body"`
	} `json:"receipts"`
}

func loadMCPFixture(t *testing.T) mcpFixture {
	t.Helper()
	var fixture mcpFixture
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "packages", "common", "fixtures", "mcp-client.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	return fixture
}

func (f mcpFixture) receipt(t *testing.T, name string) struct {
	Success     bool
	IsDuplicate bool
	Message     string
	Status      int
} {
	t.Helper()
	for _, entry := range f.Receipts {
		if entry.Name == name {
			return struct {
				Success     bool
				IsDuplicate bool
				Message     string
				Status      int
			}{entry.Body.Success, entry.Body.IsDuplicate, entry.Body.Message, entry.Status}
		}
	}
	t.Fatalf("fixture receipt %s is missing", name)
	return struct {
		Success     bool
		IsDuplicate bool
		Message     string
		Status      int
	}{}
}

type mcpLibrary struct {
	origin string
	images []string
	app    *Server
	server *http.Server
	media  *httptest.Server
	db     interface{ Close() error }
	client *http.Client
	cancel context.CancelFunc
	done   chan struct{}
}

func startMCPLibrary(t *testing.T) *mcpLibrary {
	t.Helper()
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Fatal("ffmpeg is required to exercise URL saves")
	}
	directory := filepath.Join(t.TempDir(), "library")
	if strings.Contains(directory, ".sploot-local") {
		t.Fatal("refusing to use the operator library")
	}
	if err := os.Mkdir(directory, 0700); err != nil {
		t.Fatal(err)
	}
	mediaDir := t.TempDir()
	for _, image := range []struct {
		name  string
		color color.RGBA
	}{
		{"a.png", color.RGBA{R: 220, A: 255}},
		{"b.png", color.RGBA{B: 220, A: 255}},
		{"c.png", color.RGBA{G: 180, A: 255}},
	} {
		writeContractPNG(t, filepath.Join(mediaDir, image.name), image.color)
	}
	media := httptest.NewServer(http.FileServer(http.Dir(mediaDir)))
	if !strings.HasPrefix(media.URL, "http://127.0.0.1:") {
		t.Fatalf("fixture media origin is not an isolated loopback: %s", media.URL)
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	origin := "http://" + listener.Addr().String()
	if strings.Contains(origin, "mistystep.io") {
		t.Fatal("refusing to bind a production host")
	}
	db, err := database.Open(context.Background(), directory)
	if err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{
		Address: listener.Addr().String(), BaseURL: origin, Environment: "test", Revision: "mcp-contract",
		DataDirectory: directory, MediaDirectory: filepath.Join(directory, "media"),
		ModelDirectory: filepath.Join(directory, "models"), CursorSecret: []byte(strings.Repeat("s", 32)),
		UploadsEnabled: true, EmbeddingsEnabled: true, RegistrationOpen: true,
		LocalImportOrigin: media.URL,
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	app, err := New(cfg, db, logger, contractEngine{})
	if err != nil {
		media.Close()
		_ = db.Close()
		_ = listener.Close()
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	library := &mcpLibrary{
		origin: origin,
		images: []string{media.URL + "/a.png", media.URL + "/b.png", media.URL + "/c.png"},
		app:    app, media: media, db: db, cancel: cancel, done: make(chan struct{}),
		client: &http.Client{Timeout: 20 * time.Second},
		server: &http.Server{Handler: app, ReadHeaderTimeout: 5 * time.Second},
	}
	go func() {
		defer close(library.done)
		_ = app.RunIndexing(ctx)
	}()
	go func() { _ = library.server.Serve(listener) }()
	t.Cleanup(library.close)
	return library
}

func (l *mcpLibrary) close() {
	l.cancel()
	select {
	case <-l.done:
	case <-time.After(5 * time.Second):
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = l.server.Shutdown(ctx)
	_ = l.app.Close()
	_ = l.db.Close()
	l.media.Close()
}

func writeContractPNG(t *testing.T, path string, fill color.RGBA) {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 16, 16))
	for y := 0; y < 16; y++ {
		for x := 0; x < 16; x++ {
			img.SetRGBA(x, y, fill)
		}
	}
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, img); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, buffer.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
}

func (l *mcpLibrary) do(t *testing.T, method, path string, body []byte, cookie, token string) (int, []byte, string) {
	t.Helper()
	request, err := http.NewRequest(method, l.origin+path, bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Origin", l.origin)
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if cookie != "" {
		request.Header.Set("Cookie", cookie)
	}
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	response, err := l.client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	data, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	next := cookie
	for _, item := range response.Cookies() {
		if item.Name == auth.SessionCookie && item.Value != "" {
			next = auth.SessionCookie + "=" + item.Value
		}
	}
	return response.StatusCode, data, next
}

type savedAsset struct {
	Success     bool   `json:"success"`
	IsDuplicate bool   `json:"isDuplicate"`
	Message     string `json:"message"`
	Asset       struct {
		ID             string `json:"id"`
		BlobURL        string `json:"blobUrl"`
		Filename       string `json:"filename"`
		MIMEType       string `json:"mimeType"`
		Size           int64  `json:"size"`
		Checksum       string `json:"checksum"`
		CreatedAt      string `json:"createdAt"`
		NeedsEmbedding bool   `json:"needsEmbedding"`
	} `json:"asset"`
}

func TestMCPClientFixturesMatchLiveReceipts(t *testing.T) {
	fixture := loadMCPFixture(t)
	if fixture.SearchDefaults.Threshold != 0.12 || fixture.SearchDefaults.Limit != 30 || fixture.Identifiers.TagIDMaxLength != contract.AssetIDMaxLength {
		t.Fatalf("shared search defaults drifted: %+v tag max %d", fixture.SearchDefaults, fixture.Identifiers.TagIDMaxLength)
	}
	library := startMCPLibrary(t)
	status, body, cookie := library.do(t, http.MethodPost, "/api/auth/register", []byte(`{"email":"mcp-contract@example.invalid","password":"mcp-contract-password"}`), "", "")
	if status != http.StatusCreated || !strings.HasPrefix(cookie, auth.SessionCookie+"=") {
		t.Fatalf("register status=%d body=%s", status, body)
	}
	status, body, _ = library.do(t, http.MethodPost, "/api/upload-tokens", []byte(`{"name":"mcp-contract"}`), cookie, "")
	if status != http.StatusCreated {
		t.Fatalf("mint status=%d body=%s", status, body)
	}
	var minted struct {
		ID    string `json:"id"`
		Token string `json:"token"`
	}
	if err := json.Unmarshal(body, &minted); err != nil || !strings.HasPrefix(minted.Token, "splt_") {
		t.Fatalf("minted token: %s %v", body, err)
	}

	status, body, _ = library.do(t, http.MethodPost, "/api/search", []byte(`{"query":"default floor"}`), "", minted.Token)
	if status != http.StatusOK {
		t.Fatalf("default search status=%d body=%s", status, body)
	}
	var defaults struct {
		Limit     int     `json:"limit"`
		Threshold float64 `json:"threshold"`
		Results   []any   `json:"results"`
	}
	if err := json.Unmarshal(body, &defaults); err != nil {
		t.Fatal(err)
	}
	if defaults.Limit != fixture.SearchDefaults.Limit || defaults.Threshold != fixture.SearchDefaults.Threshold || defaults.Results == nil {
		t.Fatalf("live search defaults = %+v, fixture %+v", defaults, fixture.SearchDefaults)
	}

	save := func(image string, tags []string) (int, savedAsset) {
		t.Helper()
		payload, err := json.Marshal(map[string]any{"url": image, "tags": tags})
		if err != nil {
			t.Fatal(err)
		}
		code, data, _ := library.do(t, http.MethodPost, "/api/upload/url", payload, "", minted.Token)
		var saved savedAsset
		if err := json.Unmarshal(data, &saved); err != nil {
			t.Fatalf("save status=%d body=%s", code, data)
		}
		return code, saved
	}
	createdCase := fixture.receipt(t, "created")
	code, created := save(library.images[0], fixture.URLSave.Tags)
	if code != createdCase.Status || created.Success != createdCase.Success || created.IsDuplicate != createdCase.IsDuplicate || created.Message != createdCase.Message {
		t.Fatalf("created receipt = %d %+v, fixture %+v", code, created, createdCase)
	}
	if !created.Asset.NeedsEmbedding || !strings.HasPrefix(created.Asset.BlobURL, "/media/") || !contract.ValidSHA256Hex(created.Asset.Checksum) || created.Asset.MIMEType != "image/png" || created.Asset.Size <= 0 || created.Asset.Filename == "" || created.Asset.CreatedAt == "" {
		t.Fatalf("created asset is not a private-media receipt: %+v", created.Asset)
	}
	assetStatus, assetBody, _ := library.do(t, http.MethodGet, "/api/assets/"+created.Asset.ID, nil, cookie, "")
	if assetStatus != http.StatusOK {
		t.Fatalf("asset status=%d body=%s", assetStatus, assetBody)
	}
	var fetched struct {
		Asset struct {
			Tags []struct {
				Name string `json:"name"`
			} `json:"tags"`
		} `json:"asset"`
	}
	if err := json.Unmarshal(assetBody, &fetched); err != nil {
		t.Fatal(err)
	}
	names := map[string]bool{}
	for _, tag := range fetched.Asset.Tags {
		names[tag.Name] = true
	}
	for _, tag := range fixture.URLSave.Tags {
		if !names[tag] {
			t.Fatalf("URL tags did not persist: have %v want %v", fetched.Asset.Tags, fixture.URLSave.Tags)
		}
	}

	duplicateCase := fixture.receipt(t, "duplicate")
	code, duplicate := save(library.images[0], fixture.URLSave.Tags)
	if code != duplicateCase.Status || duplicate.Success != duplicateCase.Success || duplicate.IsDuplicate != duplicateCase.IsDuplicate || duplicate.Message != duplicateCase.Message || duplicate.Asset.ID != created.Asset.ID {
		t.Fatalf("duplicate receipt = %d %+v, fixture %+v", code, duplicate, duplicateCase)
	}
	if !contract.ValidSHA256Hex(duplicate.Asset.Checksum) || !strings.HasPrefix(duplicate.Asset.BlobURL, "/media/") {
		t.Fatalf("duplicate asset is not a receipt: %+v", duplicate.Asset)
	}

	_, second := save(library.images[1], fixture.URLSave.Tags)
	_, distractor := save(library.images[2], nil)
	if second.IsDuplicate || distractor.IsDuplicate || second.Asset.ID == "" || distractor.Asset.ID == "" {
		t.Fatalf("page fixtures did not save: %+v %+v", second, distractor)
	}
	for _, id := range []string{created.Asset.ID, second.Asset.ID} {
		favorite, err := json.Marshal(map[string]bool{"favorite": true})
		if err != nil {
			t.Fatal(err)
		}
		favStatus, favBody, _ := library.do(t, http.MethodPatch, "/api/assets/"+id, favorite, cookie, "")
		if favStatus != http.StatusOK {
			t.Fatalf("favorite %s status=%d body=%s", id, favStatus, favBody)
		}
	}
	for _, id := range []string{created.Asset.ID, second.Asset.ID, distractor.Asset.ID} {
		waitReady(t, library, cookie, id)
	}
	tagStatus, tagBody, _ := library.do(t, http.MethodGet, "/api/tags", nil, cookie, "")
	if tagStatus != http.StatusOK {
		t.Fatalf("tags status=%d body=%s", tagStatus, tagBody)
	}
	var listed struct {
		Tags []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"tags"`
	}
	if err := json.Unmarshal(tagBody, &listed); err != nil {
		t.Fatal(err)
	}
	var tagID string
	for _, tag := range listed.Tags {
		if tag.Name == fixture.SearchPage.TagName {
			tagID = tag.ID
		}
	}
	if tagID == "" {
		t.Fatalf("tag %s missing from %s", fixture.SearchPage.TagName, tagBody)
	}
	page := func(cursor string) struct {
		Results []struct {
			ID string `json:"id"`
		} `json:"results"`
		Total      int     `json:"total"`
		HasMore    bool    `json:"hasMore"`
		NextCursor string  `json:"nextCursor"`
		Threshold  float64 `json:"threshold"`
	} {
		t.Helper()
		payload, err := json.Marshal(map[string]any{
			"query": fixture.SearchPage.Query, "limit": fixture.SearchPage.Limit, "threshold": fixture.SearchPage.Threshold,
			"favoriteOnly": fixture.SearchPage.FavoriteOnly, "tagId": tagID, "cursor": cursor,
		})
		if err != nil {
			t.Fatal(err)
		}
		searchStatus, searchBody, _ := library.do(t, http.MethodPost, "/api/search", payload, "", minted.Token)
		if searchStatus != http.StatusOK {
			t.Fatalf("search status=%d body=%s", searchStatus, searchBody)
		}
		var parsed struct {
			Results []struct {
				ID string `json:"id"`
			} `json:"results"`
			Total      int     `json:"total"`
			HasMore    bool    `json:"hasMore"`
			NextCursor string  `json:"nextCursor"`
			Threshold  float64 `json:"threshold"`
		}
		if err := json.Unmarshal(searchBody, &parsed); err != nil {
			t.Fatal(err)
		}
		return parsed
	}
	first := page("")
	if first.Total != 2 || !first.HasMore || len(first.Results) != 1 || first.NextCursor == "" || first.Threshold != fixture.SearchPage.Threshold {
		t.Fatalf("first page = %+v", first)
	}
	secondPage := page(first.NextCursor)
	if secondPage.Total != 2 || secondPage.HasMore || len(secondPage.Results) != 1 || secondPage.Results[0].ID == first.Results[0].ID {
		t.Fatalf("second page repeated or dropped a result: %+v %+v", first, secondPage)
	}
	seen := map[string]bool{first.Results[0].ID: true, secondPage.Results[0].ID: true}
	if seen[distractor.Asset.ID] || !seen[created.Asset.ID] || !seen[second.Asset.ID] {
		t.Fatalf("filtered pages = %v, created %s second %s distractor %s", seen, created.Asset.ID, second.Asset.ID, distractor.Asset.ID)
	}

	mediaStatus, mediaBody, _ := library.do(t, http.MethodGet, created.Asset.BlobURL, nil, "", minted.Token)
	if mediaStatus != http.StatusUnauthorized || bytes.Contains(mediaBody, []byte{0x89, 'P', 'N', 'G'}) {
		t.Fatalf("personal token downloaded private media: status=%d", mediaStatus)
	}
	ownedStatus, ownedBody, _ := library.do(t, http.MethodGet, created.Asset.BlobURL, nil, cookie, "")
	if ownedStatus != http.StatusOK || len(ownedBody) == 0 {
		t.Fatalf("owner media status=%d bytes=%d", ownedStatus, len(ownedBody))
	}
	revokeStatus, revokeBody, _ := library.do(t, http.MethodDelete, "/api/upload-tokens/"+minted.ID, nil, cookie, "")
	if revokeStatus != http.StatusOK {
		t.Fatalf("revoke status=%d body=%s", revokeStatus, revokeBody)
	}
	revokedStatus, revokedBody, _ := library.do(t, http.MethodPost, "/api/search", []byte(`{"query":"red square"}`), "", minted.Token)
	if revokedStatus != http.StatusUnauthorized {
		t.Fatalf("revoked token status=%d body=%s", revokedStatus, revokedBody)
	}
}

func waitReady(t *testing.T, library *mcpLibrary, cookie, id string) {
	t.Helper()
	deadline := time.Now().Add(30 * time.Second)
	var last []byte
	for time.Now().Before(deadline) {
		status, body, _ := library.do(t, http.MethodGet, "/api/assets/"+id, nil, cookie, "")
		last = body
		if status == http.StatusOK && bytes.Contains(body, []byte(`"embeddingStatus":"ready"`)) {
			return
		}
		if bytes.Contains(body, []byte(`"embeddingStatus":"failed"`)) {
			t.Fatalf("indexing failed for %s: %s", id, body)
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("asset %s was not searchable: %s", id, last)
}

func TestServeMCPClientLibrary(t *testing.T) {
	if os.Getenv("SPLOOT_MCP_E2E") != "1" {
		t.Skip("SPLOOT_MCP_E2E=1 serves an isolated library for the built MCP stdio test")
	}
	readyPath := os.Getenv("SPLOOT_MCP_E2E_READY")
	donePath := os.Getenv("SPLOOT_MCP_E2E_DONE")
	if readyPath == "" || donePath == "" {
		t.Fatal("SPLOOT_MCP_E2E_READY and SPLOOT_MCP_E2E_DONE are required")
	}
	library := startMCPLibrary(t)
	payload, err := json.Marshal(map[string]any{"origin": library.origin, "images": library.images})
	if err != nil {
		t.Fatal(err)
	}
	partial := readyPath + ".partial"
	if err := os.WriteFile(partial, payload, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(partial, readyPath); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(220 * time.Second)
	for time.Now().Before(deadline) {
		if _, err := os.Stat(donePath); err == nil {
			return
		} else if !errors.Is(err, os.ErrNotExist) {
			t.Fatal(err)
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatal("MCP stdio client did not finish")
}
