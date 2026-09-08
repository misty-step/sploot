package recovery

import (
	"context"
	"errors"
	"io"
	"net"
	"net/url"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type databaseConnection struct {
	config *pgx.ConnConfig
	uri    *url.URL
}

// Do not let ambient PG* credentials, services, or options choose a different
// database than the explicit URL. Only DATABASE_URL is a source authority.
func parseDatabase(raw string) (*databaseConnection, error) {
	uri, err := url.Parse(raw)
	if err != nil || (uri.Scheme != "postgres" && uri.Scheme != "postgresql") || uri.Hostname() == "" || uri.User == nil || uri.User.Username() == "" || uri.Fragment != "" {
		return nil, failure("database", "an explicit PostgreSQL URL with host, user, and database is required")
	}
	name := strings.TrimPrefix(uri.Path, "/")
	if name == "" || strings.Contains(name, "/") || strings.ContainsAny(name, "\x00\r\n") {
		return nil, failure("database", "an explicit single database name is required")
	}
	query, err := url.ParseQuery(uri.RawQuery)
	if err != nil {
		return nil, failure("database", "invalid database URL query encoding")
	}
	if strings.Contains(strings.ToLower(uri.Hostname()), "-pooler.") || strings.EqualFold(query.Get("pgbouncer"), "true") {
		return nil, failure("database", "a direct DATABASE_URL is required; pooled endpoints cannot own the exported snapshot")
	}
	allowed := map[string]bool{"sslmode": true, "sslrootcert": true, "sslcert": true, "sslkey": true, "sslpassword": true, "connect_timeout": true, "channel_binding": true}
	for key, values := range query {
		if len(values) != 1 {
			return nil, failure("database", "duplicate database URL options are rejected")
		}
		if key == "schema" || key == "pgbouncer" || key == "connection_limit" || key == "pool_timeout" {
			query.Del(key)
			continue
		}
		if !allowed[key] || len(values) != 1 {
			return nil, failure("database", "unsupported or ambiguous database URL option")
		}
	}
	if !query.Has("connect_timeout") {
		query.Set("connect_timeout", "15")
	}
	if !query.Has("sslmode") {
		query.Set("sslmode", "prefer")
	}
	if uri.Port() == "" {
		uri.Host = net.JoinHostPort(uri.Hostname(), "5432")
	}
	uri.RawQuery = query.Encode()
	password, _ := uri.User.Password()
	if os.Getenv("PGSERVICE") != "" {
		return nil, failure("database", "unset PGSERVICE; only the explicit PostgreSQL URL may choose connection authority")
	}
	// Explicit values override ambient passfile and TLS identity settings
	// before pgx can read them. Never temporarily mutate process environment.
	settings := map[string]string{"host": uri.Hostname(), "port": uri.Port(), "database": name, "user": uri.User.Username(), "password": password, "passfile": os.DevNull, "servicefile": "", "sslmode": "prefer", "sslcert": "", "sslkey": "", "sslrootcert": "", "sslpassword": "", "target_session_attrs": "any", "options": "", "sslnegotiation": "postgres", "sslsni": "1", "channel_binding": "prefer", "require_auth": "", "min_protocol_version": "3.0", "max_protocol_version": "3.0"}
	for key, values := range query {
		settings[key] = values[0]
	}
	var connection strings.Builder
	for key, value := range settings {
		connection.WriteString(key + "=" + libpqQuote(value) + " ")
	}
	config, err := pgx.ParseConfig(connection.String())
	if err != nil {
		return nil, failure("database", "cannot parse explicit PostgreSQL connection configuration")
	}
	config.Password = password
	config.RuntimeParams = map[string]string{"application_name": "sploot-library-backup", "timezone": "UTC", "datestyle": "ISO, YMD", "intervalstyle": "postgres", "extra_float_digits": "3", "bytea_output": "hex", "search_path": "pg_catalog", "row_security": "off", "lock_timeout": "10000"}
	// Do not inherit session-affecting callbacks or non-URL failover endpoints.
	if config.Host != uri.Hostname() || config.Database != name || config.User != uri.User.Username() {
		return nil, failure("database", "connection configuration does not match the explicit database URL")
	}
	return &databaseConnection{config: config, uri: uri}, nil
}

func (d *databaseConnection) connect(ctx context.Context, readOnly bool) (*pgx.Conn, error) {
	config := d.config.Copy()
	if readOnly {
		config.RuntimeParams["default_transaction_read_only"] = "on"
	}
	conn, err := pgx.ConnectConfig(ctx, config)
	if err != nil {
		return nil, databaseError("database-connect", err)
	}
	return conn, nil
}

func (d *databaseConnection) identity(ctx context.Context, tx pgx.Tx) (DatabaseIdentity, error) {
	var identity DatabaseIdentity
	if err := tx.QueryRow(ctx, `SELECT current_database(), current_setting('server_version_num')::int`).Scan(&identity.Name, &identity.ServerVersion); err != nil {
		return identity, databaseError("database-inventory", err)
	}
	identity.EndpointSHA256 = digest([]byte(strings.ToLower(d.uri.Hostname()) + ":" + strconv.Itoa(int(d.config.Port)) + "/" + identity.Name))
	return identity, nil
}

func (d *databaseConnection) constrainTarget(ctx context.Context, source DatabaseIdentity, remote bool) error {
	if strings.EqualFold(d.config.Database, source.Name) {
		return failure("restore-safety", "target database must have a different name from the source, even on another server")
	}
	host := d.config.Host
	if !remote {
		ip := net.ParseIP(host)
		if !(strings.EqualFold(host, "localhost") || ip != nil && ip.IsLoopback()) {
			return failure("restore-safety", "nonlocal targets are rejected; use a loopback host or explicitly opt in to a remote isolated target")
		}
	}
	// Resolve once, validate every answer, and pin connection attempts so DNS
	// cannot move a supposedly local target after preflight.
	addresses, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil || len(addresses) == 0 {
		return failure("restore-safety", "cannot resolve target database host")
	}
	for _, address := range addresses {
		if !remote && !address.IP.IsLoopback() {
			return failure("restore-safety", "every target database address must be loopback")
		}
	}
	pinned := addresses[0].IP.String()
	d.config.LookupFunc = func(context.Context, string) ([]string, error) { return []string{pinned}, nil }
	// libpq receives hostaddr too, retaining hostname TLS verification.
	query := d.uri.Query()
	query.Set("hostaddr", pinned)
	d.uri.RawQuery = query.Encode()
	return nil
}

func databaseError(phase string, err error) error {
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return failure(phase, "database operation canceled or timed out")
	}
	var postgres *pgconn.PgError
	if errors.As(err, &postgres) {
		return failure(phase, "PostgreSQL rejected the operation (SQLSTATE "+postgres.Code+"); verify direct connection, full-table read permissions, pgvector, and matching PostgreSQL tools")
	}
	return failure(phase, "database operation failed; verify explicit credentials, connectivity, permissions, and PostgreSQL tool compatibility")
}

func libpqQuote(value string) string {
	return "'" + strings.ReplaceAll(strings.ReplaceAll(value, "\\", "\\\\"), "'", "\\'") + "'"
}

func (d *databaseConnection) command(ctx context.Context, program string, args []string, input io.Reader, output io.Writer, readOnly bool) error {
	// Connection settings stay in a private service file; the login password
	// uses only the child environment. Nothing enters argv or normal output.
	dir, err := os.MkdirTemp("", "sploot-pg-service-")
	if err != nil {
		return failure(program, "cannot create private PostgreSQL service configuration")
	}
	defer os.RemoveAll(dir)
	service := "[sploot_recovery]\n"
	values := map[string]string{"host": d.uri.Hostname(), "port": strconv.Itoa(int(d.config.Port)), "dbname": d.config.Database, "user": d.config.User}
	for key, items := range d.uri.Query() {
		values[key] = items[0]
	}
	for key, value := range values {
		if strings.ContainsAny(value, "\r\n\x00") || strings.TrimSpace(value) != value {
			return failure(program, "multiline or surrounding-whitespace database connection values are unsupported")
		}
		// Service-file values are literal INI values, not SQL/conninfo strings.
		service += key + "=" + value + "\n"
	}
	servicePath := dir + "/pg_service.conf"
	if err := os.WriteFile(servicePath, []byte(service), 0600); err != nil {
		return failure(program, "cannot persist private PostgreSQL service configuration")
	}
	command := exec.CommandContext(ctx, program, append(args, "--dbname=service=sploot_recovery")...)
	command.WaitDelay = 10 * time.Second
	for _, value := range os.Environ() {
		key, _, _ := strings.Cut(value, "=")
		if strings.HasPrefix(key, "PG") || key == "DATABASE_URL" || strings.Contains(key, "TOKEN") || strings.Contains(key, "SECRET") || strings.Contains(key, "PASSWORD") {
			continue
		}
		command.Env = append(command.Env, value)
	}
	options := "-c timezone=UTC -c datestyle=ISO,YMD -c intervalstyle=postgres -c extra_float_digits=3 -c bytea_output=hex -c lock_timeout=10000"
	if readOnly {
		options += " -c default_transaction_read_only=on"
	}
	command.Env = append(command.Env, "PGSERVICEFILE="+servicePath, "PGPASSFILE="+dir+"/no-passfile", "PGPASSWORD="+d.config.Password, "PGOPTIONS="+options, "LC_ALL=C")
	command.Stdin = input
	command.Stdout = output
	// pg_dump/restore can print statements and connection URLs. Never forward raw
	// stderr; classify bounded diagnostic text and discard it after the command.
	diagnostic := &boundedDiagnostic{}
	command.Stderr = diagnostic
	if err := command.Run(); err != nil {
		if ctx.Err() != nil {
			return failure(program, "command canceled; incomplete restore is rolled back and incomplete database snapshots cannot resume")
		}
		var missing *exec.Error
		if errors.As(err, &missing) {
			return failure(program, "PostgreSQL client executable is unavailable on PATH")
		}
		return failure(program, diagnostic.reason())
	}
	return nil
}

type boundedDiagnostic struct{ text []byte }

func (d *boundedDiagnostic) Write(p []byte) (int, error) {
	if remaining := 64*1024 - len(d.text); remaining > 0 {
		if remaining > len(p) {
			remaining = len(p)
		}
		d.text = append(d.text, p[:remaining]...)
	}
	return len(p), nil
}
func (d *boundedDiagnostic) reason() string {
	text := strings.ToLower(string(d.text))
	switch {
	case strings.Contains(text, "version mismatch"), strings.Contains(text, "unsupported version"):
		return "PostgreSQL client/archive version mismatch; use a compatible pg_dump/pg_restore pair"
	case strings.Contains(text, "permission denied"), strings.Contains(text, "must be owner"), strings.Contains(text, "row-level security"):
		return "insufficient database privileges; the operator role must read all source tables and create the restored schema"
	case strings.Contains(text, "password authentication"), strings.Contains(text, "no password supplied"):
		return "database authentication failed; verify the explicitly supplied authority"
	case strings.Contains(text, "no space left"):
		return "insufficient destination storage"
	case strings.Contains(text, "extension"), strings.Contains(text, "vector"):
		return "schema restore failed; check pgvector and required extension versions on the isolated target"
	default:
		return "command failed; raw diagnostics withheld to protect credentials and private data; check database access, schema permissions, tool compatibility, and free space"
	}
}
