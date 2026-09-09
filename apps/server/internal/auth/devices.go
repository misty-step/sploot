package auth

import (
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/misty-step/sploot/apps/server/internal/model"
)

const (
	pairingLifetime  = 10 * time.Minute
	pairingInterval  = 2 * time.Second
	userCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
)

type DeviceChallenge struct {
	DeviceCode              string `json:"deviceCode"`
	UserCode                string `json:"userCode"`
	VerificationURI         string `json:"verificationUri"`
	VerificationURIComplete string `json:"verificationUriComplete"`
	ExpiresIn               int    `json:"expiresIn"`
	Interval                int    `json:"interval"`
}

type DeviceInfo struct {
	Name      string    `json:"name"`
	UserCode  string    `json:"userCode"`
	ExpiresAt time.Time `json:"expiresAt"`
}

type DeviceAuthorization struct {
	Status    string     `json:"status"`
	Token     string     `json:"token,omitempty"`
	User      *User      `json:"user,omitempty"`
	ExpiresAt *time.Time `json:"expiresAt,omitempty"`
}

type Device struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	CreatedAt  time.Time  `json:"createdAt"`
	LastUsedAt *time.Time `json:"lastUsedAt"`
	ExpiresAt  time.Time  `json:"expiresAt"`
}

type deviceRequest struct {
	Name       string
	ExpiresAt  time.Time
	Owner      sql.NullString
	DeniedAt   sql.NullTime
	ConsumedAt sql.NullTime
	PollAfter  sql.NullTime
}

func (s *Service) RequestDevice(r *http.Request, name string) (DeviceChallenge, error) {
	if err := s.CheckPairingRequest(r); err != nil {
		return DeviceChallenge{}, err
	}
	name = strings.TrimSpace(name)
	if name == "" || !utf8.ValidString(name) || utf8.RuneCountInString(name) > 64 || len(name) > 256 || strings.ContainsFunc(name, unicode.IsControl) {
		return DeviceChallenge{}, &model.APIError{Status: http.StatusBadRequest, Message: "Enter a device name with 1–64 characters", Code: "invalid_device_name"}
	}
	ctx := r.Context()
	if err := s.limit(ctx, "device-create:global", 120, time.Hour); err != nil {
		return DeviceChallenge{}, err
	}
	if err := s.limit(ctx, "device-create:peer:"+requestPeer(r), 30, time.Hour); err != nil {
		return DeviceChallenge{}, err
	}
	deviceCode, err := newSecret("")
	if err != nil {
		return DeviceChallenge{}, err
	}
	now := time.Now().UTC()
	if _, err := s.db.ExecContext(ctx, `DELETE FROM device_requests WHERE expires_at <= ?`, now); err != nil {
		return DeviceChallenge{}, authUnavailable()
	}
	var code string
	for range 3 {
		var value [8]byte
		if _, err := rand.Read(value[:]); err != nil {
			return DeviceChallenge{}, authUnavailable()
		}
		for i := range value {
			value[i] = userCodeAlphabet[value[i]&31]
		}
		code = string(value[:4]) + "-" + string(value[4:])
		result, err := s.db.ExecContext(ctx, `INSERT INTO device_requests
			(device_code_hash, user_code, client_name, expires_at, poll_after, created_at)
			VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_code) DO NOTHING`,
			secretHash(deviceCode), code, name, now.Add(pairingLifetime), now, now)
		if err != nil {
			return DeviceChallenge{}, authUnavailable()
		}
		if count, err := result.RowsAffected(); err != nil {
			return DeviceChallenge{}, authUnavailable()
		} else if count == 1 {
			verificationURI := s.baseURL.String() + "/app/connect"
			return DeviceChallenge{DeviceCode: deviceCode, UserCode: code, VerificationURI: verificationURI, VerificationURIComplete: verificationURI + "?code=" + url.QueryEscape(code), ExpiresIn: int(pairingLifetime / time.Second), Interval: int(pairingInterval / time.Second)}, nil
		}
	}
	return DeviceChallenge{}, authUnavailable()
}

func normalizeUserCode(code string) (string, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	if len(code) == 9 && code[4] == '-' {
		code = code[:4] + code[5:]
	}
	if len(code) != 8 {
		return "", invalidUserCode()
	}
	for _, char := range code {
		if !strings.ContainsRune(userCodeAlphabet, char) {
			return "", invalidUserCode()
		}
	}
	return code[:4] + "-" + code[4:], nil
}

func (s *Service) DeviceInfo(ctx context.Context, principal model.Principal, userCode string) (DeviceInfo, error) {
	if principal.Method != "browser" {
		return DeviceInfo{}, browserRequired()
	}
	code, err := normalizeUserCode(userCode)
	if err != nil {
		return DeviceInfo{}, err
	}
	if err := s.limit(ctx, "device-inspect:"+principal.UserID, 30, time.Minute); err != nil {
		return DeviceInfo{}, err
	}
	request, err := scanDeviceRequest(s.db.QueryRowContext(ctx, `SELECT client_name, expires_at, approved_user_id, denied_at, consumed_at, poll_after FROM device_requests WHERE user_code = ?`, code))
	if errors.Is(err, sql.ErrNoRows) {
		return DeviceInfo{}, deviceNotFound()
	}
	if err != nil {
		return DeviceInfo{}, authUnavailable()
	}
	if request.Owner.Valid && request.Owner.String != principal.UserID {
		return DeviceInfo{}, deviceNotFound()
	}
	if !request.ExpiresAt.After(time.Now()) || request.ConsumedAt.Valid {
		return DeviceInfo{}, deviceExpired()
	}
	if request.DeniedAt.Valid {
		return DeviceInfo{}, deviceDenied()
	}
	return DeviceInfo{Name: request.Name, UserCode: code, ExpiresAt: request.ExpiresAt}, nil
}

func (s *Service) ApproveDevice(ctx context.Context, principal model.Principal, userCode string, approve bool) error {
	if principal.Method != "browser" {
		return browserRequired()
	}
	code, err := normalizeUserCode(userCode)
	if err != nil {
		return err
	}
	if err := s.limit(ctx, "device-approve:"+principal.UserID, 20, time.Minute); err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return authUnavailable()
	}
	defer tx.Rollback()
	now := time.Now().UTC()
	var active bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM auth_sessions WHERE id = ? AND user_id = ? AND kind = 'browser' AND expires_at > ?)`, principal.SessionID, principal.UserID, now).Scan(&active); err != nil {
		return authUnavailable()
	}
	if !active {
		return unauthorized()
	}
	request, err := scanDeviceRequest(tx.QueryRowContext(ctx, `SELECT client_name, expires_at, approved_user_id, denied_at, consumed_at, poll_after FROM device_requests WHERE user_code = ?`, code))
	if errors.Is(err, sql.ErrNoRows) {
		return deviceNotFound()
	}
	if err != nil {
		return authUnavailable()
	}
	if request.Owner.Valid && request.Owner.String != principal.UserID {
		return deviceNotFound()
	}
	if !request.ExpiresAt.After(now) || request.ConsumedAt.Valid {
		return deviceExpired()
	}
	if request.DeniedAt.Valid {
		return deviceDenied()
	}
	var deniedAt any
	if !approve {
		deniedAt = now
	}
	result, err := tx.ExecContext(ctx, `UPDATE device_requests SET approved_user_id = ?, denied_at = ?
		WHERE user_code = ? AND consumed_at IS NULL AND denied_at IS NULL AND expires_at > ?
		AND (approved_user_id IS NULL OR approved_user_id = ?)`, principal.UserID, deniedAt, code, now, principal.UserID)
	if err != nil {
		return authUnavailable()
	}
	if count, err := result.RowsAffected(); err != nil {
		return authUnavailable()
	} else if count != 1 {
		return deviceExpired()
	}
	if err := tx.Commit(); err != nil {
		return authUnavailable()
	}
	return nil
}

func (s *Service) PollDevice(r *http.Request, deviceCode string) (DeviceAuthorization, error) {
	if err := s.CheckPairingRequest(r); err != nil {
		return DeviceAuthorization{}, err
	}
	if !validSecret(deviceCode, "") {
		return DeviceAuthorization{}, deviceExpired()
	}
	ctx := r.Context()
	if err := s.limit(ctx, "device-poll:global", 1200, time.Minute); err != nil {
		return DeviceAuthorization{}, err
	}
	if err := s.limit(ctx, "device-poll:peer:"+requestPeer(r), 180, time.Minute); err != nil {
		return DeviceAuthorization{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return DeviceAuthorization{}, authUnavailable()
	}
	defer tx.Rollback()
	now := time.Now().UTC()
	hash := secretHash(deviceCode)
	request, err := scanDeviceRequest(tx.QueryRowContext(ctx, `SELECT client_name, expires_at, approved_user_id, denied_at, consumed_at, poll_after FROM device_requests WHERE device_code_hash = ?`, hash))
	if errors.Is(err, sql.ErrNoRows) {
		return DeviceAuthorization{}, deviceExpired()
	}
	if err != nil {
		return DeviceAuthorization{}, authUnavailable()
	}
	if !request.ExpiresAt.After(now) || request.ConsumedAt.Valid {
		return DeviceAuthorization{}, deviceExpired()
	}
	if request.DeniedAt.Valid {
		return DeviceAuthorization{}, deviceDenied()
	}
	if request.PollAfter.Valid && request.PollAfter.Time.After(now) {
		seconds := int((request.PollAfter.Time.Sub(now) + time.Second - 1) / time.Second)
		return DeviceAuthorization{}, rateLimited(seconds)
	}
	if _, err := tx.ExecContext(ctx, `UPDATE device_requests SET poll_after = ? WHERE device_code_hash = ?`, now.Add(pairingInterval), hash); err != nil {
		return DeviceAuthorization{}, authUnavailable()
	}
	if !request.Owner.Valid {
		if err := tx.Commit(); err != nil {
			return DeviceAuthorization{}, authUnavailable()
		}
		return DeviceAuthorization{Status: "pending"}, nil
	}
	var user User
	if err := tx.QueryRowContext(ctx, `SELECT id, email FROM users WHERE id = ?`, request.Owner.String).Scan(&user.ID, &user.Email); errors.Is(err, sql.ErrNoRows) {
		return DeviceAuthorization{}, deviceExpired()
	} else if err != nil {
		return DeviceAuthorization{}, authUnavailable()
	}
	var count int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM auth_sessions WHERE user_id = ? AND kind = 'device' AND expires_at > ?`, user.ID, now).Scan(&count); err != nil {
		return DeviceAuthorization{}, authUnavailable()
	}
	if count >= 20 {
		return DeviceAuthorization{}, &model.APIError{Status: http.StatusUnprocessableEntity, Message: "Disconnect a device in account settings before adding another", Code: "device_limit"}
	}
	token, err := newSecret("spld_")
	if err != nil {
		return DeviceAuthorization{}, err
	}
	expiresAt := now.Add(deviceLifetime)
	if _, err := tx.ExecContext(ctx, `INSERT INTO auth_sessions (id, user_id, token_hash, kind, name, expires_at, created_at, last_used_at)
		VALUES (?, ?, ?, 'device', ?, ?, ?, ?)`, model.NewID(), user.ID, secretHash(token), request.Name, expiresAt, now, now); err != nil {
		return DeviceAuthorization{}, authUnavailable()
	}
	result, err := tx.ExecContext(ctx, `UPDATE device_requests SET consumed_at = ?
		WHERE device_code_hash = ? AND consumed_at IS NULL AND denied_at IS NULL AND expires_at > ? AND approved_user_id = ?`, now, hash, now, user.ID)
	if err != nil {
		return DeviceAuthorization{}, authUnavailable()
	}
	if count, err := result.RowsAffected(); err != nil {
		return DeviceAuthorization{}, authUnavailable()
	} else if count != 1 {
		return DeviceAuthorization{}, deviceExpired()
	}
	if err := tx.Commit(); err != nil {
		return DeviceAuthorization{}, authUnavailable()
	}
	return DeviceAuthorization{Status: "authorized", Token: token, User: &user, ExpiresAt: &expiresAt}, nil
}

func scanDeviceRequest(row *sql.Row) (deviceRequest, error) {
	var request deviceRequest
	err := row.Scan(&request.Name, &request.ExpiresAt, &request.Owner, &request.DeniedAt, &request.ConsumedAt, &request.PollAfter)
	return request, err
}

func (s *Service) Devices(ctx context.Context, principal model.Principal) ([]Device, error) {
	if principal.Method != "browser" {
		return nil, browserRequired()
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id, name, created_at, last_used_at, expires_at FROM auth_sessions
		WHERE user_id = ? AND kind = 'device' AND expires_at > ? ORDER BY created_at DESC, id DESC`, principal.UserID, time.Now().UTC())
	if err != nil {
		return nil, authUnavailable()
	}
	defer rows.Close()
	devices := make([]Device, 0)
	for rows.Next() {
		var device Device
		var lastUsed sql.NullTime
		if err := rows.Scan(&device.ID, &device.Name, &device.CreatedAt, &lastUsed, &device.ExpiresAt); err != nil {
			return nil, authUnavailable()
		}
		if lastUsed.Valid {
			device.LastUsedAt = &lastUsed.Time
		}
		devices = append(devices, device)
	}
	if err := rows.Err(); err != nil {
		return nil, authUnavailable()
	}
	return devices, nil
}

// Missing and foreign device IDs both succeed without disclosing ownership.
func (s *Service) RevokeDevice(ctx context.Context, principal model.Principal, id string) error {
	if principal.Method != "browser" {
		return browserRequired()
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM auth_sessions WHERE id = ? AND user_id = ? AND kind = 'device'`, id, principal.UserID); err != nil {
		return authUnavailable()
	}
	return nil
}

func (s *Service) DisconnectDevice(ctx context.Context, principal model.Principal) error {
	if principal.Method != "device" {
		return &model.APIError{Status: http.StatusForbidden, Message: "A device credential is required", Code: "device_required"}
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM auth_sessions WHERE id = ? AND user_id = ? AND kind = 'device'`, principal.SessionID, principal.UserID); err != nil {
		return authUnavailable()
	}
	return nil
}

func invalidUserCode() *model.APIError {
	return &model.APIError{Status: http.StatusBadRequest, Message: "Enter the eight-character code shown on your device", Code: "invalid_user_code"}
}

func deviceNotFound() *model.APIError {
	return &model.APIError{Status: http.StatusNotFound, Message: "Device request not found", Code: "device_not_found"}
}

func deviceExpired() *model.APIError {
	return &model.APIError{Status: http.StatusGone, Message: "This device request expired or was already used. Start a new connection.", Code: "device_expired"}
}

func deviceDenied() *model.APIError {
	return &model.APIError{Status: http.StatusForbidden, Message: "The device connection was denied", Code: "device_denied"}
}
