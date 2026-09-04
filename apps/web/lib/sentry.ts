import * as Sentry from '@sentry/nextjs';
import type {
  Breadcrumb,
  BrowserOptions,
  EdgeOptions,
  Event,
  EventHint,
  NodeOptions,
} from '@sentry/nextjs';

export const SENTRY_ORG = 'misty-step';
export const SENTRY_PROJECT = 'sploot';

const SERVICE = 'sploot-web';
const OWNER = 'misty-step';
const RUNBOOK_URL =
  'https://github.com/misty-step/sploot/blob/master/apps/web/docs/runbooks/sentry-error-response.md';
const REDACTED = '[redacted]';
const MAX_STRING_LENGTH = 2_000;
const MAX_ARRAY_LENGTH = 20;
const MAX_OBJECT_KEYS = 40;
const SENSITIVE_KEY_PATTERN =
  /(authorization|body|clerk|cookie|credential|dsn|email|header|ip(?:address)?|password|query|referrer?|session|secret|token|url|user(?:id|name)?|api[-_]?key)/i;
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const AUTH_VALUE_PATTERN = /\b(?:Bearer|Basic)\s+[^\s,;]+/gi;
const URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;
const HIGH_ENTROPY_VALUE_PATTERN = /\b[A-Za-z0-9_=-]{32,}\b/g;
const SAFE_ERROR_NAME = /^[A-Za-z][A-Za-z0-9._:-]{0,119}$/;
const RELEASE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+:-]{0,199}$/;
const ENVIRONMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const DEPLOYMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export type SentryRuntime = 'client' | 'server' | 'edge';
export type SentryInitOptions = BrowserOptions | NodeOptions | EdgeOptions;
type SentryTransactionEvent = Parameters<
  NonNullable<NodeOptions['beforeSendTransaction']>
>[0];
type SentrySpan = Parameters<NonNullable<NodeOptions['beforeSendSpan']>>[0];

export interface OperationalError {
  context: string;
  error: unknown;
  traceId?: string;
  metadata?: Record<string, unknown>;
}
export function createSentryOptions(target: SentryRuntime): SentryInitOptions {
  const environment = resolveSentryEnvironment();
  const dsn = resolveDsn(target);
  const deploymentEnvironment = (
    (target === 'client' ? process.env.NEXT_PUBLIC_SPLOOT_DEPLOYMENT_ENV : undefined) ??
    process.env.SPLOOT_DEPLOYMENT_ENV ??
    process.env.DEPLOYMENT_ENV
  )?.trim();
  const enabled =
    process.env.NODE_ENV !== 'test' &&
    dsn !== undefined &&
    (deploymentEnvironment === 'production' || deploymentEnvironment === 'staging');
  const production = environment === 'production';
  const tracesSampleRate = parseSampleRate(
    process.env.SENTRY_TRACES_SAMPLE_RATE,
    production ? 0.1 : 1,
    production ? 0.2 : 1,
  );

  const options: SentryInitOptions = {
    dsn,
    enabled,
    environment,
    release: resolveSentryRelease(),
    tracesSampleRate: enabled ? tracesSampleRate : 0,
    enableLogs: false,
    maxBreadcrumbs: 50,
    maxValueLength: MAX_STRING_LENGTH,
    normalizeDepth: 4,
    normalizeMaxBreadth: MAX_OBJECT_KEYS,
    sendDefaultPii: false,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      stackFrameVariables: false,
      frameContextLines: 0,
    },
    beforeSend: sanitizeSentryEvent,
    beforeBreadcrumb: sanitizeSentryBreadcrumb,
    beforeSendTransaction: sanitizeSentryTransaction,
    beforeSendSpan: sanitizeSentrySpan,
    initialScope: {
      tags: deploymentTags(),
    },
  };

  if (target === 'client') {
    return {
      ...options,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
    } as BrowserOptions;
  }

  return options;
}

export function sanitizeSentryEvent<EventType extends Event>(
  event: EventType,
  _hint?: EventHint,
): EventType {
  event.user = undefined;
  event.server_name = undefined;
  event.contexts = sanitizeValue(event.contexts) as Event['contexts'];
  event.transaction = sanitizeTransactionName(
    event.transaction,
    event.transaction_info?.source,
  );

  if (event.request) {
    event.request = event.request.method
      ? { method: sanitizeTag(event.request.method).slice(0, 16) }
      : undefined;
  }

  if (event.message) {
    event.message = sanitizeText(event.message);
  }

  if (event.logentry) {
    if (event.logentry.message) {
      event.logentry.message = sanitizeText(event.logentry.message);
    }
    if (event.logentry.params) {
      event.logentry.params = sanitizeValue(event.logentry.params) as string[];
    }
  }

  for (const exception of event.exception?.values ?? []) {
    exception.type = exception.type && SAFE_ERROR_NAME.test(exception.type) ? exception.type : 'Error';
    if (exception.value) exception.value = sanitizeText(exception.value);
    for (const frame of exception.stacktrace?.frames ?? []) {
      frame.abs_path = sanitizePath(frame.abs_path);
      frame.filename = sanitizePath(frame.filename);
      frame.vars = undefined;
      frame.pre_context = undefined;
      frame.context_line = undefined;
      frame.post_context = undefined;
    }
  }

  event.extra = sanitizeValue(event.extra) as Event['extra'];
  event.tags = sanitizeEventTags(event.tags);
  event.breadcrumbs = event.breadcrumbs
    ?.map((breadcrumb) => sanitizeSentryBreadcrumb(breadcrumb))
    .filter((breadcrumb): breadcrumb is Breadcrumb => breadcrumb !== null);

  return event;
}
export function sanitizeSentryTransaction(
  event: SentryTransactionEvent,
  hint?: EventHint,
): SentryTransactionEvent {
  const sanitized = sanitizeSentryEvent(event, hint);
  sanitized.spans = sanitized.spans?.map(sanitizeSentrySpan);
  return sanitized;
}

export function sanitizeSentrySpan(span: SentrySpan): SentrySpan {
  const data = Object.fromEntries(
    Object.entries(span.data).flatMap(([key, value]) => {
      if (
        SAFE_SPAN_DATA_KEYS[key] !== true ||
        (typeof value !== 'string' &&
          typeof value !== 'number' &&
          typeof value !== 'boolean')
      ) {
        return [];
      }

      return [[key, typeof value === 'string' ? sanitizeTag(value) : value]];
    }),
  );

  return {
    ...span,
    data,
    description: span.description ? REDACTED : undefined,
    op: span.op && SAFE_ERROR_NAME.test(span.op) ? span.op : undefined,
  };
}


export function sanitizeSentryBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category === 'console' || breadcrumb.category?.startsWith('ui.')) {
    return null;
  }

  return {
    ...breadcrumb,
    message: breadcrumb.message ? sanitizeText(breadcrumb.message) : breadcrumb.message,
    data: sanitizeValue(breadcrumb.data) as Breadcrumb['data'],
  };
}

export function captureOperationalError(input: OperationalError): boolean {
  try {
    const client = Sentry.getClient();
    if (!client?.getDsn() || client.getOptions().enabled === false) return false;

    const error = normalizeOperationalError(input.error);
    const context = sanitizeTag(input.context, 'unknown');
    const traceId = input.traceId ? sanitizeTag(input.traceId) : undefined;
    const metadata = sanitizeValue(input.metadata);

    const eventId = Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.setTag('sploot.context', context);
      scope.setFingerprint([context, error.name]);
      if (traceId) scope.setTag('sploot.trace_id', traceId);
      if (metadata !== undefined) scope.setExtra('sploot.metadata', metadata);
      return Sentry.captureException(error);
    });

    return typeof eventId === 'string' && eventId.length > 0;
  } catch {
    return false;
  }
}

export function resolveSentryEnvironment(): string {
  for (const value of [
    process.env.SPLOOT_DEPLOYMENT_ENV,
    process.env.SENTRY_ENVIRONMENT,
    process.env.DEPLOYMENT_ENV,
    process.env.NEXT_PUBLIC_SPLOOT_DEPLOYMENT_ENV,
    process.env.NODE_ENV,
  ]) {
    const candidate = value?.trim();
    if (candidate && ENVIRONMENT_PATTERN.test(candidate)) return candidate;
  }
  return 'unknown';
}

export function resolveSentryRelease(): string | undefined {
  for (const value of [
    process.env.SPLOOT_DEPLOYMENT_COMMIT,
    process.env.NEXT_PUBLIC_SPLOOT_DEPLOYMENT_COMMIT,
    process.env.SENTRY_RELEASE,
    process.env.GITHUB_SHA,
  ]) {
    const candidate = value?.trim();
    if (candidate && RELEASE_PATTERN.test(candidate)) return candidate;
  }
  return undefined;
}

function resolveDsn(target: SentryRuntime): string | undefined {
  const candidates = target === 'client'
    ? [process.env.NEXT_PUBLIC_SENTRY_DSN]
    : [process.env.SENTRY_DSN, process.env.NEXT_PUBLIC_SENTRY_DSN];

  for (const value of candidates) {
    const candidate = normalizeDsn(value);
    if (candidate) return candidate;
  }
  return undefined;
}

function normalizeDsn(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  if (!candidate) return undefined;

  try {
    const url = new URL(candidate);
    if (
      url.protocol !== 'https:' ||
      !url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.hostname !== 'sentry.io' && !url.hostname.endsWith('.sentry.io')) ||
      !/^\/\d+\/?$/.test(url.pathname)
    ) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function parseSampleRate(value: string | undefined, fallback: number, maximum: number): number {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 0), maximum);
}

function deploymentTags(): Record<string, string> {
  const tags: Record<string, string> = {
    service: SERVICE,
    owner: OWNER,
    runbook: RUNBOOK_URL,
  };

  for (const [key, value] of [
    ['deployment.app_id', process.env.SPLOOT_DEPLOYMENT_APP_ID],
    ['deployment.change_id', process.env.SPLOOT_DEPLOYMENT_CHANGE_ID],
    ['deployment.commit', process.env.SPLOOT_DEPLOYMENT_COMMIT],
  ] as const) {
    const candidate = value?.trim();
    if (candidate && DEPLOYMENT_ID_PATTERN.test(candidate)) tags[key] = candidate;
  }

  return tags;
}
function sanitizeEventTags(tags: Event['tags']): Event['tags'] {
  const safeTags = deploymentTags();

  for (const key of ['sploot.context', 'sploot.trace_id', 'sploot.boundary'] as const) {
    const value = tags?.[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      safeTags[key] = sanitizeTag(String(value));
    }
  }

  return safeTags;
}

function sanitizeTransactionName(
  value: string | undefined,
  source: NonNullable<Event['transaction_info']>['source'] | undefined,
): string | undefined {
  if (!value) return value;
  if (source === 'route' || source === 'view' || source === 'component' || source === 'task') {
    return sanitizeText(value);
  }
  return '[redacted-transaction]';
}

function normalizeOperationalError(value: unknown): Error {
  if (value instanceof Error) return value;

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const error = new Error(
      typeof record.message === 'string' ? sanitizeText(record.message) : 'Unknown error',
    );
    error.name =
      typeof record.name === 'string' && SAFE_ERROR_NAME.test(record.name)
        ? record.name
        : 'Error';
    return error;
  }

  return new Error(sanitizeText(String(value ?? 'Unknown error')));
}



function sanitizeTag(value: string, fallback?: string): string {
  const sanitized = sanitizeText(value).slice(0, 200);
  return sanitized || fallback || REDACTED;
}

function sanitizePath(value: string | undefined): string | undefined {
  if (!value) return value;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.slice(0, MAX_STRING_LENGTH);
  } catch {
    return sanitizeText(value);
  }
}

function sanitizeText(value: string): string {
  return value
    .replace(AUTH_VALUE_PATTERN, REDACTED)
    .replace(EMAIL_PATTERN, REDACTED)
    .replace(URL_PATTERN, REDACTED)
    .replace(HIGH_ENTROPY_VALUE_PATTERN, REDACTED)
    .slice(0, MAX_STRING_LENGTH);
}

const SAFE_SPAN_DATA_KEYS: Record<string, true> = {
  'http.method': true,
  'http.request.method': true,
  'http.response.status_code': true,
  'http.status_code': true,
  'sentry.op': true,
  'sentry.origin': true,
  'sentry.source': true,
};

function sanitizeValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > 4) return '[truncated]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitizeText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item) => sanitizeValue(item, depth + 1, seen));
  }
  if (typeof value !== 'object') return sanitizeText(String(value));
  if (seen.has(value)) return '[circular]';

  seen.add(value);
  const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS);
  return Object.fromEntries(
    entries.map(([key, item]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : sanitizeValue(item, depth + 1, seen),
    ]),
  );
}
