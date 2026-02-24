/**
 * Structured HTTP error with status code for reliable error handling.
 */
export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }

  /** Check if this is a client error (4xx) */
  isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  /** Check if this is a rate limit error (429) */
  isRateLimitError(): boolean {
    return this.status === 429;
  }

  /** Check if this is retryable (server errors or rate limits) */
  isRetryable(): boolean {
    return this.status >= 500 || this.status === 429;
  }
}

/**
 * Retry a function with exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelay?: number } = {},
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000 } = options;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;

      // Use structured HttpError for reliable status checking
      if (err instanceof HttpError) {
        // Don't retry client errors (4xx) except rate limits (429)
        if (err.isClientError() && !err.isRateLimitError()) {
          throw err;
        }
      } else if (err instanceof Error) {
        // Fallback: parse status from message for legacy errors
        const statusMatch = err.message.match(/\b(4\d{2}|5\d{2})\b/);
        if (statusMatch) {
          const status = parseInt(statusMatch[1], 10);
          if (status >= 400 && status < 500 && status !== 429) {
            throw err;
          }
        }
      }

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
