interface RequestLike {
  method: string;
  path: string;
  ip?: string;
  socket: { remoteAddress?: string };
}

interface ResponseLike {
  setHeader(name: string, value: string): void;
  status(code: number): { json(body: unknown): void };
}

type NextFunction = () => void;

interface RateLimitRule {
  pattern: RegExp;
  methods: string[];
  limit: number;
  windowMs: number;
}

interface Counter {
  count: number;
  resetAt: number;
}

const RULES: RateLimitRule[] = [
  { pattern: /^\/api\/admin\/auth\/login$/, methods: ["POST"], limit: 10, windowMs: 15 * 60_000 },
  { pattern: /^\/api\/admin\/mobile\/login-and-bind$/, methods: ["POST"], limit: 10, windowMs: 15 * 60_000 },
  { pattern: /^\/api\/auth\/wechat\/login$/, methods: ["POST"], limit: 60, windowMs: 60_000 },
  { pattern: /^\/api\/auth\/me\/phone\/wechat$/, methods: ["POST"], limit: 10, windowMs: 10 * 60_000 },
  { pattern: /^\/api\/registration\/orders$/, methods: ["POST"], limit: 20, windowMs: 60_000 },
  { pattern: /^\/api\/cart\/checkout\/(registration|products)$/, methods: ["POST"], limit: 20, windowMs: 60_000 },
  { pattern: /^\/api\/mall\/orders$/, methods: ["POST"], limit: 20, windowMs: 60_000 },
  { pattern: /^\/api\/payments\/(wechat\/prepay|mock\/confirm)$/, methods: ["POST"], limit: 60, windowMs: 60_000 },
  { pattern: /^\/api\/orders\/[^/]+\/payment-status$/, methods: ["GET"], limit: 120, windowMs: 60_000 },
  { pattern: /^\/api\/mall\/orders\/[^/]+\/payments\/(wechat\/prepay|mock-pay)$/, methods: ["POST"], limit: 60, windowMs: 60_000 },
  { pattern: /^\/api\/mall\/orders\/[^/]+\/payment-status$/, methods: ["GET"], limit: 120, windowMs: 60_000 },
  { pattern: /^\/api\/coupons\/claim$/, methods: ["POST"], limit: 10, windowMs: 60_000 },
  { pattern: /^\/api\/conferences\/[^/]+\/ai\/ask$/, methods: ["POST"], limit: 20, windowMs: 60_000 },
  { pattern: /^\/api\/checkin\/self$/, methods: ["POST"], limit: 10, windowMs: 60_000 },
  { pattern: /^\/api\/checkin\/(scan|staff-scan)$/, methods: ["POST"], limit: 120, windowMs: 60_000 },
  { pattern: /^\/api\/my\/refunds$/, methods: ["POST"], limit: 10, windowMs: 60_000 },
  { pattern: /^\/api\/my\/uploads\/aftersale$/, methods: ["POST"], limit: 20, windowMs: 60_000 },
  { pattern: /^\/api\/my\/mall-aftersales$/, methods: ["POST"], limit: 10, windowMs: 60_000 },
  { pattern: /^\/api\/invoices$/, methods: ["POST"], limit: 10, windowMs: 60_000 },
  { pattern: /^\/api\/notifications\/subscribe$/, methods: ["POST"], limit: 30, windowMs: 60_000 }
];

export function createSensitiveEndpointRateLimiter() {
  const counters = new Map<string, Counter>();
  let lastCleanupAt = 0;

  return (request: RequestLike, response: ResponseLike, next: NextFunction): void => {
    const rule = RULES.find((item) => item.methods.includes(request.method) && item.pattern.test(request.path));
    if (!rule) return next();

    const now = Date.now();
    if (now - lastCleanupAt >= 60_000) {
      for (const [key, counter] of counters) {
        if (counter.resetAt <= now) counters.delete(key);
      }
      lastCleanupAt = now;
    }

    const key = `${request.ip || request.socket.remoteAddress || "unknown"}:${request.method}:${request.path}`;
    const current = counters.get(key);
    const counter = !current || current.resetAt <= now
      ? { count: 1, resetAt: now + rule.windowMs }
      : { count: current.count + 1, resetAt: current.resetAt };
    counters.set(key, counter);

    response.setHeader("RateLimit-Limit", String(rule.limit));
    response.setHeader("RateLimit-Remaining", String(Math.max(0, rule.limit - counter.count)));
    response.setHeader("RateLimit-Reset", String(Math.ceil(counter.resetAt / 1000)));
    if (counter.count <= rule.limit) return next();

    response.setHeader("Retry-After", String(Math.max(1, Math.ceil((counter.resetAt - now) / 1000))));
    response.status(429).json({ code: "TOO_MANY_REQUESTS", message: "请求过于频繁，请稍后再试" });
  };
}
