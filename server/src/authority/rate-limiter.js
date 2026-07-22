class SlidingWindowRateLimiter {
  constructor() {
    this.entries = new Map();
  }

  consume(key, options = {}) {
    const now = Number(options.nowMs) || Date.now();
    const windowMs = Math.max(100, Number(options.windowMs) || 1000);
    const limit = Math.max(1, Math.floor(Number(options.limit) || 1));
    const previous = this.entries.get(key) || [];
    const cutoff = now - windowMs;
    const active = previous.filter((timestamp) => timestamp > cutoff);
    if (active.length >= limit) {
      const error = new Error('Command rate limit exceeded.');
      error.code = 'rate_limited';
      error.retryAfterMs = Math.max(1, active[0] + windowMs - now);
      throw error;
    }
    active.push(now);
    this.entries.set(key, active);
  }

  clearPrefix(prefix) {
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }
}

export { SlidingWindowRateLimiter };
