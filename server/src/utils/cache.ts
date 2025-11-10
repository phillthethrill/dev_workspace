import { EventEmitter } from 'events';

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
}

export class CacheManager {
  private cache = new Map<string, CacheEntry<any>>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private emitter = new EventEmitter();

  constructor(cleanupIntervalMs: number = 60000) {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, cleanupIntervalMs) as any;
  }

  set<T>(key: string, value: T, ttlMs: number = 300000): void {
    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      ttl: ttlMs
    };

    this.cache.set(key, entry);
    this.emitter.emit('set', key, value);
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.emitter.emit('expired', key);
      return null;
    }

    return entry.value;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.emitter.emit('deleted', key);
    }
    return deleted;
  }

  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.emitter.emit('cleared', size);
  }

  size(): number {
    return this.cache.size;
  }

  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  // Get cache statistics
  getStats() {
    const now = Date.now();
    let expired = 0;
    let valid = 0;

    for (const entry of this.cache.values()) {
      if (now - entry.timestamp > entry.ttl) {
        expired++;
      } else {
        valid++;
      }
    }

    return {
      total: this.cache.size,
      valid,
      expired,
      hitRate: this.hitRate,
      misses: this.misses,
      hits: this.hits
    };
  }

  // Simple performance tracking
  private hits = 0;
  private misses = 0;
  private hitRate = 0;

  private updateHitRate(hit: boolean) {
    if (hit) {
      this.hits++;
    } else {
      this.misses++;
    }
    const total = this.hits + this.misses;
    this.hitRate = total > 0 ? (this.hits / total) * 100 : 0;
  }

  getWithStats<T>(key: string): { value: T | null; hit: boolean; stats: any } {
    const value = this.get<T>(key);
    this.updateHitRate(value !== null);
    
    return {
      value,
      hit: value !== null,
      stats: this.getStats()
    };
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.emitter.emit('cleaned', cleaned);
    }
  }

  // Decorator for function result caching
  memoize<T extends (...args: any[]) => any>(
    fn: T,
    ttlMs: number = 300000,
    keyGenerator?: (...args: Parameters<T>) => string
  ): T {
    return ((...args: Parameters<T>) => {
      const key = keyGenerator ? keyGenerator(...args) : `${fn.name}_${JSON.stringify(args)}`;
      
      const cached = this.get<ReturnType<T>>(key);
      if (cached !== null) {
        return cached;
      }

      const result = fn(...args);
      
      // Handle promises
      if (result && typeof result.then === 'function') {
        return result.then((resolved: any) => {
          this.set(key, resolved, ttlMs);
          return resolved;
        });
      }

      this.set(key, result, ttlMs);
      return result;
    }) as T;
  }

  // Graceful shutdown
  shutdown(): void {
    if (this.cleanupInterval) {
      (this.cleanupInterval as any).unref();
    }
    this.clear();
    this.emitter.removeAllListeners();
  }
}

// Global cache instance
let cacheInstance: CacheManager | null = null;

export function getCache(): CacheManager {
  if (!cacheInstance) {
    cacheInstance = new CacheManager();
  }
  return cacheInstance;
}

// Cache decorators
export function Cacheable(ttlMs: number = 300000) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    
    descriptor.value = function (...args: any[]) {
      const cache = getCache();
      const key = `${target.constructor.name}_${propertyName}_${JSON.stringify(args)}`;
      
      const cached = cache.get(key);
      if (cached !== null) {
        return cached;
      }

      const result = method.apply(this, args);
      
      if (result && typeof result.then === 'function') {
        return result.then((resolved: any) => {
          cache.set(key, resolved, ttlMs);
          return resolved;
        });
      }

      cache.set(key, result, ttlMs);
      return result;
    };
  };
}