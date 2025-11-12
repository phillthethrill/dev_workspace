import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import * as cron from 'node-cron';
import path from 'path';
import fs from 'fs/promises';
import apiRoutes from './routes/api';
import embedRoutes from './routes/embed';
import { getOptimizedDatabase } from './utils/optimized-database';
import { TMDBClient } from './services/tmdb-client';
import { GermanVODChecker } from './services/german-vod-checker';
import { AudibleManager } from './services/audible-manager';
import { getLogger } from './utils/logger';
import { getCache } from './utils/cache';
import { getPerformanceMonitor } from './utils/performance-monitor';
import { 
  securityHeaders, 
  configureCORS, 
  errorHandler, 
  requireApiKey,
  healthRateLimiter,
  apiRateLimiter,
  searchRateLimiter,
  InputValidator
} from './middleware/security';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Enhanced configuration
const CONFIG = {
  tmdb_api_key: process.env.TMDB_API_KEY || '',
  justwatch_country: 'DE',
  timezone: 'Europe/Berlin',
  update_interval: process.env.UPDATE_INTERVAL || '0 */6 * * *', // Every 6 hours
  audible_library_path: process.env.AUDIBLE_LIBRARY_PATH || './data/audible_library.xlsx',
  node_env: process.env.NODE_ENV || 'development',
  max_request_size: process.env.MAX_REQUEST_SIZE || '10mb',
  rate_limit_window: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'), // 15 minutes
  rate_limit_max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  cache_ttl: parseInt(process.env.CACHE_TTL || '300000'), // 5 minutes
  enable_compression: process.env.ENABLE_COMPRESSION !== 'false',
  enable_cors: process.env.ENABLE_CORS !== 'false',
  enable_helmet: process.env.ENABLE_HELMET !== 'false',
  health_check_interval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'), // 30 seconds
};

// Initialize services
const logger = getLogger();
const cache = getCache();
const performanceMonitor = getPerformanceMonitor();
const db = getOptimizedDatabase();

// Security and performance middleware
if (CONFIG.enable_helmet) {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://api.themoviedb.org", "https://www.justwatch.com"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));
}

if (CONFIG.enable_compression) {
  app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    }
  }));
}

if (CONFIG.enable_cors) {
  app.use(configureCORS());
}

app.use(securityHeaders);
app.use(express.json({ 
  limit: CONFIG.max_request_size,
  type: 'application/json'
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: CONFIG.max_request_size 
}));

// Request logging and performance monitoring
app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    performanceMonitor.recordRequest({
      method: req.method,
      route: req.path,
      duration,
      statusCode: res.statusCode,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
  });
  
  next();
});

// Static file serving with caching
app.use('/public', express.static(path.join(__dirname, '../public'), {
  etag: true,
  lastModified: true,
  maxAge: '1h',
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Health check endpoint with rate limiting
app.get('/health', healthRateLimiter.middleware, async (req: Request, res: Response) => {
  try {
    const health = performanceMonitor.getHealthStatus();
    const dbHealthy = await db.healthCheck();
    
    const response = {
      ...health,
      db: dbHealthy ? 'ok' : 'error',
      cache: {
        status: 'ok',
        size: cache.size(),
        hitRate: cache.getStats().hitRate
      }
    };

    res.status(dbHealthy && health.status === 'healthy' ? 200 : 503).json(response);
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({ 
      status: 'unhealthy', 
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Performance monitoring endpoint
app.get('/metrics', apiRateLimiter.middleware, async (req: Request, res: Response) => {
  try {
    const report = performanceMonitor.generateReport();
    res.json(report);
  } catch (error) {
    logger.error('Metrics endpoint error:', error);
    res.status(500).json({ error: 'Failed to generate metrics' });
  }
});

// API routes with enhanced security
app.use('/api', requireApiKey, apiRateLimiter.middleware, apiRoutes);

// Embed routes with search rate limiting
app.use('/embed', searchRateLimiter.middleware, embedRoutes);

// Serve the frontend with proper caching
app.get('/', (req: Request, res: Response) => {
  const indexPath = path.join(__dirname, '../public/index.html');
  res.sendFile(indexPath);
});

// Error handling middleware
app.use(errorHandler);

// Enhanced background update functions with performance monitoring
async function updateShowEpisodes(): Promise<void> {
  const timer = performanceMonitor.startTimer('update_show_episodes');
  
  try {
    const dbCacheKey = 'shows_airing_cached';
    let shows = cache.get(dbCacheKey) as any[];

    if (!shows) {
      shows = await db.cachedQuery(
        'shows_airing_cached',
        `SELECT * FROM shows
        WHERE status = 'airing' AND next_date IS NOT NULL
        ORDER BY next_date ASC`,
        [],
        600000
      ); // Cache for 10 minutes
      cache.set(dbCacheKey, shows, 600000);
    }

    const tmdb = new TMDBClient(CONFIG.tmdb_api_key);

    for (const show of shows) {
      const showTimer = performanceMonitor.startTimer(`tmdb_show_${show.tmdb_id}`);
      
      try {
        const details = await tmdb.getTVDetails(show.tmdb_id);
        if (details && details.seasons) {
          const lastSeason = details.seasons[details.seasons.length - 1];
          if (lastSeason) {
            const seasonDetails = await tmdb.getSeasonDetails(show.tmdb_id, lastSeason.season_number);

            if (seasonDetails && seasonDetails.episodes) {
              const now = new Date();
              let nextEpisode = null;

              for (const episode of seasonDetails.episodes) {
                if (episode.air_date) {
                  const airDate = new Date(episode.air_date);
                  if (airDate > now) {
                    nextEpisode = episode;
                    break;
                  }
                }
              }

              if (nextEpisode) {
                await db.run(`
                  UPDATE shows SET
                    season = ?,
                    next_episode = ?,
                    next_date = ?,
                    updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?
                `, [
                  lastSeason.season_number,
                  nextEpisode.episode_number,
                  nextEpisode.air_date,
                  show.id
                ]);

                // Invalidate cache
                cache.delete(dbCacheKey);
              }
            }
          }
        }
      } catch (error) {
        logger.error(`Error updating show ${show.title}:`, error);
      } finally {
        showTimer();
        // Rate limiting delay
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  } finally {
    timer();
  }
}

async function updateMovieReleases(): Promise<void> {
  const timer = performanceMonitor.startTimer('update_movie_releases');
  
  try {
    const cacheKey = 'upcoming_movies_cached';
    let movies = cache.get(cacheKey) as any[];

    if (!movies) {
      const tmdb = new TMDBClient(CONFIG.tmdb_api_key);
      movies = await tmdb.getUpcomingMovies();
      cache.set(cacheKey, movies, 300000); // Cache for 5 minutes
    }

    const vodChecker = new GermanVODChecker();

    for (const movie of movies.slice(0, 10)) {
      const movieTimer = performanceMonitor.startTimer(`vod_check_${movie.id}`);
      
      try {
        const services = await vodChecker.checkMovieAvailability(movie);

        await db.run(`
          INSERT OR REPLACE INTO movies (
            tmdb_id, title, release_date, service, german_available,
            poster_url, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [
          movie.id,
          movie.title,
          movie.release_date,
          services.join(','),
          services.length > 0 ? 1 : 0,
          movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null
        ]);

      } catch (error) {
        logger.error(`Error updating movie ${movie.title}:`, error);
      } finally {
        movieTimer();
      }
    }
  } finally {
    timer();
  }
}

async function checkAudiobookReleases(): Promise<void> {
  const timer = performanceMonitor.startTimer('check_audiobook_releases');
  
  try {
    // This would involve checking for new releases
    // For now, we'll just log that we're checking
    logger.info('Checking for new audiobook releases...');
    
    // In a real implementation, this would:
    // 1. Check external APIs for new releases
    // 2. Compare with existing database entries
    // 3. Add new releases to the database
    // 4. Send notifications if configured
    
  } finally {
    timer();
  }
}

// Enhanced scheduled updates with better error handling
cron.schedule(CONFIG.update_interval, async () => {
  const timer = performanceMonitor.startTimer('scheduled_update');
  const logger = getLogger();
  
  logger.info('Starting scheduled data update...');

  try {
    await Promise.allSettled([
      updateShowEpisodes(),
      updateMovieReleases(),
      checkAudiobookReleases()
    ]);
    
    logger.info('Scheduled data update completed');
    
    // Optimize database after updates
    setTimeout(async () => {
      try {
        await db.analyze();
        await db.vacuum();
        logger.info('Database optimization completed');
      } catch (error) {
        logger.error('Database optimization failed:', error);
      }
    }, 5000);
    
  } catch (error) {
    logger.error('Scheduled data update error:', error);
  } finally {
    timer();
  }
});

// Graceful startup and shutdown
async function startServer(): Promise<void> {
  try {
    // Ensure directories exist
    await fs.mkdir('./data', { recursive: true });
    await fs.mkdir('./public', { recursive: true });

    // Initialize database with optimizations
    await db.init();
    logger.info('Database initialized with optimizations');

    // Start server
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 Optimized Media Tracker Server running on port ${PORT}`);
      logger.info(`📱 Environment: ${CONFIG.node_env}`);
      logger.info(`🔄 Auto-updates: ${CONFIG.update_interval}`);
      logger.info(`🕐 Timezone: ${CONFIG.timezone}`);
      logger.info(`⚡ Performance monitoring enabled`);
    });

    // Warm up caches
    setTimeout(async () => {
      try {
        await updateShowEpisodes();
        await updateMovieReleases();
        logger.info('Cache warmup completed');
      } catch (error) {
        logger.error('Cache warmup failed:', error);
      }
    }, 2000);

  } catch (error) {
    logger.error('Server startup error:', error);
    process.exit(1);
  }
}

// Enhanced graceful shutdown
process.on('SIGTERM', async () => {
  const logger = getLogger();
  logger.info('SIGTERM received, shutting down gracefully...');
  
  try {
    // Stop accepting new requests
    const server = app.get('server');
    if (server) {
      server.close();
    }
    
    // Close database connections
    await db.close();
    
    // Shutdown performance monitor
    const performanceMonitor = getPerformanceMonitor();
    performanceMonitor.recordMetric('shutdown', Date.now(), 'ms');
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  const logger = getLogger();
  logger.info('SIGINT received, shutting down gracefully...');
  
  try {
    const server = app.get('server');
    if (server) {
      server.close();
    }
    
    await db.close();
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  const logger = getLogger();
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  const logger = getLogger();
  logger.error('Unhandled Rejection', { reason, promise });
  process.exit(1);
});

startServer();