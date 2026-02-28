"""
Comprehensive PostHog integration for product analytics and user tracking
"""
import posthog
import atexit

class PostHogAnalytics:
    def __init__(self, api_key=None, host="https://app.posthog.com"):
        """Initialize PostHog analytics"""
        self.api_key = api_key
        self.host = host
        
        if self.api_key:
            self.init_posthog()
    
    def init_posthog(self):
        """Initialize PostHog client with comprehensive configuration"""
        posthog.api_key = self.api_key
        posthog.host = self.host
        
        # Enable comprehensive event tracking
        posthog.debug = True  # Enable debug mode for development
        posthog.on_error = self.handle_error  # Custom error handling
        
        # Register cleanup
        atexit.register(self.flush)
    
    def handle_error(self, error):
        """Handle PostHog errors gracefully"""
        print(f"PostHog error: {error}")
    
    def capture_event(self, event, properties=None, user_id=None):
        """Capture a custom event with properties"""
        if self.api_key:
            posthog.capture(
                distinct_id=user_id or "anonymous",
                event=event,
                properties=properties or {}
            )
    
    def identify_user(self, user_id, properties=None):
        """Identify a user with properties"""
        if self.api_key:
            posthog.identify(
                distinct_id=user_id,
                properties=properties or {}
            )
    
    def set_user_properties(self, user_id, properties):
        """Set properties for a user"""
        if self.api_key:
            posthog.people_set(
                distinct_id=user_id,
                properties=properties
            )
    
    def track_page_view(self, url, user_id=None, properties=None):
        """Track a page view event"""
        if self.api_key:
            self.capture_event(
                event="$pageview",
                properties={
                    **(properties or {}),
                    "url": url,
                    "path": url.split("?")[0]
                },
                user_id=user_id
            )
    
    def track_feature_usage(self, feature_name, user_id=None, properties=None):
        """Track feature usage"""
        if self.api_key:
            self.capture_event(
                event="feature_usage",
                properties={
                    **(properties or {}),
                    "feature": feature_name
                },
                user_id=user_id
            )
    
    def flush(self):
        """Flush any remaining events"""
        if self.api_key:
            posthog.flush()

# Global instance
posthog_analytics = PostHogAnalytics()
