/**
 * Conditional logging utility for development/production environments.
 * Automatically tree-shaken in production builds for zero overhead.
 */

const isDevelopment = process.env.NODE_ENV === 'development';
const isServer = typeof window === 'undefined';

/**
 * Logger configuration
 */
const config = {
  enabled: isDevelopment,
  prefix: '[Sploot]',
  colors: {
    debug: '\x1b[36m', // Cyan
    info: '\x1b[37m',  // White
    warn: '\x1b[33m',  // Yellow
    error: '\x1b[31m', // Red
    reset: '\x1b[0m',
  },
};

/**
 * Format log message with timestamp and prefix
 */
function formatMessage(level: string, message: string): string {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
  return `${config.prefix} [${timestamp}] [${level.toUpperCase()}] ${message}`;
}

/**
 * Debug level logging - detailed information for debugging
 */
export function debug(...args: any[]): void {
  if (!config.enabled) return;

  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');

  if (isServer) {
    console.log(`${config.colors.debug}${formatMessage('debug', message)}${config.colors.reset}`);
  } else {
    console.log(formatMessage('debug', message), ...args.slice(1));
  }
}

/**
 * Info level logging - general information
 */
export function info(...args: any[]): void {
  if (!config.enabled) return;

  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');

  if (isServer) {
    console.info(`${config.colors.info}${formatMessage('info', message)}${config.colors.reset}`);
  } else {
    console.info(formatMessage('info', message), ...args.slice(1));
  }
}

/**
 * Warning level logging - potential issues
 */
export function warn(...args: any[]): void {
  if (!config.enabled) return;

  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');

  if (isServer) {
    console.warn(`${config.colors.warn}${formatMessage('warn', message)}${config.colors.reset}`);
  } else {
    console.warn(formatMessage('warn', message), ...args.slice(1));
  }
}

/**
 * Error level logging - always enabled for production errors
 */
export function error(...args: any[]): void {
  // Errors are always logged, even in production
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');

  if (isServer) {
    console.error(`${config.colors.error}${formatMessage('error', message)}${config.colors.reset}`);
  } else {
    console.error(formatMessage('error', message), ...args.slice(1));
  }
}

/**
 * Performance logging - measure execution time
 */
export function time(label: string): void {
  if (!config.enabled) return;
  console.time(`${config.prefix} ${label}`);
}

export function timeEnd(label: string): void {
  if (!config.enabled) return;
  console.timeEnd(`${config.prefix} ${label}`);
}

/**
 * Group logging - organize related logs
 */
export function group(label: string): void {
  if (!config.enabled) return;
  console.group(`${config.prefix} ${label}`);
}

export function groupEnd(): void {
  if (!config.enabled) return;
  console.groupEnd();
}

/**
 * Table logging - display tabular data
 */
export function table(data: any): void {
  if (!config.enabled) return;
  console.table(data);
}

// Export a default logger object for convenience
export const logger = {
  debug,
  info,
  warn,
  error,
  time,
  timeEnd,
  group,
  groupEnd,
  table,
};

export default logger;