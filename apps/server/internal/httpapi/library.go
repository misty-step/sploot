package httpapi

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/misty-step/sploot/apps/server/internal/library"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

func (s *Server) listAssets(w http.ResponseWriter, r *http.Request, p model.Principal) {
	options, err := listOptions(r.URL.Query())
	if err != nil {
		s.failure(w, r, err)
		return
	}
	page, err := s.library.List(r.Context(), p.UserID, options)
	if err != nil {
		s.failure(w, r, err)
		return
	}
	s.json(w, 200, page)
}

func (s *Server) getAsset(w http.ResponseWriter, r *http.Request, p model.Principal) {
	asset, err := s.library.Get(r.Context(), p.UserID, r.PathValue("id"))
	if err != nil {
		s.failure(w, r, err)
		return
	}
	s.json(w, 200, map[string]any{"asset": asset})
}

func (s *Server) updateAsset(w http.ResponseWriter, r *http.Request, p model.Principal) {
	var request library.AssetUpdate
	if err := decodeJSON(w, r, &request); err != nil {
		s.failure(w, r, err)
		return
	}
	asset, err := s.library.Update(r.Context(), p.UserID, r.PathValue("id"), request)
	if err != nil {
		s.failure(w, r, err)
		return
	}
	s.json(w, 200, map[string]any{"asset": asset})
}

func (s *Server) deleteAsset(w http.ResponseWriter, r *http.Request, p model.Principal) {
	if err := s.library.Delete(r.Context(), p.UserID, r.PathValue("id")); err != nil {
		s.failure(w, r, err)
		return
	}
	s.json(w, 200, map[string]bool{"success": true})
}

func (s *Server) purgeAsset(w http.ResponseWriter, r *http.Request, p model.Principal) {
	if err := s.ingest.Purge(r.Context(), p.UserID, r.PathValue("id")); err != nil {
		s.failure(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) restoreAsset(w http.ResponseWriter, r *http.Request, p model.Principal) {
	asset, err := s.library.Restore(r.Context(), p.UserID, r.PathValue("id"))
	if err != nil {
		s.failure(w, r, err)
		return
	}
	s.json(w, 200, map[string]any{"asset": asset})
}

func (s *Server) createShare(w http.ResponseWriter, r *http.Request, p model.Principal) {
	slug, err := s.library.Share(r.Context(), p.UserID, r.PathValue("id"))
	if err != nil {
		s.failure(w, r, err)
		return
	}
	s.json(w, 200, map[string]string{"shareSlug": slug, "shareUrl": s.config.BaseURL + "/s/" + slug})
}

func (s *Server) revokeShare(w http.ResponseWriter, r *http.Request, p model.Principal) {
	if err := s.library.RevokeShare(r.Context(), p.UserID, r.PathValue("id")); err != nil {
		s.failure(w, r, err)
		return
	}
	s.json(w, 200, map[string]bool{"success": true})
}

func (s *Server) retryEmbedding(w http.ResponseWriter, r *http.Request, p model.Principal) {
	if err := s.embedding.Retry(r.Context(), p.UserID, r.PathValue("id")); err != nil {
		s.failure(w, r, err)
		return
	}
	s.json(w, http.StatusAccepted, map[string]string{"status": "pending"})
}

func (s *Server) embeddingStatus(w http.ResponseWriter, r *http.Request, p model.Principal) {
	status, err := s.embedding.Status(r.Context(), p.UserID, r.PathValue("id"))
	if err != nil {
		s.failure(w, r, err)
		return
	}
	s.json(w, 200, status)
}

func (s *Server) listTokens(w http.ResponseWriter, r *http.Request, p model.Principal) {
	tokens, err := s.library.Tokens(r.Context(), p.UserID)
	if err != nil {
		s.failure(w, r, err)
		return
	}
	s.json(w, 200, map[string]any{"tokens": tokens})
}

func (s *Server) createToken(w http.ResponseWriter, r *http.Request, p model.Principal) {
	var request struct {
		Name string `json:"name"`
	}
	if err := decodeJSON(w, r, &request); err != nil {
		s.failure(w, r, err)
		return
	}
	token, err := s.library.MintToken(r.Context(), p, request.Name)
	if err != nil {
		s.failure(w, r, err)
		return
	}
	s.json(w, http.StatusCreated, token)
}

func (s *Server) revokeToken(w http.ResponseWriter, r *http.Request, p model.Principal) {
	if err := s.library.RevokeToken(r.Context(), p.UserID, r.PathValue("id")); err != nil {
		s.failure(w, r, err)
		return
	}
	s.json(w, 200, map[string]bool{"success": true})
}

func (s *Server) listTags(w http.ResponseWriter, r *http.Request, p model.Principal) {
	tags, err := s.library.TagDetails(r.Context(), p.UserID)
	if err != nil {
		s.failure(w, r, err)
		return
	}
	s.json(w, 200, map[string]any{"success": true, "tags": tags})
}

func (s *Server) stats(w http.ResponseWriter, r *http.Request, p model.Principal) {
	stats, err := s.library.Stats(r.Context(), p.UserID)
	if err != nil {
		s.failure(w, r, err)
		return
	}
	s.json(w, 200, stats)
}

func (s *Server) checkUpload(w http.ResponseWriter, r *http.Request, p model.Principal) {
	var request struct {
		Checksum       string `json:"checksum"`
		ChecksumSHA256 string `json:"checksumSha256"`
	}
	if err := decodeJSON(w, r, &request); err != nil {
		s.failure(w, r, err)
		return
	}
	checksum := request.Checksum
	if checksum == "" {
		checksum = request.ChecksumSHA256
	}
	if len(checksum) != 64 {
		s.failure(w, r, &model.APIError{Status: 400, Message: "A SHA-256 checksum is required"})
		return
	}
	var id string
	err := s.db.QueryRowContext(r.Context(), `SELECT id FROM assets WHERE owner_user_id=? AND checksum_sha256=? AND deleted_at IS NULL ORDER BY created_at,id LIMIT 1`, p.UserID, checksum).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		s.json(w, 200, map[string]bool{"exists": false, "isDuplicate": false})
		return
	}
	if err != nil {
		s.failure(w, r, err)
		return
	}
	asset, err := s.library.Get(r.Context(), p.UserID, id)
	if err != nil {
		s.failure(w, r, err)
		return
	}
	s.json(w, 200, map[string]any{"exists": true, "isDuplicate": true, "asset": asset})
}
