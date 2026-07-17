export const PERFORMANCE_METRIC_NAMES = [
  'time_to_empty_state',
  'broken_images_ratio',
  'image_grid_cls',
  'first_contentful_paint',
  'largest_contentful_paint',
] as const;

export const PERFORMANCE_METRIC_UNITS = [
  'ms',
  'count',
  'ratio',
  'score',
] as const;

export type PerformanceMetricName = (typeof PERFORMANCE_METRIC_NAMES)[number];
export type PerformanceMetricUnit = (typeof PERFORMANCE_METRIC_UNITS)[number];

export type PerformanceTelemetryTags = Partial<{
  target: number;
  met: boolean;
  broken_count: number;
  total_count: number;
  percent: string;
  rating: 'good' | 'needs-improvement' | 'poor';
}>;

const PERFORMANCE_TAG_ALLOWLIST = {
  time_to_empty_state: ['target', 'met'],
  broken_images_ratio: ['broken_count', 'total_count', 'percent', 'target', 'met'],
  image_grid_cls: ['rating', 'target', 'met'],
  first_contentful_paint: ['rating'],
  largest_contentful_paint: ['rating'],
} as const satisfies Record<PerformanceMetricName, readonly (keyof PerformanceTelemetryTags)[]>;

export function getPerformanceTagAllowlist(
  metric: PerformanceMetricName
): readonly (keyof PerformanceTelemetryTags)[] {
  return PERFORMANCE_TAG_ALLOWLIST[metric];
}

export type UsageAction = 'blob_load_failure';

export interface UsageTelemetryMetadata {
  fallbackAttempted: boolean;
}

export interface ErrorTelemetryPayload {
  name: string;
  boundary: string;
  hasStack: boolean;
  hasComponentStack: boolean;
  timestamp: number;
}

export interface PerformanceTelemetryPayload {
  metric: PerformanceMetricName;
  value: number;
  unit: PerformanceMetricUnit;
  timestamp: number;
  tags?: PerformanceTelemetryTags;
}

export interface UsageTelemetryPayload {
  action: UsageAction;
  count: number;
  timestamp: number;
  metadata?: UsageTelemetryMetadata;
}

export interface AnalyticsTelemetryPayload {
  name: string;
  properties: Record<string, string | number | boolean>;
  timestamp: number;
}

export type TelemetryRequest =
  | { type: 'error'; payload: ErrorTelemetryPayload }
  | { type: 'performance'; payload: PerformanceTelemetryPayload }
  | { type: 'usage'; payload: UsageTelemetryPayload }
  | { type: 'analytics'; payload: AnalyticsTelemetryPayload };

export function isPerformanceMetricName(
  value: unknown
): value is PerformanceMetricName {
  return PERFORMANCE_METRIC_NAMES.includes(value as PerformanceMetricName);
}

export function isPerformanceMetricUnit(
  value: unknown
): value is PerformanceMetricUnit {
  return PERFORMANCE_METRIC_UNITS.includes(value as PerformanceMetricUnit);
}
