import { Request, Response, NextFunction } from 'express';
import { getLogger } from '../utils/logger';
import { getCache } from '../utils/cache';

export interface RateLimitConfig {
  windowMs?: number;
  max?: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}

export class RateLimiter {
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig = {}) {
    this.config = {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100,
      message: 'Too many requests, please try again later',
      ...config
    };
  }

  middleware = (req: Request, res: Response, next: NextFunction) => {
    const cache = getCache();
    const key = this.getKey(req);
    const windowStart = Date.now() - (this.config.windowMs || 15 * 60 * 1000);
    
    // Get current request count for this key
    const keyPrefix = `rate_limit:${key}:`;
    const currentKeys = cache.keys().filter(k => k.startsWith(keyPrefix));
    
    // Remove expired entries
    for (const oldKey of currentKeys) {
      const timestamp = parseInt(oldKey.split(':').pop() || '0');
      if (timestamp < windowStart) {
        cache.delete(oldKey);
      }
    }
    
    // Count current requests
    const currentCount = cache.keys().filter(k => k.startsWith(keyPrefix)).length;
    
    if (currentCount >= (this.config.max || 100)) {
      res.status(429).json({
        error: this.config.message,
        retryAfter: Math.ceil((this.config.windowMs || 15 * 60 * 1000) / 1000)
      });
      return;
    }
    
    // Add current request
    const requestKey = `${keyPrefix}${Date.now()}`;
    cache.set(requestKey, 1, this.config.windowMs);
    
    // Add rate limit headers
    res.set({
      'X-RateLimit-Limit': (this.config.max || 100).toString(),
      'X-RateLimit-Remaining': Math.max(0, (this.config.max || 100) - currentCount - 1).toString(),
      'X-RateLimit-Reset': new Date(Date.now() + (this.config.windowMs || 15 * 60 * 1000)).toISOString()
    });
    
    next();
  };

  private getKey(req: Request): string {
    if (this.config.keyGenerator) {
      return this.config.keyGenerator(req);
    }
    
    // Default: use IP address
    return req.ip || req.connection.remoteAddress || 'unknown';
  }
}

// Input validation middleware
export class InputValidator {
  static validateRequired(fields: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
      const missing: string[] = [];
      
      for (const field of fields) {
        if (!req.body[field] && req.body[field] !== 0) {
          missing.push(field);
        }
      }
      
      if (missing.length > 0) {
        res.status(400).json({
          error: 'Missing required fields',
          fields: missing
        });
        return;
      }
      
      next();
    };
  }

  static validateType(field: string, type: 'string' | 'number' | 'boolean' | 'array' | 'object') {
    return (req: Request, res: Response, next: NextFunction) => {
      const value = req.body[field];
      
      if (value === undefined || value === null) {
        next(); // Skip validation if field is not present
        return;
      }
      
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      
      if (actualType !== type) {
        res.status(400).json({
          error: `Field '${field}' must be of type ${type}`,
          received: actualType
        });
        return;
      }
      
      next();
    };
  }

  static sanitizeInput(req: Request, res: Response, next: NextFunction) {
    const sanitizeString = (str: string): string => {
      return str
        .trim()
        .replace(/[<>]/g, '') // Remove potential HTML tags
        .substring(0, 1000); // Limit length
    };

    const sanitizeObject = (obj: any): any => {
      if (typeof obj === 'string') {
        return sanitizeString(obj);
      }
      if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
      }
      if (typeof obj === 'object' && obj !== null) {
        const sanitized: any = {};
        for (const [key, value] of Object.entries(obj)) {
          sanitized[key] = sanitizeObject(value);
        }
        return sanitized;
      }
      return obj;
    };

    req.body = sanitizeObject(req.body);
    req.query = sanitizeObject(req.query);
    
    next();
  }
}

// Security headers middleware
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // Remove sensitive headers
  res.removeHeader('X-Powered-By');
  
  // Set security headers
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'",
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
  });
  
  next();
}

// API Key authentication middleware
export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string;
  const validApiKeys = (process.env.API_KEYS || '').split(',').filter(k => k.trim());
  
  if (validApiKeys.length === 0) {
    next(); // No API keys configured, allow access
    return;
  }
  
  if (!apiKey || !validApiKeys.includes(apiKey)) {
    res.status(401).json({ error: 'Invalid or missing API key' });
    return;
  }
  
  next();
}

// CORS configuration
export function configureCORS() {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
  
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (allowedOrigins.includes('*')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    res.setHeader('Access-Control-Max-Age', '86400');
    
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }
    
    next();
  };
}

// Error handling middleware
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  const logger = getLogger();
  
  // Log error
  logger.error('Request error:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(isDevelopment && { stack: err.stack })
  });
}

// Health check endpoint rate limiter
export const healthRateLimiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: 'Health check rate limit exceeded'
});

// API rate limiter
export const apiRateLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: 'API rate limit exceeded'
});

// Strict rate limiter for search endpoints
export const searchRateLimiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 searches per minute
  message: 'Search rate limit exceeded'
});

// Export all middleware
export const middleware = {
  securityHeaders,
  configureCORS,
  errorHandler,
  requireApiKey,
  InputValidator,
  RateLimiter
};