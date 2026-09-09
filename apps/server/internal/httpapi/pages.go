package httpapi

import (
	"errors"
	"math/rand/v2"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/misty-step/sploot/apps/server/internal/model"
	"github.com/misty-step/sploot/apps/server/internal/web"
)

func (s *Server) pageData(title string, principal *model.Principal) web.PageData {
	data := web.PageData{Title: title, BaseURL: s.config.BaseURL, RegistrationOpen: s.config.RegistrationOpen, Principal: principal, UploadsEnabled: s.config.UploadsEnabled, StorageLimitBytes: s.config.StorageLimitBytes, ModelStatus: s.embedding.ModelStatus()}
	if principal != nil {
		data.AccountEmail = principal.Email
	}
	return data
}

func (s *Server) render(w http.ResponseWriter, r *http.Request, status int, name string, data web.PageData) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(status)
	if err := s.web.Render(w, name, data); err != nil {
		s.logger.Error("render failed", "operation", name, "error", err)
	}
}

func (s *Server) pagePrincipal(w http.ResponseWriter, r *http.Request) (model.Principal, bool) {
	principal, err := s.auth.Resolve(r, false)
	if err == nil {
		return principal, true
	}
	var denied *model.APIError
	if errors.As(err, &denied) && denied.Status == http.StatusUnauthorized {
		destination := "/sign-in?redirect_url=" + url.QueryEscape(r.URL.RequestURI())
		if r.Header.Get("HX-Request") == "true" {
			w.Header().Set("HX-Redirect", destination)
			w.WriteHeader(401)
		} else {
			http.Redirect(w, r, destination, http.StatusSeeOther)
		}
		return principal, false
	}
	if errors.As(err, &denied) && denied.Code == "ACCOUNT_CHANGED" {
		s.failure(w, r, err)
		return principal, false
	}
	data := s.pageData("Library unavailable", nil)
	data.Error = "Your library could not be opened. Try again shortly."
	status := 503
	if errors.As(err, &denied) {
		status = denied.Status
		data.Error = denied.Message
	}
	s.render(w, r, status, "sign-in", data)
	return principal, false
}

func (s *Server) home(w http.ResponseWriter, r *http.Request) {
	if _, err := s.auth.Resolve(r, false); err == nil {
		http.Redirect(w, r, "/app", http.StatusSeeOther)
		return
	}
	http.Redirect(w, r, "/sign-in", http.StatusSeeOther)
}

func pageReturnURL(r *http.Request) string {
	target, err := url.Parse(r.URL.Query().Get("redirect_url"))
	if err == nil && !target.IsAbs() && target.Host == "" && (target.Path == "/app" || strings.HasPrefix(target.Path, "/app/")) {
		return target.RequestURI()
	}
	return "/app"
}

func (s *Server) signIn(w http.ResponseWriter, r *http.Request) {
	target := pageReturnURL(r)
	if _, err := s.auth.Resolve(r, false); err == nil {
		http.Redirect(w, r, target, http.StatusSeeOther)
		return
	}
	data := s.pageData("Sign in · Sploot", nil)
	data.ReturnURL = target
	s.render(w, r, http.StatusOK, "sign-in", data)
}

func (s *Server) signUp(w http.ResponseWriter, r *http.Request) {
	target := pageReturnURL(r)
	if _, err := s.auth.Resolve(r, false); err == nil {
		http.Redirect(w, r, target, http.StatusSeeOther)
		return
	}
	data := s.pageData("Create your account · Sploot", nil)
	data.ReturnURL = target
	s.render(w, r, http.StatusOK, "sign-up", data)
}

func (s *Server) connectPage(w http.ResponseWriter, r *http.Request) {
	principal, ok := s.pagePrincipal(w, r)
	if !ok {
		return
	}
	data := s.pageData("Connect a device · Sploot", &principal)
	data.DeviceCode = strings.TrimSpace(r.URL.Query().Get("code"))
	s.render(w, r, http.StatusOK, "connect", data)
}

func (s *Server) appPage(w http.ResponseWriter, r *http.Request)  { s.libraryPage(w, r, "app") }
func (s *Server) feedPage(w http.ResponseWriter, r *http.Request) { s.libraryPage(w, r, "feed") }

func (s *Server) libraryPage(w http.ResponseWriter, r *http.Request, template string) {
	principal, ok := s.pagePrincipal(w, r)
	if !ok {
		return
	}
	options, err := listOptions(r.URL.Query())
	if err != nil {
		s.failure(w, r, err)
		return
	}
	options.Sort = "shuffle"
	options.Seed = r.URL.Query().Get("seed")
	if options.Seed == "" {
		options.Seed = strconv.Itoa(rand.IntN(1_000_001))
	}
	page, err := s.library.List(r.Context(), principal.UserID, options)
	data := s.pageData("Your library", &principal)
	data.Seed = options.Seed
	data.FavoriteOnly = options.FavoriteOnly
	if err != nil {
		data.Error = "Your library could not be loaded. Try again shortly."
		s.logger.Error("library page failed", "operation", "list_library", "error", err)
		s.render(w, r, 503, template, data)
		return
	}
	data.Assets = page.Assets
	data.Total = page.Total
	data.HasMore = page.HasMore
	data.NextCursor = page.NextCursor
	s.render(w, r, 200, template, data)
}

func (s *Server) searchPage(w http.ResponseWriter, r *http.Request) {
	principal, ok := s.pagePrincipal(w, r)
	if !ok {
		return
	}
	values := r.URL.Query()
	data := s.pageData("Find a meme", &principal)
	data.Query = strings.TrimSpace(values.Get("q"))
	data.FavoriteOnly = values.Get("favorite") == "true"
	data.Seed = values.Get("seed")
	template := "search"
	if values.Get("fragment") == "1" {
		template = "results"
	}
	if data.Query == "" {
		s.render(w, r, 200, template, data)
		return
	}
	result, err := s.embedding.Search(r.Context(), principal.UserID, model.SearchRequest{Query: data.Query, Limit: 30, FavoriteOnly: data.FavoriteOnly, Cursor: values.Get("cursor")})
	status := 200
	if err != nil {
		data.Error = "Search is temporarily unavailable. Your saved media is still in your library."
		status = 503
		var known *model.APIError
		if errors.As(err, &known) {
			data.Error = known.Message
			status = known.Status
		} else {
			s.logger.Error("search page failed", "operation", "semantic_search", "error", err)
		}
	} else {
		data.Assets = result.Results
		data.Total = result.Total
		data.HasMore = result.HasMore
		data.NextCursor = result.NextCursor
	}
	s.render(w, r, status, template, data)
}

func (s *Server) settingsPage(w http.ResponseWriter, r *http.Request) {
	principal, ok := s.pagePrincipal(w, r)
	if !ok {
		return
	}
	s.render(w, r, 200, "settings", s.pageData("Settings", &principal))
}

func (s *Server) shortcutSource(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.pagePrincipal(w, r); !ok {
		return
	}
	w.Header().Set("Content-Type", "application/x-apple-shortcut")
	w.Header().Set("Content-Disposition", `attachment; filename="save-to-sploot.unsigned.shortcut"`)
	w.Header().Set("Cache-Control", "private, no-store")
	if err := s.web.RenderShortcut(w, s.config.BaseURL); err != nil {
		s.logger.Error("Shortcut source failed", "error", err)
	}
}

func (s *Server) publicShareByID(w http.ResponseWriter, r *http.Request) {
	slug, err := s.library.SharedSlugByID(r.Context(), r.PathValue("id"))
	if err != nil {
		s.notFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	http.Redirect(w, r, "/s/"+slug, http.StatusFound)
}

func (s *Server) publicShare(w http.ResponseWriter, r *http.Request) {
	asset, err := s.library.Shared(r.Context(), r.PathValue("slug"))
	if err != nil {
		s.notFound(w, r)
		return
	}
	if r.URL.Query().Get("media") == "1" {
		s.serveMedia(w, r, asset)
		return
	}
	data := s.pageData("Shared meme", nil)
	data.Asset = &asset
	data.ShareSlug = r.PathValue("slug")
	s.render(w, r, 200, "share", data)
}

func (s *Server) notFound(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") {
		s.json(w, 404, map[string]string{"error": "Not found"})
		return
	}
	s.render(w, r, 404, "not-found", s.pageData("Not found", nil))
}
