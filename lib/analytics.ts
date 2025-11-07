/**
 * Analytics Service - Type-safe event tracking with PII sanitization
 *
 * Provides a unified interface for tracking analytics events across client and server.
 * Automatically handles Do Not Track, sanitizes PII, and validates event structures.
 *
 * @module lib/analytics
 */

import { track as vercelTrack } from '@vercel/analytics';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Analytics event payload with a discriminated union of supported event names and properties.
 *
 * @public
 */
export type AnalyticsEvent =
  | { name: 'upload_file_selected'; properties: { count: number; totalSize: number } }
  | { name: 'upload_started'; properties: { assetId: string; size: number } }
  | { name: 'upload_completed'; properties: { assetId: string; duration: number; size: number } }
  | { name: 'upload_failed'; properties: { reason: string; size: number } }
  | { name: 'search_query_submitted'; properties: { queryLength: number; hasFilters: boolean } }
  | { name: 'search_results_shown'; properties: { count: number; latency: number; hasFilters: boolean } }
  | { name: 'search_result_clicked'; properties: { position: number; score: number; assetId: string } }
  | { name: 'search_no_results'; properties: { query: string } }
  | { name: 'asset_favorited'; properties: { assetId: string } }
  | { name: 'asset_unfavorited'; properties: { assetId: string } }
  | { name: 'asset_deleted'; properties: { assetId: string; hadTags: boolean } }
  | { name: 'tag_added'; properties: { assetId: string; tagName: string } }
  | { name: 'tag_removed'; properties: { assetId: string; tagName: string } };


/**
 * Sanitized property values (primitives only, no objects)
 */
type SanitizedProperties = Record<string, string | number | boolean>;

// ============================================================================
// Public API
// ============================================================================

/**
 * Track an analytics event on the client.
 *
 * Respects the browser's Do Not Track setting, sanitizes PII, and never throws.
 *
 * @param event - Structured analytics event payload.
 */
export function track(event: AnalyticsEvent): void {
  try {
    if (typeof window !== 'undefined' && navigator.doNotTrack === '1') {
      return;
    }

    const sanitized = sanitizeEventProperties(event.properties);
    vercelTrack(event.name, sanitized);
  } catch (error) {
    console.error('[Analytics] Tracking failed:', error);
  }
}

/**
 * Track an analytics event on the server via the Vercel Analytics API.
 *
 * @param event - Structured analytics event payload.
 * @returns Promise that resolves once the analytics call completes.
 */
export async function trackServer(event: AnalyticsEvent): Promise<void> {
  try {
    const sanitized = sanitizeEventProperties(event.properties);
    const { track: vercelTrackServer } = await import('@vercel/analytics/server');
    await vercelTrackServer(event.name, sanitized);
  } catch (error) {
    console.error('[Analytics] Server tracking failed:', error);
  }
}

/**
 * Track a funnel step for multi-step flows.
 *
 * @param flowName - Identifier for the flow (e.g. `upload_wizard`).
 * @param step - Descriptive step name within the flow.
 * @param metadata - Optional contextual data for the step.
 */
export function trackFlow(
  flowName: string,
  step: string,
  metadata?: Record<string, any>
): void {
  try {
    const sanitized = metadata ? sanitizeEventProperties(metadata) : {};
    vercelTrack(`flow:${flowName}:${step}`, sanitized);
  } catch (error) {
    console.error('[Analytics] Flow tracking failed:', error);
  }
}

/**
 * Track timing metrics for a named operation.
 *
 * Automatically detects the environment (client vs server) and uses the appropriate
 * Vercel Analytics API. Client-side calls are synchronous, server-side calls are
 * async but fire-and-forget to avoid blocking.
 *
 * @param operation - Unique operation identifier.
 * @param duration - Duration in milliseconds.
 * @param success - Whether the operation completed successfully.
 * @param metadata - Optional contextual data to attach.
 */
export function trackTiming(
  operation: string,
  duration: number,
  success: boolean,
  metadata?: Record<string, any>
): void {
  try {
    const sanitized = metadata ? sanitizeEventProperties(metadata) : {};
    const eventName = `timing:${operation}`;
    const properties = {
      duration,
      success,
      ...sanitized,
    };

    // Client-side: use synchronous client API
    if (typeof window !== 'undefined') {
      vercelTrack(eventName, properties);
    } else {
      // Server-side: use async server API (fire and forget)
      (async () => {
        try {
          const { track: vercelTrackServer } = await import('@vercel/analytics/server');
          await vercelTrackServer(eventName, properties);
        } catch (err) {
          console.error('[Analytics] Server timing tracking failed:', err);
        }
      })();
    }
  } catch (error) {
    console.error('[Analytics] Timing tracking failed:', error);
  }
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Sanitize event properties to remove PII and ensure safe data.
 *
 * PII handling:
 * - User IDs → '[REDACTED]'
 * - Email addresses → '[REDACTED]'
 * - URLs with query params → Stripped to pathname only
 * - Objects → '[OBJECT]' (not supported by analytics)
 * - Undefined values → Removed
 */
function sanitizeEventProperties(properties: Record<string, any>): SanitizedProperties {
  const sanitized: SanitizedProperties = {};

  for (const [key, value] of Object.entries(properties)) {
    // Skip undefined values
    if (value === undefined) {
      continue;
    }

    // Redact user IDs (shouldn't send PII)
    if (key === 'userId') {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    // Redact email addresses
    if (key.includes('email') || isEmail(value)) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    // Strip query params from URLs
    if ((key === 'url' || key === 'referrer') && typeof value === 'string') {
      sanitized[key] = stripQueryParams(value);
      continue;
    }

    // Pass through primitives only
    if (isPrimitive(value)) {
      sanitized[key] = value;
    } else {
      sanitized[key] = '[OBJECT]';
    }
  }

  return sanitized;
}

/**
 * Check if a value is a primitive (string, number, boolean)
 */
function isPrimitive(value: any): value is string | number | boolean {
  const type = typeof value;
  return type === 'string' || type === 'number' || type === 'boolean';
}

/**
 * Check if a string looks like an email address
 */
function isEmail(value: any): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  // Simple email regex - good enough for PII detection
  return /\S+@\S+\.\S+/.test(value);
}

/**
 * Strip query parameters from a URL
 */
function stripQueryParams(url: string): string {
  try {
    const urlObj = new URL(url);
    return `${urlObj.origin}${urlObj.pathname}`;
  } catch {
    // If URL parsing fails, try simple string manipulation
    const queryIndex = url.indexOf('?');
    return queryIndex !== -1 ? url.substring(0, queryIndex) : url;
  }
}
