package observability

import (
	"errors"
	"fmt"
	"log/slog"
	"os"
	"regexp"
	"strings"

	"github.com/getsentry/sentry-go"
)

var sensitiveKey = regexp.MustCompile(`(?i)(authorization|cookie|token|secret|password|email|user.?id|account.?id|query|url|body|filename|pathname)`)
var urlValue = regexp.MustCompile(`[a-zA-Z][a-zA-Z0-9+.-]*://[^\s"'<>]+`)
var emailValue = regexp.MustCompile(`[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`)
var opaqueValue = regexp.MustCompile(`\b[A-Za-z0-9_=-]{32,}\b`)

func NewLogger() *slog.Logger {
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{ReplaceAttr: func(_ []string, attribute slog.Attr) slog.Attr {
		if sensitiveKey.MatchString(attribute.Key) {
			return slog.String(attribute.Key, "[redacted]")
		}
		if err, ok := attribute.Value.Any().(error); ok {
			return slog.String(attribute.Key, ErrorKind(err))
		}
		if attribute.Value.Kind() == slog.KindString {
			attribute.Value = slog.StringValue(sanitizeText(attribute.Value.String()))
		}
		return attribute
	}}))
}

// Error values can contain SQL rows, provider responses or credentials. Log the
// typed cause chain and SQLSTATE, never the uncontrolled error string.
func ErrorKind(err error) string {
	var names []string
	for depth := 0; err != nil && depth < 6; depth++ {
		name := fmt.Sprintf("%T", err)
		if state, ok := err.(interface{ SQLState() string }); ok {
			name += " SQLSTATE=" + state.SQLState()
		}
		names = append(names, name)
		err = errors.Unwrap(err)
	}
	return strings.Join(names, " <- ")
}

func Init(dsn, environment, revision string) error {
	if environment != "production" && environment != "staging" {
		return nil
	}
	return sentry.Init(sentry.ClientOptions{
		Dsn: dsn, Environment: environment, Release: revision, SendDefaultPII: false,
		AttachStacktrace: true, EnableTracing: false, MaxBreadcrumbs: 0,
		BeforeSend: func(event *sentry.Event, hint *sentry.EventHint) *sentry.Event {
			event.User = sentry.User{}
			event.Request = nil
			event.ServerName = ""
			event.Contexts = nil
			event.Breadcrumbs = nil
			event.Attachments = nil
			event.Threads = nil
			event.DebugMeta = nil
			event.Message = sanitizeText(event.Message)
			for key, value := range event.Tags {
				if sensitiveKey.MatchString(key) {
					delete(event.Tags, key)
				} else {
					event.Tags[key] = sanitizeText(value)
				}
			}
			for index := range event.Exception {
				item := &event.Exception[index]
				item.Value = "Operation failed; use the typed runtime diagnostic and source revision."
				if hint != nil && hint.OriginalException != nil {
					item.Value = ErrorKind(hint.OriginalException)
				}
				if item.Mechanism != nil {
					item.Mechanism.Data = nil
				}
				if item.Stacktrace != nil {
					for frame := range item.Stacktrace.Frames {
						item.Stacktrace.Frames[frame].Vars = nil
						item.Stacktrace.Frames[frame].PreContext = nil
						item.Stacktrace.Frames[frame].ContextLine = ""
						item.Stacktrace.Frames[frame].PostContext = nil
						item.Stacktrace.Frames[frame].AbsPath = ""
					}
				}
			}
			return event
		},
	})
}

func Capture(err error, operation string) {
	sentry.WithScope(func(scope *sentry.Scope) {
		scope.SetTag("service", "sploot-web")
		scope.SetTag("owner", "misty-step")
		scope.SetTag("operation", sanitizeText(operation))
		sentry.CaptureException(err)
	})
}

func sanitizeText(value string) string {
	if len(value) > 2000 {
		value = value[:2000]
	}
	value = urlValue.ReplaceAllString(value, "[redacted]")
	value = emailValue.ReplaceAllString(value, "[redacted]")
	return opaqueValue.ReplaceAllString(value, "[redacted]")
}
