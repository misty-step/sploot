package httpapi

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"regexp"
	"time"

	"github.com/misty-step/sploot/apps/server/internal/model"
)

var safeTelemetryName = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9._:-]{0,119}$`)
var telemetryPrivateName = regexp.MustCompile(`(?i)(token|secret|password|cookie|email|user.?id|account.?id|query|url|body|filename)`)

func (s *Server) telemetry(w http.ResponseWriter, r *http.Request, p model.Principal) {
	r.Body = http.MaxBytesReader(w, r.Body, 16384)
	var request struct {
		Type    string         `json:"type"`
		Payload map[string]any `json:"payload"`
	}
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&request); err != nil {
		status := 400
		var oversized *http.MaxBytesError
		if errors.As(err, &oversized) {
			status = 413
		}
		s.json(w, status, map[string]bool{"success": false})
		return
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF || request.Payload == nil {
		s.json(w, 400, map[string]bool{"success": false})
		return
	}
	if request.Type != "error" && request.Type != "analytics" && request.Type != "performance" && request.Type != "usage" {
		s.json(w, 400, map[string]bool{"success": false})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 500*time.Millisecond)
	defer cancel()
	owner := sha256.Sum256([]byte(p.UserID))
	key := fmt.Sprintf("telemetry:%s:%d", hex.EncodeToString(owner[:]), time.Now().Unix()/60)
	var count int
	err := s.db.QueryRowContext(ctx, `INSERT INTO request_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=request_limits.count+1 WHERE request_limits.count<60 RETURNING count`, key, time.Now().UTC().Add(2*time.Minute)).Scan(&count)
	if errors.Is(err, sql.ErrNoRows) {
		s.json(w, 429, map[string]bool{"success": false})
		return
	}
	if err != nil {
		s.logger.Warn("telemetry limiter unavailable", "operation", "telemetry")
		s.json(w, 200, map[string]bool{"success": false})
		return
	}
	if count == 1 {
		_, _ = s.db.ExecContext(ctx, `DELETE FROM request_limits WHERE key LIKE 'telemetry:%' AND expires_at<?`, time.Now().UTC())
	}
	properties := make(map[string]any)
	name, _ := request.Payload["name"].(string)
	if !safeTelemetryName.MatchString(name) || telemetryPrivateName.MatchString(name) {
		name = "client.event"
	}
	properties["name"] = name
	for _, key := range []string{"hasStack", "hasComponentStack", "value", "duration", "count", "success", "position", "score", "latency", "hasFilters", "size", "totalSize"} {
		value, ok := request.Payload[key]
		if nested, exists := request.Payload["properties"].(map[string]any); exists {
			if entry, exists := nested[key]; exists {
				value, ok = entry, true
			}
		}
		if !ok {
			continue
		}
		switch value := value.(type) {
		case bool:
			properties[key] = value
		case float64:
			if !math.IsNaN(value) && !math.IsInf(value, 0) && math.Abs(value) <= 1e12 {
				properties[key] = value
			}
		}
	}
	if boundary, ok := request.Payload["boundary"].(string); ok && safeTelemetryName.MatchString(boundary) && !telemetryPrivateName.MatchString(boundary) {
		properties["boundary"] = boundary
	}
	s.logger.Info("client telemetry", "kind", request.Type, "properties", properties)
	s.json(w, 200, map[string]bool{"success": true})
}
