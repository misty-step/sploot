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
export type TelemetryMetadata = Record<string, unknown>;

export interface ErrorTelemetryPayload {
  name: string;
  message: string;
  stack?: string;
  componentStack?: string;
  url?: string;
  location?: {
    origin: string;
    pathname: string;
  };
  boundary?: string;
  hasStack?: boolean;
  hasComponentStack?: boolean;
  digest?: string;
  timestamp: number;
  metadata?: TelemetryMetadata;
}

export interface PerformanceTelemetryPayload {
  metric: PerformanceMetricName;
  value: number;
  unit: PerformanceMetricUnit;
  timestamp: number;
  tags?: TelemetryMetadata;
}

export interface UsageTelemetryPayload {
  action: string;
  count: number;
  timestamp: number;
  metadata?: TelemetryMetadata;
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
