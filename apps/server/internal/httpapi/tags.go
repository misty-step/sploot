package httpapi

import (
	"net/http"

	"github.com/misty-step/sploot/apps/server/internal/library"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

func (s *Server) createTag(w http.ResponseWriter, r *http.Request, p model.Principal) {
	var input struct {
		Name  string  `json:"name"`
		Color *string `json:"color"`
	}
	if err := decodeJSON(w, r, &input); err != nil {
		s.failure(w, r, err)
		return
	}
	tag, err := s.library.CreateTag(r.Context(), p.UserID, input.Name, input.Color)
	if err != nil {
		s.failure(w, r, err)
		return
	}
	s.json(w, http.StatusCreated, map[string]any{"success": true, "tag": tag})
}
func (s *Server) updateTag(w http.ResponseWriter, r *http.Request, p model.Principal) {
	var input library.TagUpdate
	if err := decodeJSON(w, r, &input); err != nil {
		s.failure(w, r, err)
		return
	}
	tag, err := s.library.UpdateTag(r.Context(), p.UserID, r.PathValue("id"), input)
	if err != nil {
		s.failure(w, r, err)
		return
	}
	s.json(w, 200, map[string]any{"success": true, "tag": tag})
}
func (s *Server) deleteTag(w http.ResponseWriter, r *http.Request, p model.Principal) {
	if err := s.library.DeleteTag(r.Context(), p.UserID, r.PathValue("id")); err != nil {
		s.failure(w, r, err)
		return
	}
	s.json(w, 200, map[string]bool{"success": true})
}
func (s *Server) assetTags(w http.ResponseWriter, r *http.Request, p model.Principal) {
	var tags []model.Tag
	var err error
	switch r.Method {
	case http.MethodGet:
		tags, err = s.library.AssetTags(r.Context(), p.UserID, r.PathValue("id"))
	case http.MethodPost:
		var input struct {
			TagIDs   []string `json:"tagIds"`
			TagNames []string `json:"tagNames"`
		}
		if err = decodeJSON(w, r, &input); err == nil {
			tags, err = s.library.AddTags(r.Context(), p.UserID, r.PathValue("id"), input.TagIDs, input.TagNames)
		}
	case http.MethodDelete:
		var input struct {
			TagIDs []string `json:"tagIds"`
		}
		if err = decodeJSON(w, r, &input); err == nil {
			err = s.library.RemoveTags(r.Context(), p.UserID, r.PathValue("id"), input.TagIDs)
		}
		if err == nil {
			s.json(w, 200, map[string]bool{"success": true})
			return
		}
	}
	if err != nil {
		s.failure(w, r, err)
		return
	}
	s.json(w, 200, map[string]any{"success": true, "tags": tags})
}
