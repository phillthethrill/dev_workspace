import { getLogger } from './logger';
import { getCache } from './cache';

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: 'ms' | 'count' | 'bytes' | 'percentage';
  timestamp: number;
  tags?: Record<string, string>;
}

export interface RequestMetrics {
  method: string;
  route: string;
  duration: number;
  statusCode: number;
  timestamp: number;
  userAgent?: string;
  ip?: string;
}

export class PerformanceMonitor {
  private metrics = new Map<string, PerformanceMetric[]>();
  private requestMetrics: RequestMetrics[] = [];
  private maxRequestMetrics = 1000;
  private logger = getLogger();

  // Record a performance metric
  recordMetric(name: string, value: number, unit: PerformanceMetric['unit'] = 'ms', tags?: Record<string, string>): void {
    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: Date.now(),
      tags
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    
    this.metrics.get(name)!.push(metric);
    
    // Keep only last 1000 metrics per name
    const metrics = this.metrics.get(name)!;
    if (metrics.length > 1000) {
      metrics.splice(0, metrics.length - 1000);
    }
  }

  // Record request metrics
  recordRequest(metrics: Omit<RequestMetrics, 'timestamp'>): void {
    const requestMetric: RequestMetrics = {
      ...metrics,
      timestamp: Date.now()
    };

    this.requestMetrics.push(requestMetric);
    
    // Keep only recent requests
    if (this.requestMetrics.length > this.maxRequestMetrics) {
      this.requestMetrics.splice(0, this.requestMetrics.length - this.maxRequestMetrics);
    }

    // Log slow requests
    if (requestMetric.duration > 5000) {
      this.logger.warn('Slow request detected', requestMetric);
    }
  }

  // Get metrics summary
  getMetricsSummary(): Record<string, any> {
    const summary: Record<string, any> = {};

    for (const [name, metrics] of this.metrics.entries()) {
      const values = metrics.map(m => m.value);
      const latest = metrics[metrics.length - 1];
      
      summary[name] = {
        count: values.length,
        latest: latest.value,
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        unit: latest.unit,
        timestamp: latest.timestamp
      };
    }

    return summary;
  }

  // Get request analytics
  getRequestAnalytics(timeWindowMs: number = 3600000): RequestAnalytics {
    const cutoff = Date.now() - timeWindowMs;
    const recentRequests = this.requestMetrics.filter(r => r.timestamp > cutoff);
    
    if (recentRequests.length === 0) {
      return {
        totalRequests: 0,
        averageDuration: 0,
        errorRate: 0,
        requestsPerSecond: 0,
        topSlowRoutes: [],
        statusCodeDistribution: {}
      };
    }

    const totalRequests = recentRequests.length;
    const totalDuration = recentRequests.reduce((sum, r) => sum + r.duration, 0);
    const errorRequests = recentRequests.filter(r => r.statusCode >= 400).length;
    const requestsPerSecond = totalRequests / (timeWindowMs / 1000);

    // Route performance analysis
    const routeDurations = new Map<string, number[]>();
    recentRequests.forEach(req => {
      const route = `${req.method} ${req.route}`;
      if (!routeDurations.has(route)) {
        routeDurations.set(route, []);
      }
      routeDurations.get(route)!.push(req.duration);
    });

    const topSlowRoutes = Array.from(routeDurations.entries())
      .map(([route, durations]) => ({
        route,
        averageDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
        count: durations.length
      }))
      .sort((a, b) => b.averageDuration - a.averageDuration)
      .slice(0, 10);

    // Status code distribution
    const statusCodeDistribution: Record<string, number> = {};
    recentRequests.forEach(req => {
      const statusGroup = Math.floor(req.statusCode / 100) * 100;
      const key = `${statusGroup}xx`;
      statusCodeDistribution[key] = (statusCodeDistribution[key] || 0) + 1;
    });

    return {
      totalRequests,
      averageDuration: totalDuration / totalRequests,
      errorRate: (errorRequests / totalRequests) * 100,
      requestsPerSecond,
      topSlowRoutes,
      statusCodeDistribution
    };
  }

  // Start timing a function
  startTimer(name: string): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.recordMetric(name, duration, 'ms');
    };
  }

  // Async timer wrapper
  async timeAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const timer = this.startTimer(name);
    try {
      const result = await fn();
      return result;
    } finally {
      timer();
    }
  }

  // Database query performance tracking
  recordDatabaseQuery(query: string, duration: number, rowCount: number): void {
    this.recordMetric(`db.query.${query}`, duration, 'ms');
    this.recordMetric(`db.rows.${query}`, rowCount, 'count');
    
    // Cache hit rate for database queries
    const cache = getCache();
    const stats = cache.getStats();
    this.recordMetric('cache.hitRate', stats.hitRate, 'percentage');
  }

  // Memory usage tracking
  recordMemoryUsage(): void {
    const memUsage = process.memoryUsage();
    
    this.recordMetric('memory.rss', memUsage.rss, 'bytes');
    this.recordMetric('memory.heapUsed', memUsage.heapUsed, 'bytes');
    this.recordMetric('memory.heapTotal', memUsage.heapTotal, 'bytes');
    this.recordMetric('memory.external', memUsage.external, 'bytes');
  }

  // Event loop lag detection
  startEventLoopMonitoring(): void {
    const interval = setInterval(() => {
      const start = Date.now();
      setImmediate(() => {
        const lag = Date.now() - start;
        this.recordMetric('eventloop.lag', lag, 'ms');
        
        if (lag > 100) {
          this.logger.warn('High event loop lag detected', { lag });
        }
      });
    }, 1000);

    // Clean up on process exit
    process.on('SIGTERM', () => clearInterval(interval));
    process.on('SIGINT', () => clearInterval(interval));
  }

  // Get health status
  getHealthStatus(): HealthStatus {
    const analytics = this.getRequestAnalytics(300000); // Last 5 minutes
    const memoryUsage = process.memoryUsage();
    
    return {
      status: 'healthy',
      uptime: process.uptime(),
      memory: {
        used: memoryUsage.heapUsed,
        total: memoryUsage.heapTotal,
        percentage: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100
      },
      performance: {
        avgRequestDuration: analytics.averageDuration,
        requestsPerSecond: analytics.requestsPerSecond,
        errorRate: analytics.errorRate
      },
      timestamp: Date.now()
    };
  }

  // Generate performance report
  generateReport(): PerformanceReport {
    const memoryUsage = process.memoryUsage();
    const analytics = this.getRequestAnalytics();
    const metrics = this.getMetricsSummary();

    return {
      timestamp: Date.now(),
      uptime: process.uptime(),
      memory: {
        rss: memoryUsage.rss,
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external
      },
      requests: analytics,
      metrics,
      recommendations: this.generateRecommendations(analytics, metrics)
    };
  }

  // Generate optimization recommendations
  private generateRecommendations(analytics: RequestAnalytics, metrics: Record<string, any>): string[] {
    const recommendations: string[] = [];

    if (analytics.errorRate > 5) {
      recommendations.push('High error rate detected. Check error logs and API responses.');
    }

    if (analytics.averageDuration > 1000) {
      recommendations.push('High average response time. Consider database optimization or caching.');
    }

    const slowRoutes = analytics.topSlowRoutes.filter(r => r.averageDuration > 2000);
    if (slowRoutes.length > 0) {
      recommendations.push(`Slow routes detected: ${slowRoutes.map(r => r.route).join(', ')}`);
    }

    // Check memory usage
    const memoryMetrics = Object.keys(metrics).filter(k => k.startsWith('memory.'));
    if (memoryMetrics.length > 0) {
      const heapUsed = metrics['memory.heapUsed']?.latest;
      const heapTotal = metrics['memory.heapTotal']?.latest;
      if (heapUsed && heapTotal && (heapUsed / heapTotal) > 0.8) {
        recommendations.push('High memory usage detected. Consider optimizing memory consumption.');
      }
    }

    return recommendations;
  }
}

export interface RequestAnalytics {
  totalRequests: number;
  averageDuration: number;
  errorRate: number;
  requestsPerSecond: number;
  topSlowRoutes: Array<{
    route: string;
    averageDuration: number;
    count: number;
  }>;
  statusCodeDistribution: Record<string, number>;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  performance: {
    avgRequestDuration: number;
    requestsPerSecond: number;
    errorRate: number;
  };
  timestamp: number;
}

export interface PerformanceReport {
  timestamp: number;
  uptime: number;
  memory: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  requests: RequestAnalytics;
  metrics: Record<string, any>;
  recommendations: string[];
}

// Global performance monitor instance
let performanceMonitor: PerformanceMonitor | null = null;

export function getPerformanceMonitor(): PerformanceMonitor {
  if (!performanceMonitor) {
    performanceMonitor = new PerformanceMonitor();
    performanceMonitor.startEventLoopMonitoring();
    
    // Record memory usage every 30 seconds
    setInterval(() => {
      performanceMonitor!.recordMemoryUsage();
    }, 30000);
  }
  return performanceMonitor;
}