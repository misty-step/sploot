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
 * Discriminated union of all possible analytics events.
 * Each event has a unique name and typed properties for type safety.
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
 * Track an analytics event (client-side).
 * Respects Do Not Track, sanitizes PII, never throws.
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
 * Track an analytics event (server-side).
 * Uses server-side Vercel Analytics API with dynamic import.
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
 * Track a multi-step flow for funnel analysis.
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
 * Track operation timing for performance monitoring.
 */
export function trackTiming(
  operation: string,
  duration: number,
  success: boolean,
  metadata?: Record<string, any>
): void {
  try {
    const sanitized = metadata ? sanitizeEventProperties(metadata) : {};
    vercelTrack(`timing:${operation}`, {
      duration,
      success,
      ...sanitized,
    });
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
