"""
Comprehensive Sentry integration for error monitoring and performance tracking
"""
import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration
from sentry_sdk.integrations.celery import CeleryIntegration
from sentry_sdk.integrations.redis import RedisIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

class SentryMonitor:
    def __init__(self, dsn=None, environment="development", release=None):
        """Initialize Sentry monitoring"""
        self.dsn = dsn
        self.environment = environment
        self.release = release
        
        if self.dsn:
            self.init_sentry()
    
    def init_sentry(self):
        """Initialize Sentry SDK with comprehensive integrations"""
        sentry_sdk.init(
            dsn=self.dsn,
            environment=self.environment,
            release=self.release,
            integrations=[
                FlaskIntegration(),
                CeleryIntegration(),
                RedisIntegration(),
                SqlalchemyIntegration()
            ],
            # Performance monitoring
            traces_sample_rate=1.0 if self.environment == "development" else 0.2,
            # Capture all exceptions
            profiles_sample_rate=1.0 if self.environment == "development" else 0.1,
            # Enable session replay
            replays_session_sample_rate=0.1 if self.environment == "development" else 0.01,
            replays_on_error_sample_rate=1.0,
            # Enable debug mode in development
            debug=self.environment == "development"
        )
    
    def capture_message(self, message, level="info", extra=None):
        """Capture a message with additional context"""
        if self.dsn:
            sentry_sdk.capture_message(message, level=level, extra=extra)
    
    def capture_exception(self, error=None, extra=None):
        """Capture an exception with additional context"""
        if self.dsn:
            sentry_sdk.capture_exception(error, extra=extra)
    
    def set_user(self, user_id, email=None, username=None):
        """Set user context for tracking"""
        if self.dsn:
            sentry_sdk.set_user({
                'id': user_id,
                'email': email,
                'username': username
            })
    
    def set_tags(self, tags):
        """Set tags for additional context"""
        if self.dsn:
            for key, value in tags.items():
                sentry_sdk.set_tag(key, value)

    def add_breadcrumb(self, message, category=None, level="info"):
        """Add breadcrumb for tracing"""
        if self.dsn:
            sentry_sdk.add_breadcrumb(
                message=message,
                category=category,
                level=level
            )

# Global instance
sentry_monitor = SentryMonitor()
