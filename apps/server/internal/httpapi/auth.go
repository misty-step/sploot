package httpapi

import (
	"mime"
	"net/http"

	"github.com/misty-step/sploot/apps/server/internal/auth"
	"github.com/misty-step/sploot/apps/server/internal/model"
)

func (s *Server) registerAuthRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/auth/register", s.authRegister)
	mux.HandleFunc("POST /api/auth/login", s.authLogin)
	mux.HandleFunc("POST /api/auth/logout", s.securedBrowser(s.authLogout))
	mux.HandleFunc("GET /api/auth/session", s.secured(false, s.authSession))
	mux.HandleFunc("POST /api/auth/password", s.securedBrowser(s.authPassword))
	mux.HandleFunc("POST /api/auth/device", s.authRequestDevice)
	mux.HandleFunc("GET /api/auth/device", s.securedBrowser(s.authDeviceInfo))
	mux.HandleFunc("POST /api/auth/device/approve", s.securedBrowser(s.authApproveDevice))
	mux.HandleFunc("POST /api/auth/device/token", s.authPollDevice)
	mux.HandleFunc("GET /api/auth/devices", s.securedBrowser(s.authDevices))
	mux.HandleFunc("DELETE /api/auth/devices/{id}", s.securedBrowser(s.authRevokeDevice))
	mux.HandleFunc("DELETE /api/auth/device/session", s.authDisconnectDevice)
}

func (s *Server) authRegister(w http.ResponseWriter, r *http.Request) {
	if err := s.auth.CheckBrowserRequest(r); err != nil {
		s.failure(w, r, err)
		return
	}
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decodeAuthJSON(w, r, &input); err != nil {
		s.failure(w, r, err)
		return
	}
	session, err := s.auth.Register(r, input.Email, input.Password)
	if err != nil {
		s.failure(w, r, err)
		return
	}
	s.auth.SetSessionCookie(w, session)
	s.json(w, http.StatusCreated, map[string]any{"user": session.User})
}

func (s *Server) authLogin(w http.ResponseWriter, r *http.Request) {
	if err := s.auth.CheckBrowserRequest(r); err != nil {
		s.failure(w, r, err)
		return
	}
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decodeAuthJSON(w, r, &input); err != nil {
		s.failure(w, r, err)
		return
	}
	session, err := s.auth.Login(r, input.Email, input.Password)
	if err != nil {
		s.failure(w, r, err)
		return
	}
	s.auth.SetSessionCookie(w, session)
	s.json(w, http.StatusOK, map[string]any{"user": session.User})
}

func (s *Server) authSession(w http.ResponseWriter, r *http.Request, principal model.Principal) {
	s.json(w, http.StatusOK, map[string]any{"user": auth.User{ID: principal.UserID, Email: principal.Email}})
}

func (s *Server) authLogout(w http.ResponseWriter, r *http.Request, principal model.Principal) {
	if err := s.auth.Logout(r.Context(), principal); err != nil {
		s.failure(w, r, err)
		return
	}
	s.auth.ClearSessionCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) authPassword(w http.ResponseWriter, r *http.Request, principal model.Principal) {
	var input struct {
		CurrentPassword string `json:"currentPassword"`
		Password        string `json:"password"`
	}
	if err := decodeAuthJSON(w, r, &input); err != nil {
		s.failure(w, r, err)
		return
	}
	if err := s.auth.ChangePassword(r, principal, input.CurrentPassword, input.Password); err != nil {
		s.failure(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) authRequestDevice(w http.ResponseWriter, r *http.Request) {
	if err := s.auth.CheckPairingRequest(r); err != nil {
		s.failure(w, r, err)
		return
	}
	var input struct {
		Name string `json:"name"`
	}
	if err := decodeAuthJSON(w, r, &input); err != nil {
		s.failure(w, r, err)
		return
	}
	challenge, err := s.auth.RequestDevice(r, input.Name)
	if err != nil {
		s.failure(w, r, err)
		return
	}
	s.json(w, http.StatusCreated, challenge)
}

func (s *Server) authDeviceInfo(w http.ResponseWriter, r *http.Request, principal model.Principal) {
	info, err := s.auth.DeviceInfo(r.Context(), principal, r.URL.Query().Get("userCode"))
	if err != nil {
		s.failure(w, r, err)
		return
	}
	s.json(w, http.StatusOK, info)
}

func (s *Server) authApproveDevice(w http.ResponseWriter, r *http.Request, principal model.Principal) {
	var input struct {
		UserCode string `json:"userCode"`
		Approve  *bool  `json:"approve"`
	}
	if err := decodeAuthJSON(w, r, &input); err != nil {
		s.failure(w, r, err)
		return
	}
	if input.Approve == nil {
		s.failure(w, r, &model.APIError{Status: http.StatusBadRequest, Message: "Choose whether to approve this device", Code: "approval_required"})
		return
	}
	if err := s.auth.ApproveDevice(r.Context(), principal, input.UserCode, *input.Approve); err != nil {
		s.failure(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) authPollDevice(w http.ResponseWriter, r *http.Request) {
	if err := s.auth.CheckPairingRequest(r); err != nil {
		s.failure(w, r, err)
		return
	}
	var input struct {
		DeviceCode string `json:"deviceCode"`
	}
	if err := decodeAuthJSON(w, r, &input); err != nil {
		s.failure(w, r, err)
		return
	}
	result, err := s.auth.PollDevice(r, input.DeviceCode)
	if err != nil {
		s.failure(w, r, err)
		return
	}
	status := http.StatusOK
	if result.Status == "pending" {
		status = http.StatusAccepted
	}
	s.json(w, status, result)
}

func (s *Server) authDevices(w http.ResponseWriter, r *http.Request, principal model.Principal) {
	devices, err := s.auth.Devices(r.Context(), principal)
	if err != nil {
		s.failure(w, r, err)
		return
	}
	s.json(w, http.StatusOK, map[string]any{"devices": devices})
}

func (s *Server) authRevokeDevice(w http.ResponseWriter, r *http.Request, principal model.Principal) {
	if err := s.auth.RevokeDevice(r.Context(), principal, r.PathValue("id")); err != nil {
		s.failure(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) authDisconnectDevice(w http.ResponseWriter, r *http.Request) {
	principal, err := s.auth.ResolveDevice(r)
	if err != nil {
		s.failure(w, r, err)
		return
	}
	if err := s.auth.DisconnectDevice(r.Context(), principal); err != nil {
		s.failure(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(http.StatusNoContent)
}

func decodeAuthJSON(w http.ResponseWriter, r *http.Request, target any) error {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		return &model.APIError{Status: http.StatusUnsupportedMediaType, Message: "Send an application/json request", Code: "json_required"}
	}
	// The shared JSON decoder retains its single-document behavior. Its
	// outer body limit cannot relax this smaller credential-input limit.
	r.Body = http.MaxBytesReader(w, r.Body, 8*1024)
	return decodeJSON(w, r, target)
}
