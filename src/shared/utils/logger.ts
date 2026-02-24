/**
 * Centralized logging utility with namespacing and log levels.
 * Provides consistent formatting and easy filtering in production.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private prefix: string;
  private minLevel: LogLevel;

  constructor(namespace: string, minLevel: LogLevel = 'info') {
    this.prefix = `[BugShot:${namespace}]`;
    this.minLevel = minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel];
  }

  debug(...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.debug(this.prefix, ...args);
    }
  }

  info(...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.info(this.prefix, ...args);
    }
  }

  warn(...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.prefix, ...args);
    }
  }

  error(...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(this.prefix, ...args);
    }
  }

  /** Set minimum log level */
  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }
}

/** Create a logger with the given namespace */
export function createLogger(namespace: string, minLevel?: LogLevel): Logger {
  return new Logger(namespace, minLevel);
}

// Pre-configured loggers for common namespaces
export const jiraLogger = createLogger('Jira');
