/**
 * Token Bucket Rate Limiter
 * Controls the rate of HTTP requests to external services
 */

export class RateLimiter {
  constructor(options = {}) {
    this.requestsPerSecond = options.requestsPerSecond || 2;
    this.burstSize = options.burstSize || 5;
    this.tokens = this.burstSize;
    this.lastRefillTime = Date.now();
    this.queue = [];
    this.isProcessing = false;
  }

  /**
   * Refill tokens based on elapsed time
   */
  refillTokens() {
    const now = Date.now();
    const timePassed = (now - this.lastRefillTime) / 1000;
    const tokensToAdd = Math.floor(timePassed * this.requestsPerSecond);
    
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.burstSize, this.tokens + tokensToAdd);
      this.lastRefillTime = now;
    }
  }

  /**
   * Wait for permission to make a request
   * @returns {Promise<void>}
   */
  async wait() {
    this.refillTokens();

    if (this.tokens > 0) {
      this.tokens--;
      return;
    }

    return new Promise((resolve) => {
      this.queue.push(resolve);
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  /**
   * Process queued requests
   */
  async processQueue() {
    this.isProcessing = true;

    while (this.queue.length > 0) {
      this.refillTokens();

      if (this.tokens > 0) {
        this.tokens--;
        const next = this.queue.shift();
        next();
      } else {
        const delay = 1000 / this.requestsPerSecond;
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    this.isProcessing = false;
  }

  /**
   * Get current rate limiter status
   * @returns {object}
   */
  getStatus() {
    this.refillTokens();
    return {
      tokens: this.tokens,
      burstSize: this.burstSize,
      requestsPerSecond: this.requestsPerSecond,
      queueLength: this.queue.length,
    };
  }

  /**
   * Reset the rate limiter
   */
  reset() {
    this.tokens = this.burstSize;
    this.lastRefillTime = Date.now();
    this.queue = [];
    this.isProcessing = false;
  }
}

/**
 * Per-domain rate limiter manager
 * Maintains separate rate limiters for different domains
 */
export class DomainRateLimiterManager {
  constructor(options = {}) {
    this.defaultOptions = {
      requestsPerSecond: options.requestsPerSecond || 2,
      burstSize: options.burstSize || 5,
    };
    this.limiters = new Map();
  }

  /**
   * Get or create a rate limiter for a domain
   * @param {string} domain
   * @returns {RateLimiter}
   */
  getLimiter(domain) {
    if (!this.limiters.has(domain)) {
      this.limiters.set(domain, new RateLimiter(this.defaultOptions));
    }
    return this.limiters.get(domain);
  }

  /**
   * Wait for permission to make a request to a domain
   * @param {string} url
   * @returns {Promise<void>}
   */
  async wait(url) {
    const domain = new URL(url).hostname;
    const limiter = this.getLimiter(domain);
    return limiter.wait();
  }

  /**
   * Get status for all domain limiters
   * @returns {object}
   */
  getStatus() {
    const status = {};
    for (const [domain, limiter] of this.limiters) {
      status[domain] = limiter.getStatus();
    }
    return status;
  }

  /**
   * Reset all limiters
   */
  reset() {
    for (const limiter of this.limiters.values()) {
      limiter.reset();
    }
    this.limiters.clear();
  }
}

export default RateLimiter;
