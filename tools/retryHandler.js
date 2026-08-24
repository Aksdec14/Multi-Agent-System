/**
 * Retry Handler with Exponential Backoff and Circuit Breaker
 * Handles transient failures for LLM API calls and HTTP requests
 */

export class RetryHandler {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;
    this.jitterFactor = options.jitterFactor || 0.1;
    this.retryableStatusCodes = options.retryableStatusCodes || [429, 500, 502, 503, 504];
    this.retryableErrors = options.retryableErrors || [
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ECONNREFUSED',
      'socket hang up',
    ];
  }

  /**
   * Calculate delay with exponential backoff and jitter
   * @param {number} attempt - Current attempt number (0-based)
   * @returns {number} Delay in milliseconds
   */
  calculateDelay(attempt) {
    const exponentialDelay = this.baseDelay * Math.pow(2, attempt);
    const jitter = exponentialDelay * this.jitterFactor * (Math.random() * 2 - 1);
    const delay = Math.min(exponentialDelay + jitter, this.maxDelay);
    return Math.max(0, delay);
  }

  /**
   * Check if an error is retryable
   * @param {Error|object} error
   * @returns {boolean}
   */
  isRetryableError(error) {
    if (error.status && this.retryableStatusCodes.includes(error.status)) {
      return true;
    }

    if (error.code && this.retryableErrors.includes(error.code)) {
      return true;
    }

    if (error.message) {
      const messageLower = error.message.toLowerCase();
      if (
        messageLower.includes('rate limit') ||
        messageLower.includes('timeout') ||
        messageLower.includes('temporary') ||
        messageLower.includes('retry')
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Execute a function with retry logic
   * @param {Function} fn - Async function to execute
   * @param {object} options - Additional options
   * @returns {Promise<any>}
   */
  async execute(fn, options = {}) {
    const { onRetry, context = '' } = options;
    let lastError;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt === this.maxRetries || !this.isRetryableError(error)) {
          throw error;
        }

        const delay = this.calculateDelay(attempt);
        console.log(
          `[RetryHandler] ${context ? context + ': ' : ''}Attempt ${attempt + 1} failed: ${error.message}. Retrying in ${Math.round(delay)}ms...`
        );

        if (onRetry) {
          onRetry({ attempt, error, delay });
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
}

/**
 * Circuit Breaker Pattern
 * Prevents cascading failures by stopping requests when failures exceed threshold
 */
export class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000;
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
  }

  /**
   * Check if the circuit is open (blocking requests)
   * @returns {boolean}
   */
  isOpen() {
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'HALF_OPEN';
        return false;
      }
      return true;
    }
    return false;
  }

  /**
   * Record a successful request
   */
  recordSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 3) {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
        console.log('[CircuitBreaker] Circuit closed - service recovered');
      }
    } else if (this.state === 'CLOSED') {
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  /**
   * Record a failed request
   */
  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.successCount = 0;
      console.log('[CircuitBreaker] Circuit opened - half-open test failed');
    } else if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      console.log(
        `[CircuitBreaker] Circuit opened - ${this.failureCount} consecutive failures`
      );
    }
  }

  /**
   * Get circuit breaker status
   * @returns {object}
   */
  getStatus() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  /**
   * Reset the circuit breaker
   */
  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
  }
}

/**
 * Combined Retry with Circuit Breaker
 */
export class RobustRetryHandler {
  constructor(retryOptions = {}, circuitOptions = {}) {
    this.retryHandler = new RetryHandler(retryOptions);
    this.circuitBreaker = new CircuitBreaker(circuitOptions);
  }

  /**
   * Execute with retry and circuit breaker protection
   * @param {Function} fn
   * @param {object} options
   * @returns {Promise<any>}
   */
  async execute(fn, options = {}) {
    if (this.circuitBreaker.isOpen()) {
      throw new Error('[CircuitBreaker] Circuit is open - requests are blocked');
    }

    try {
      const result = await this.retryHandler.execute(fn, options);
      this.circuitBreaker.recordSuccess();
      return result;
    } catch (error) {
      this.circuitBreaker.recordFailure();
      throw error;
    }
  }

  /**
   * Get combined status
   * @returns {object}
   */
  getStatus() {
    return {
      retry: {
        maxRetries: this.retryHandler.maxRetries,
        baseDelay: this.retryHandler.baseDelay,
      },
      circuit: this.circuitBreaker.getStatus(),
    };
  }

  /**
   * Reset both handlers
   */
  reset() {
    this.circuitBreaker.reset();
  }
}

export default RetryHandler;
